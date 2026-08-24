import { env } from '../server/config.js';
import { safeWhatsAppErrorCode } from '../server/services/whatsapp.js';
import { sendTwilioText } from '../server/services/twilio.js';

if (!env.TWILIO_WHATSAPP_TO) {
  throw new Error('TWILIO_WHATSAPP_TO não configurado.');
}

try {
  const result = await sendTwilioText(
    env.TWILIO_WHATSAPP_TO,
    'EDY Assist conectado. Envie “O que tenho hoje?” para testar o fluxo completo.',
  );
  console.log(JSON.stringify({ sent: true, status: result.status ?? 'accepted', credentialsExposed: false }));
} catch (error) {
  const safeMessage = (error instanceof Error ? error.message : 'Falha do provedor')
    .replace(/AC[a-f0-9]{32}/gi, '[SID]')
    .replace(/\b[a-f0-9]{24,}\b/gi, '[secret]')
    .replace(/(?:whatsapp:)?\+\d{8,15}/g, '[telefone]')
    .slice(0, 240);
  console.error(JSON.stringify({ sent: false, code: safeWhatsAppErrorCode(error), message: safeMessage, credentialsExposed: false }));
  process.exitCode = 1;
}
