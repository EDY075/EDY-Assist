import 'dotenv/config';
import { z } from 'zod';

const optionalEnvString = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().optional(),
);
const optionalEnvUrl = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().url().refine((value) => new URL(value).protocol === 'https:', 'A URL pública do webhook deve usar HTTPS.').optional(),
);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3333),
  HOST: z.string().default('127.0.0.1'),
  DATABASE_URL: z.string().default('file:./prisma/dev.db'),
  APP_TIMEZONE: z.string().default('America/Sao_Paulo'),
  CORS_ORIGIN: z.string().default('http://127.0.0.1:5173,http://localhost:5173'),
  WHATSAPP_PROVIDER: z.enum(['mock', 'meta', 'twilio']).default('mock'),
  META_VERIFY_TOKEN: optionalEnvString,
  META_ACCESS_TOKEN: optionalEnvString,
  META_PHONE_NUMBER_ID: optionalEnvString,
  META_APP_SECRET: optionalEnvString,
  META_GRAPH_VERSION: z.string().default('v23.0'),
  TWILIO_ACCOUNT_SID: optionalEnvString,
  TWILIO_AUTH_TOKEN: optionalEnvString,
  TWILIO_WHATSAPP_FROM: optionalEnvString,
  TWILIO_WHATSAPP_TO: optionalEnvString,
  TWILIO_WEBHOOK_URL: optionalEnvUrl,
  TWILIO_CONTENT_SID: optionalEnvString,
});

export const env = envSchema.parse(process.env);
export const corsOrigins = env.CORS_ORIGIN.split(',').map((origin) => origin.trim());
