import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config.js';
import { ApiError } from '../lib/errors.js';
import { sendTwilioText, twilioReadiness } from './twilio.js';

export function whatsappReadiness() {
  const meta = {
    configured: Boolean(env.META_ACCESS_TOKEN && env.META_PHONE_NUMBER_ID && env.META_VERIFY_TOKEN && env.META_APP_SECRET),
    hasAccessToken: Boolean(env.META_ACCESS_TOKEN),
    hasPhoneNumberId: Boolean(env.META_PHONE_NUMBER_ID),
    hasVerifyToken: Boolean(env.META_VERIFY_TOKEN),
    hasAppSecret: Boolean(env.META_APP_SECRET),
    graphVersion: env.META_GRAPH_VERSION,
  };
  const twilio = twilioReadiness();
  return {
    ...meta,
    provider: env.WHATSAPP_PROVIDER,
    configured: env.WHATSAPP_PROVIDER === 'meta'
      ? meta.configured
      : env.WHATSAPP_PROVIDER === 'twilio' && twilio.configured,
    meta,
    twilio,
  };
}

export function verifyMetaSignature(rawBody: Buffer | undefined, signature: string | undefined) {
  if (!env.META_APP_SECRET) return false;
  if (!rawBody || !signature?.startsWith('sha256=')) return false;
  const expected = Buffer.from(`sha256=${createHmac('sha256', env.META_APP_SECRET).update(rawBody).digest('hex')}`);
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function sendWhatsAppText(to: string, text: string) {
  if (!env.META_ACCESS_TOKEN || !env.META_PHONE_NUMBER_ID) throw new ApiError(503, 'WHATSAPP_NOT_CONFIGURED', 'Credenciais da Meta ainda não configuradas.');
  const response = await fetch(`https://graph.facebook.com/${env.META_GRAPH_VERSION}/${env.META_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.META_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { preview_url: false, body: text } }),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json();
  if (!response.ok) throw new ApiError(502, 'META_API_ERROR', 'A Meta recusou o envio da mensagem.', payload);
  return payload;
}

export async function sendConfiguredWhatsAppText(to: string, text: string) {
  if (env.WHATSAPP_PROVIDER === 'meta') return sendWhatsAppText(to, text);
  if (env.WHATSAPP_PROVIDER === 'twilio') return sendTwilioText(to, text);
  throw new ApiError(503, 'WHATSAPP_NOT_CONFIGURED', 'Selecione e configure um provedor WhatsApp no arquivo .env.');
}

export function safeWhatsAppErrorCode(error: unknown) {
  if (error instanceof ApiError) return error.code;
  if (typeof error === 'object' && error && 'code' in error) return String(error.code).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'PROVIDER_ERROR';
  return 'PROVIDER_ERROR';
}

type WebhookMessage = { from?: string; id?: string; type?: string; text?: { body?: string } };

export function extractWebhookMessages(payload: unknown) {
  const messages: WebhookMessage[] = [];
  const body = payload as { entry?: Array<{ changes?: Array<{ value?: { messages?: WebhookMessage[] } }> }> };
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) messages.push(...(change.value?.messages ?? []));
  }
  return messages.filter((message) => message.type === 'text' && message.from && message.text?.body);
}
