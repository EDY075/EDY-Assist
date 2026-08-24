import twilio from 'twilio';
import { env } from '../server/config.js';
import { safeWhatsAppErrorCode } from '../server/services/whatsapp.js';

if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_WHATSAPP_FROM) {
  throw new Error('Configuração Twilio incompleta.');
}

try {
  const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN, { timeout: 15_000 });
  const senders = await client.messaging.v2.channelsSenders.list({ channel: 'whatsapp', limit: 20 });
  const matching = senders.filter((sender) => sender.senderId === env.TWILIO_WHATSAPP_FROM);
  console.log(JSON.stringify({
    senderCount: senders.length,
    configuredSenderFound: matching.length === 1,
    matchingStatus: matching[0]?.status ?? null,
    webhookAlreadyConfigured: Boolean(matching[0]?.webhook?.callbackUrl),
    credentialsExposed: false,
  }));
} catch (error) {
  const safeMessage = (error instanceof Error ? error.message : 'Falha do provedor')
    .replace(/AC[a-f0-9]{32}/gi, '[SID]')
    .replace(/\b[a-f0-9]{24,}\b/gi, '[secret]')
    .replace(/(?:whatsapp:)?\+\d{8,15}/g, '[telefone]')
    .slice(0, 240);
  console.error(JSON.stringify({ ok: false, code: safeWhatsAppErrorCode(error), message: safeMessage, credentialsExposed: false }));
  process.exitCode = 1;
}
