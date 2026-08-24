import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from './config.js';
import { prisma } from './lib/prisma.js';
import { startScheduler } from './services/scheduler.js';

const app = createApp();
const server = createServer(app);
const scheduler = startScheduler();

server.listen(env.PORT, env.HOST, () => {
  console.log(`EDY Assist API pronta em http://${env.HOST}:${env.PORT}/api`);
  console.log(`Provedor WhatsApp selecionado: ${env.WHATSAPP_PROVIDER}`);
});

async function shutdown(signal: string) {
  console.log(`\n${signal}: encerrando EDY Assist...`);
  clearInterval(scheduler);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
