import express, { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/errors.js';
import { dayRangeUtc, weekRangeUtc } from '../lib/time.js';
import { createReminder, listReminders, mutateReminder } from '../services/reminders.js';
import { finishFocus, getCurrentFocus, startFocus } from '../services/focus.js';
import { completeReview, createStudyLog, listStudies } from '../services/studies.js';
import { createStudyModule, listStudyModules, updateStudyModule } from '../services/study-modules.js';
import { buildReport } from '../services/reports.js';
import { processChat } from '../services/chat.js';
import { extractWebhookMessages, safeWhatsAppErrorCode, sendWhatsAppText, verifyMetaSignature, whatsappReadiness } from '../services/whatsapp.js';
import { env } from '../config.js';
import { processTwilioInbound, type TwilioTextSender, verifyTwilioSignature } from '../services/twilio.js';

export const apiRouter = Router();

const dateValue = z.string().datetime({ offset: true }).transform((value) => new Date(value));

apiRouter.get('/health', async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ data: { status: 'ok', service: 'EDY Assist API', mode: (await getSettings()).appMode, timezone: (await getSettings()).timezone, timestamp: new Date() } });
});

async function getSettings() {
  return prisma.appSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}

apiRouter.get('/dashboard', async (_req, res) => {
  const settings = await getSettings();
  const today = dayRangeUtc(new Date(), settings.timezone);
  const week = weekRangeUtc(new Date(), settings.timezone);
  const [todayReminders, weekReminders, overdueReminders, currentFocus, recentStudies, reviews, dailyReport, weeklyReport] = await Promise.all([
    listReminders({ from: today.from, to: today.to }),
    listReminders({ from: week.from, to: week.to, status: 'PENDING' }),
    listReminders({ to: today.from, status: 'PENDING' }),
    getCurrentFocus(),
    listStudies({ from: today.from, to: today.to }),
    prisma.review.findMany({ where: { status: 'PENDING', dueAt: { lte: today.to } }, take: 10, orderBy: { dueAt: 'asc' } }),
    buildReport('daily', settings.timezone),
    buildReport('weekly', settings.timezone),
  ]);
  res.json({ data: { todayReminders, weekReminders, overdueReminders, currentFocus, recentStudies, reviews, dailyReport, weeklyReport, settings: { ...settings, whatsapp: whatsappReadiness() } } });
});

apiRouter.get('/reminders', async (req, res) => {
  const query = z.object({ from: z.string().datetime({ offset: true }).optional(), to: z.string().datetime({ offset: true }).optional(), status: z.string().optional(), category: z.string().optional() }).parse(req.query);
  const data = await listReminders({ from: query.from ? new Date(query.from) : undefined, to: query.to ? new Date(query.to) : undefined, status: query.status, category: query.category });
  res.json({ data });
});

apiRouter.post('/reminders', async (req, res) => {
  const input = z.object({
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().max(1000).optional(),
    category: z.enum(['GENERAL', 'CLASS', 'TASK', 'PUBLICATION', 'HEALTH']).default('GENERAL'),
    dueAt: dateValue,
    recurrence: z.enum(['NONE', 'DAILY', 'WEEKLY', 'MONTHLY']).default('NONE'),
    recurrenceInterval: z.number().int().min(1).max(365).default(1),
  }).parse(req.body);
  res.status(201).json({ data: await createReminder(input) });
});

apiRouter.patch('/reminders/:id', async (req, res) => {
  const input = z.discriminatedUnion('action', [
    z.object({ action: z.literal('complete') }),
    z.object({ action: z.literal('cancel') }),
    z.object({ action: z.literal('snooze'), minutes: z.number().int().min(1).max(10_080).default(15) }),
    z.object({ action: z.literal('reschedule'), dueAt: dateValue }),
  ]).parse(req.body);
  const actionMap = { complete: 'COMPLETE', cancel: 'CANCEL', snooze: 'SNOOZE', reschedule: 'RESCHEDULE' } as const;
  res.json({ data: await mutateReminder(req.params.id as string, actionMap[input.action], 'minutes' in input || 'dueAt' in input ? input : {}) });
});

