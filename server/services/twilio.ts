import twilio from 'twilio';
import { z } from 'zod';
import { env } from '../config.js';
import { ApiError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { processChat } from './chat.js';

const inboundSchema = z.object({
  MessageSid: z.string().trim().min(1).max(80),
  From: z.string().trim().regex(/^whatsapp:\+\d{8,15}$/),
  To: z.string().trim().regex(/^whatsapp:\+\d{8,15}$/).optional(),
  Body: z.string().trim().min(1).max(4096),
}).passthrough();

export type TwilioInboundMessage = z.infer<typeof inboundSchema>;
export type TwilioSendResult = { sid: string; status?: string | null; deliveryMode?: 'text' | 'trial-template' };
export type TwilioTextSender = (to: string, text: string, from?: string) => Promise<TwilioSendResult>;

export function twilioReadiness() {
  return {
    configured: Boolean(
      env.TWILIO_ACCOUNT_SID
      && env.TWILIO_AUTH_TOKEN
      && env.TWILIO_WHATSAPP_FROM
      && env.TWILIO_WEBHOOK_URL
    ),
    hasAccountSid: Boolean(env.TWILIO_ACCOUNT_SID),
    hasAuthToken: Boolean(env.TWILIO_AUTH_TOKEN),
    hasFrom: Boolean(env.TWILIO_WHATSAPP_FROM),
    hasTo: Boolean(env.TWILIO_WHATSAPP_TO),
    hasWebhookUrl: Boolean(env.TWILIO_WEBHOOK_URL),
  };
}

export function verifyTwilioSignature(signature: string | undefined, params: Record<string, string>) {
  if (!env.TWILIO_AUTH_TOKEN || !env.TWILIO_WEBHOOK_URL || !signature) return false;
  return twilio.validateRequest(env.TWILIO_AUTH_TOKEN, signature, env.TWILIO_WEBHOOK_URL, params);
}

function whatsappAddress(value: string) {
  const normalized = value.startsWith('whatsapp:') ? value : `whatsapp:+${value.replace(/\D/g, '')}`;
  if (!/^whatsapp:\+\d{8,15}$/.test(normalized)) {
    throw new ApiError(400, 'INVALID_WHATSAPP_ADDRESS', 'Endereço de WhatsApp inválido.');
  }
  return normalized;
}

export function redactWhatsAppAddress(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  return `whatsapp:***${digits.slice(-4)}`;
}

export async function sendTwilioText(to: string, text: string, from?: string): Promise<TwilioSendResult> {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_WHATSAPP_FROM) {
    throw new ApiError(503, 'TWILIO_NOT_CONFIGURED', 'Credenciais do Twilio ainda não configuradas.');
  }
  const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN, { timeout: 15_000 });
  const addressing = {
    from: whatsappAddress(from ?? env.TWILIO_WHATSAPP_FROM),
    to: whatsappAddress(to),
  };
  const message = await client.messages.create(env.TWILIO_CONTENT_SID
    ? { ...addressing, contentSid: env.TWILIO_CONTENT_SID }
    : { ...addressing, body: text });
  return {
    sid: message.sid,
    status: message.status,
    deliveryMode: env.TWILIO_CONTENT_SID ? 'trial-template' : 'text',
  };
}

function outboundFromMetadata(metadataJson: string | null) {
  if (!metadataJson) return undefined;
  try {
    const metadata = JSON.parse(metadataJson) as { outboundMessageId?: unknown };
    return typeof metadata.outboundMessageId === 'string' ? metadata.outboundMessageId : undefined;
  } catch {
    return undefined;
  }
}

