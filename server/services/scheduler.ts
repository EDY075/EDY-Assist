import { prisma } from '../lib/prisma.js';
import { env } from '../config.js';
import { formatPt, isQuietTime } from '../lib/time.js';
import { safeWhatsAppErrorCode, sendConfiguredWhatsAppText, whatsappReadiness } from './whatsapp.js';

export async function dispatchDueReminders(now = new Date()) {
  const settings = await prisma.appSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  const recipient = settings.whatsappRecipient
    ?? (env.WHATSAPP_PROVIDER === 'twilio' ? env.TWILIO_WHATSAPP_TO : undefined);
  if (settings.appMode !== 'WHATSAPP' || !recipient || !whatsappReadiness().configured) return { sent: 0 };
  if (settings.quietEnabled && isQuietTime(now, settings.quietStart, settings.quietEnd, settings.timezone)) return { sent: 0, quiet: true };
  const due = await prisma.reminder.findMany({ where: { status: 'PENDING', dueAt: { lte: now }, notificationSentAt: null }, take: 25, orderBy: { dueAt: 'asc' } });
  let sent = 0;
  for (const reminder of due) {
    try {
      await sendConfiguredWhatsAppText(recipient, `⏰ ${reminder.title}\nPrevisto para ${formatPt(reminder.dueAt, settings.timezone)}.`);
      await prisma.reminder.update({ where: { id: reminder.id }, data: { notificationSentAt: new Date() } });
      sent += 1;
    } catch (error) {
      console.error(`[whatsapp] falha ao enviar lembrete (código ${safeWhatsAppErrorCode(error)})`);
    }
  }
  return { sent };
}

export function startScheduler() {
  const timer = setInterval(() => void dispatchDueReminders(), 30_000);
  timer.unref();
  return timer;
}