apiRouter.get('/focus/current', async (_req, res) => res.json({ data: await getCurrentFocus() }));

apiRouter.post('/focus/start', async (req, res) => {
  const input = z.object({ durationMinutes: z.number().int().min(1).max(720), subject: z.string().trim().max(120).optional(), track: z.string().trim().max(80).optional(), objective: z.string().trim().max(300).optional() }).parse(req.body);
  res.status(201).json({ data: await startFocus(input) });
});

apiRouter.post('/focus/:id/finish', async (req, res) => {
  const input = z.object({ cancelled: z.boolean().default(false) }).parse(req.body ?? {});
  res.json({ data: await finishFocus(req.params.id as string, input.cancelled) });
});

apiRouter.get('/studies', async (req, res) => {
  const query = z.object({ from: z.string().datetime({ offset: true }).optional(), to: z.string().datetime({ offset: true }).optional(), track: z.string().optional() }).parse(req.query);
  res.json({ data: await listStudies({ from: query.from ? new Date(query.from) : undefined, to: query.to ? new Date(query.to) : undefined, track: query.track }) });
});

apiRouter.post('/studies', async (req, res) => {
  const input = z.object({
    focusSessionId: z.string().optional(), subject: z.string().trim().min(1).max(120), track: z.string().trim().min(1).max(80), objective: z.string().trim().max(300).optional(), activityType: z.enum(['STUDY', 'CLASS', 'REVIEW']).default('STUDY'), notes: z.string().trim().max(2000).optional(), difficulty: z.number().int().min(1).max(5).optional(), durationMinutes: z.number().int().min(0).max(1440).default(0), questions: z.number().int().min(0).max(10000).default(0), correctAnswers: z.number().int().min(0).max(10000).default(0), studiedAt: dateValue.optional(),
  }).parse(req.body);
  res.status(201).json({ data: await createStudyLog(input) });
});

const moduleInput = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(300).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  topics: z.array(z.string().trim().min(1).max(120)).max(120).optional(),
  goalMinutes: z.number().int().min(30).max(10080).optional(),
  isArchived: z.boolean().optional(),
});

apiRouter.get('/study-modules', async (req, res) => {
  const query = z.object({ includeArchived: z.enum(['true', 'false']).default('false') }).parse(req.query);
  res.json({ data: await listStudyModules(query.includeArchived === 'true') });
});

apiRouter.post('/study-modules', async (req, res) => {
  res.status(201).json({ data: await createStudyModule(moduleInput.parse(req.body)) });
});

apiRouter.patch('/study-modules/:id', async (req, res) => {
  res.json({ data: await updateStudyModule(req.params.id as string, moduleInput.partial().parse(req.body)) });
});

apiRouter.get('/reviews', async (req, res) => {
  const query = z.object({ status: z.string().default('PENDING') }).parse(req.query);
  res.json({ data: await prisma.review.findMany({ where: { status: query.status }, include: { studyLog: true }, orderBy: { dueAt: 'asc' } }) });
});

apiRouter.patch('/reviews/:id/complete', async (req, res) => res.json({ data: await completeReview(req.params.id as string) }));

apiRouter.get('/reports', async (req, res) => {
  const query = z.object({ period: z.enum(['daily', 'weekly']).default('weekly'), reference: z.string().datetime({ offset: true }).optional() }).parse(req.query);
  const settings = await getSettings();
  res.json({ data: await buildReport(query.period, settings.timezone, query.reference ? new Date(query.reference) : new Date()) });
});

apiRouter.get('/messages', async (req, res) => {
  const query = z.object({ sessionId: z.string().optional(), limit: z.coerce.number().int().min(1).max(500).default(100) }).parse(req.query);
  const data = await prisma.message.findMany({ where: { sessionId: query.sessionId }, take: query.limit, orderBy: { createdAt: 'asc' } });
  res.json({ data });
});