function parseMetadata(metadataJson: string | null) {
  if (!metadataJson) return {} as Record<string, unknown>;
  try {
    const value = JSON.parse(metadataJson) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function isStaleSending(metadataJson: string | null) {
  const sendingAt = parseMetadata(metadataJson).sendingAt;
  return typeof sendingAt !== 'string' || Date.now() - new Date(sendingAt).getTime() >= 60_000;
}

async function findDuplicateOutbound(inbound: { sessionId: string; createdAt: Date; metadataJson: string | null }) {
  const linkedId = outboundFromMetadata(inbound.metadataJson);
  if (linkedId) return prisma.message.findUnique({ where: { id: linkedId } });
  return prisma.message.findFirst({
    where: {
      sessionId: inbound.sessionId,
      direction: 'OUTBOUND',
      channel: 'TWILIO',
      createdAt: { gte: inbound.createdAt },
    },
    orderBy: { createdAt: 'asc' },
  });
}

export async function processTwilioInbound(rawInput: unknown, sendText: TwilioTextSender = sendTwilioText) {
  const input = inboundSchema.parse(rawInput);
  const result = await processChat(input.Body, {
    channel: 'TWILIO',
    externalUserId: input.From,
    externalId: input.MessageSid,
  });

  const outbound = result.outbound ?? (result.duplicate ? await findDuplicateOutbound(result.inbound) : undefined);
  if (!outbound || outbound.status === 'SENT') {
    return { duplicate: Boolean(result.duplicate), sent: false, inbound: result.inbound, outbound };
  }

  if (!result.duplicate) {
    await prisma.message.update({
      where: { id: result.inbound.id },
      data: { metadataJson: JSON.stringify({ provider: 'twilio', outboundMessageId: outbound.id }) },
    });
  }
  if (outbound.status === 'SENDING') {
    if (!isStaleSending(outbound.metadataJson)) {
      return { duplicate: Boolean(result.duplicate), sent: false, retryLater: true, inbound: result.inbound, outbound };
    }
    const released = await prisma.message.updateMany({
      where: { id: outbound.id, status: 'SENDING' },
      data: { status: 'FAILED' },
    });
    if (!released.count) {
      return { duplicate: Boolean(result.duplicate), sent: false, retryLater: true, inbound: result.inbound, outbound };
    }
  }

  const sendingAt = new Date().toISOString();
  const claimed = await prisma.message.updateMany({
    where: { id: outbound.id, status: { in: ['DELIVERED', 'FAILED'] } },
    data: {
      status: 'SENDING',
      metadataJson: JSON.stringify({ ...parseMetadata(outbound.metadataJson), provider: 'twilio', sendingAt }),
    },
  });
  if (!claimed.count) {
    return { duplicate: Boolean(result.duplicate), sent: false, retryLater: true, inbound: result.inbound, outbound };
  }

  try {
    // O Trial atual pode atribuir um número diferente por destinatário. Responder
    // pelo endereço que recebeu o inbound mantém a conversa na mesma janela de 24 h.
    const sent = await sendText(input.From, outbound.text, input.To);
    await prisma.message.update({
      where: { id: outbound.id },
      data: {
        status: 'SENT',
        externalId: sent.sid,
        metadataJson: JSON.stringify({
          ...parseMetadata(outbound.metadataJson),
          provider: 'twilio',
          sendingAt,
          sentAt: new Date().toISOString(),
          twilioStatus: sent.status ?? null,
          deliveryMode: sent.deliveryMode ?? 'text',
        }),
      },
    });
    console.info(`[twilio] resposta enviada para ${redactWhatsAppAddress(input.From)} (${input.MessageSid.slice(0, 6)}...)`);
    return { duplicate: Boolean(result.duplicate), sent: true, inbound: result.inbound, outbound, externalId: sent.sid };
  } catch (error) {
    await prisma.message.update({ where: { id: outbound.id }, data: { status: 'FAILED' } });
    const errorCode = typeof error === 'object' && error && 'code' in error ? String(error.code) : 'SEND_FAILED';
    console.error(`[twilio] falha de envio para ${redactWhatsAppAddress(input.From)} (código ${errorCode})`);
    throw new ApiError(502, 'TWILIO_SEND_FAILED', 'Não foi possível enviar a resposta pelo Twilio.');
  }
}
