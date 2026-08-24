import express from 'express';
import request from 'supertest';
import twilio from 'twilio';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../server/config.js';
import { prisma } from '../server/lib/prisma.js';
import { createTwilioWebhookHandler } from '../server/routes/api.js';
import { processTwilioInbound, redactWhatsAppAddress, verifyTwilioSignature, type TwilioSendResult, type TwilioTextSender } from '../server/services/twilio.js';

const webhookPath = '/api/webhooks/twilio/whatsapp';
// Endereços deliberadamente não roteáveis, usados apenas na assinatura de testes.
const from = 'whatsapp:+00000000000';
const to = 'whatsapp:+00000000001';
let sentSequence = 0;
const sendText = vi.fn<TwilioTextSender>(async (_recipient, _text) => ({
  sid: `SMoutbound${String(++sentSequence).padStart(24, '0')}`,
  status: 'queued',
}));

const app = express();
app.post(webhookPath, express.urlencoded({ extended: false, limit: '64kb' }), createTwilioWebhookHandler(sendText));

async function resetDatabase() {
  await prisma.review.deleteMany();
  await prisma.studyLog.deleteMany();
  await prisma.focusSession.deleteMany();
  await prisma.reminder.deleteMany();
  await prisma.message.deleteMany();
  await prisma.conversationSession.deleteMany();
  await prisma.appSettings.deleteMany();
  await prisma.appSettings.create({ data: { id: 1, timezone: 'America/Sao_Paulo', appMode: 'LOCAL' } });
  sendText.mockClear();
  sentSequence = 0;
}

function signedForm(messageSid: string, body: string) {
  const form = { MessageSid: messageSid, From: from, To: to, Body: body };
  const signature = twilio.getExpectedTwilioSignature(
    env.TWILIO_AUTH_TOKEN as string,
    env.TWILIO_WEBHOOK_URL as string,
    form,
  );
  return { form, signature };
}

function postTwilio(messageSid: string, body: string) {
  const signed = signedForm(messageSid, body);
  return request(app)
    .post(webhookPath)
    .set('X-Twilio-Signature', signed.signature)
    .type('form')
    .send(signed.form);
}

beforeEach(resetDatabase);
afterAll(async () => prisma.$disconnect());

describe('integração Twilio WhatsApp', () => {
  it('valida a assinatura oficial usando a URL pública exata e rejeita adulteração', () => {
    const { form, signature } = signedForm(`SMinbound${'1'.repeat(24)}`, 'O que tenho hoje?');
    expect(verifyTwilioSignature(signature, form)).toBe(true);
    expect(verifyTwilioSignature(signature, { ...form, Body: 'conteúdo adulterado' })).toBe(false);
    expect(redactWhatsAppAddress(from)).toBe('whatsapp:***0000');
  });

  it('rejeita webhook sem assinatura antes de persistir ou enviar', async () => {
    await request(app).post(webhookPath).type('form').send({ MessageSid: 'SMinvalid', From: from, To: to, Body: 'Olá' }).expect(401);
    expect(await prisma.message.count()).toBe(0);
    expect(sendText).not.toHaveBeenCalled();
  });

  it('processa, responde, persiste e não repete o mesmo MessageSid', async () => {
    const sid = `SMinbound${'2'.repeat(24)}`;
    const first = await postTwilio(sid, 'Me lembre da aula de Power BI 30/08/2027 às 9h.').expect(200);
    expect(first.headers['content-type']).toContain('text/xml');
    expect(first.text).toContain('<Response></Response>');
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(sendText.mock.calls[0]?.[0]).toBe(from);
    expect(sendText.mock.calls[0]?.[1]).toContain('Combinado');
    expect(sendText.mock.calls[0]?.[2]).toBe(to);
    expect(await prisma.reminder.count({ where: { category: 'CLASS', source: 'TWILIO' } })).toBe(1);
    expect(await prisma.message.count({ where: { channel: 'TWILIO' } })).toBe(2);
    expect(await prisma.message.count({ where: { status: 'SENT' } })).toBe(1);

    await postTwilio(sid, 'Me lembre da aula de Power BI 30/08/2027 às 9h.').expect(200);
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(await prisma.reminder.count()).toBe(1);
    expect(await prisma.message.count()).toBe(2);
  });

  it('impede envio concorrente enquanto o primeiro processamento ainda está ativo', async () => {
    const sid = `SM${'8'.repeat(32)}`;
    const form = signedForm(sid, 'Me lembre de revisar inglês 30/08/2027 às 10h.').form;
    let releaseSend: ((value: TwilioSendResult) => void) | undefined;
    const blockedSender = vi.fn<TwilioTextSender>(() => new Promise((resolve) => {
      releaseSend = resolve;
    }));

    const first = processTwilioInbound(form, blockedSender);
    await vi.waitFor(async () => {
      expect(await prisma.message.count({ where: { status: 'SENDING' } })).toBe(1);
    });
    const duplicate = await processTwilioInbound(form, blockedSender);
    expect(duplicate).toMatchObject({ duplicate: true, sent: false, retryLater: true });
    expect(blockedSender).toHaveBeenCalledTimes(1);
    expect(await prisma.reminder.count()).toBe(1);

    releaseSend?.({ sid: `SM${'9'.repeat(32)}`, status: 'queued' });
    await first;
    expect(await prisma.message.count({ where: { status: 'SENT' } })).toBe(1);
  });

  it('reutiliza o motor para agenda, foco, estudo e adiamento contextual', async () => {
    await postTwilio(`SM${'3'.repeat(32)}`, 'O que tenho hoje?').expect(200);
    expect(sendText.mock.calls.at(-1)?.[1]).toContain('não tem compromissos');

    await postTwilio(`SM${'4'.repeat(32)}`, 'Marque o post do EDY RECON para 30/08/2027 às 12h.').expect(200);
    const originalDueAt = (await prisma.reminder.findFirstOrThrow({ where: { category: 'PUBLICATION' } })).dueAt.getTime();
    await postTwilio(`SM${'5'.repeat(32)}`, 'Adie esse lembrete por 15 minutos.').expect(200);
    const delayed = await prisma.reminder.findFirstOrThrow({ where: { category: 'PUBLICATION' } });
    expect(delayed.dueAt.getTime() - originalDueAt).toBe(15 * 60 * 1000);

    await postTwilio(`SM${'6'.repeat(32)}`, 'Iniciar foco de 60 minutos estudando matemática para o ENEM.').expect(200);
    await postTwilio(`SM${'7'.repeat(32)}`, 'Registre 20 questões e 15 acertos.').expect(200);
    expect(await prisma.studyLog.count({ where: { questions: 20, correctAnswers: 15 } })).toBe(1);
    expect(await prisma.review.count()).toBe(5);
    expect(sendText).toHaveBeenCalledTimes(5);
  });
});