apiRouter.post('/chat', async (req, res) => {
  const input = z.object({ text: z.string().trim().min(1).max(2000), sessionId: z.string().optional() }).parse(req.body);
  const result = await processChat(input.text, { sessionId: input.sessionId, channel: 'LOCAL' });
  res.status(201).json({ data: result });
});

apiRouter.get('/settings', async (_req, res) => {
  const settings = await getSettings();
  res.json({ data: { ...settings, whatsapp: whatsappReadiness() } });
});

apiRouter.patch('/settings', async (req, res) => {
  const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
  const input = z.object({
    appMode: z.enum(['LOCAL', 'WHATSAPP']).optional(), timezone: z.string().min(1).max(80).optional(), quietEnabled: z.boolean().optional(), quietStart: time.optional(), quietEnd: time.optional(), waterReminderEnabled: z.boolean().optional(), whatsappRecipient: z.string().regex(/^\d{8,15}$/).nullable().optional(), dailySummaryTime: time.optional(), weeklySummaryDay: z.number().int().min(0).max(6).optional(), weeklySummaryTime: time.optional(),
  }).parse(req.body);
  if (input.appMode === 'WHATSAPP' && !whatsappReadiness().configured) throw new ApiError(409, 'WHATSAPP_NOT_CONFIGURED', 'Selecione e configure o provedor WhatsApp no arquivo .env antes de ativar esse modo.');
  const data = await prisma.appSettings.upsert({ where: { id: 1 }, update: input, create: { id: 1, ...input } });
  res.json({ data: { ...data, whatsapp: whatsappReadiness() } });
});

apiRouter.get('/whatsapp/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && env.META_VERIFY_TOKEN && token === env.META_VERIFY_TOKEN) {
    res.status(200).send(String(challenge ?? ''));
    return;
  }
  res.sendStatus(403);
});

apiRouter.post('/whatsapp/webhook', async (req, res) => {
  if (!verifyMetaSignature(req.rawBody, req.header('x-hub-signature-256'))) {
    res.status(401).json({ error: { code: 'INVALID_SIGNATURE', message: 'Assinatura do webhook inválida.' } });
    return;
  }
  const messages = extractWebhookMessages(req.body);
  res.sendStatus(200);
  for (const message of messages) {
    try {
      const result = await processChat(message.text?.body ?? '', { channel: 'WHATSAPP', externalUserId: message.from, externalId: message.id });
      if (result.outbound && message.from) await sendWhatsAppText(message.from, result.outbound.text);
    } catch (error) {
      console.error(`[meta] falha ao processar webhook (código ${safeWhatsAppErrorCode(error)})`);
    }
  }
});

function stringFormBody(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined;
  const entries = Object.entries(body);
  if (entries.some(([, value]) => typeof value !== 'string')) return undefined;
  return Object.fromEntries(entries) as Record<string, string>;
}

export function createTwilioWebhookHandler(sendText?: TwilioTextSender): RequestHandler {
  return async (req, res) => {
    const params = stringFormBody(req.body);
    if (!params || !verifyTwilioSignature(req.header('x-twilio-signature'), params)) {
      console.warn('[twilio] webhook rejeitado por assinatura inválida ou configuração ausente');
      res.status(401).json({ error: { code: 'INVALID_TWILIO_SIGNATURE', message: 'Assinatura do Twilio inválida.' } });
      return;
    }
    const result = await processTwilioInbound(params, sendText);
    if (result.retryLater) {
      res.status(503).json({ error: { code: 'TWILIO_DELIVERY_IN_PROGRESS', message: 'Mensagem ainda em processamento; tente novamente.' } });
      return;
    }
    // Resposta TwiML vazia evita que o Twilio tente interpretar JSON como instruções de mensagem.
    res.status(200).type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  };
}

apiRouter.post(
  '/webhooks/twilio/whatsapp',
  express.urlencoded({ extended: false, limit: '64kb' }),
  createTwilioWebhookHandler(),
);
