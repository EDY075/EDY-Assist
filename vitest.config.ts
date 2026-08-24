import { defineConfig } from 'vitest/config';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'file:./prisma/test.db';
process.env.WHATSAPP_PROVIDER = 'twilio';
process.env.TWILIO_AUTH_TOKEN = 'twilio_test_auth_token_not_a_real_secret';
process.env.TWILIO_WEBHOOK_URL = 'https://edy-focus.test/api/webhooks/twilio/whatsapp';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    sequence: { concurrent: false },
    fileParallelism: false,
    testTimeout: 15_000,
    globalSetup: ['./tests/global-setup.ts'],
  },
});
