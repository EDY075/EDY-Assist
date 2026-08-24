import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { fromZonedTime } from 'date-fns-tz';
import path from 'node:path';
import { PrismaClient } from '../generated/prisma/client.js';
import { initializeDatabase, sqlitePathFromUrl } from '../server/lib/migrate.js';

const timezone = 'America/Sao_Paulo';
const databaseUrl = process.env.DEMO_DATABASE_URL ?? 'file:./.demo/edy-assist-demo.db';
const databasePath = sqlitePathFromUrl(databaseUrl);
const demoRoot = `${path.resolve('.demo')}${path.sep}`;

if (!databasePath.startsWith(demoRoot) || !databasePath.endsWith('.db')) {
  throw new Error('O seed demo só pode usar um arquivo .db dentro de .demo/.');
}

initializeDatabase(databaseUrl);

const adapter = new PrismaBetterSqlite3(
  { url: databaseUrl },
  { timestampFormat: 'unixepoch-ms' },
);
const prisma = new PrismaClient({ adapter });

function localDate(daysFromToday: number, hour: number, minute = 0) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const localNoon = fromZonedTime(`${value.year}-${value.month}-${value.day}T12:00:00`, timezone);
  localNoon.setUTCDate(localNoon.getUTCDate() + daysFromToday);
  const target = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(localNoon);
  const shifted = Object.fromEntries(target.map((part) => [part.type, part.value]));
  return fromZonedTime(
    `${shifted.year}-${shifted.month}-${shifted.day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`,
    timezone,
  );
}

async function main() {
  await prisma.appSettings.upsert({
    where: { id: 1 },
    update: { appMode: 'LOCAL', timezone, whatsappRecipient: null },
    create: { id: 1, appMode: 'LOCAL', timezone, whatsappRecipient: null },
  });

  const modules = [
    { id: 'demo-module-programacao', name: 'Programação', description: 'Lógica, APIs, testes e projetos práticos.', color: '#31e8a4', topics: ['TypeScript', 'APIs', 'Testes'], goalMinutes: 300 },
    { id: 'demo-module-redes', name: 'Redes de Computadores', description: 'Protocolos, serviços e diagnóstico.', color: '#5b8cff', topics: ['TCP/IP', 'DNS', 'Subnetting'], goalMinutes: 240 },
    { id: 'demo-module-ingles', name: 'Inglês', description: 'Leitura, vocabulário e conversação.', color: '#9b7bff', topics: ['Vocabulário', 'Listening'], goalMinutes: 180 },
  ];
  for (const module of modules) {
    const { topics, ...moduleData } = module;
    await prisma.studyModule.upsert({
      where: { id: module.id },
      update: { description: module.description, color: module.color, topicsJson: JSON.stringify(topics), goalMinutes: module.goalMinutes },
      create: { ...moduleData, topicsJson: JSON.stringify(topics), isStarter: true },
    });
  }

  const reminders = [
    { id: 'demo-reminder-review', title: 'Revisar anotações de TypeScript', category: 'TASK', dueAt: localDate(0, 9), status: 'COMPLETED', completedAt: localDate(0, 9, 35) },
    { id: 'demo-reminder-lab', title: 'Sessão de laboratório de redes', category: 'CLASS', dueAt: localDate(0, 14), status: 'PENDING', completedAt: null },
    { id: 'demo-reminder-walk', title: 'Caminhada leve', category: 'HEALTH', dueAt: localDate(0, 18, 30), status: 'PENDING', completedAt: null },
    { id: 'demo-reminder-materials', title: 'Organizar materiais da semana', category: 'GENERAL', dueAt: localDate(-1, 19), status: 'PENDING', completedAt: null },
  ] as const;
  for (const reminder of reminders) {
    await prisma.reminder.upsert({
      where: { id: reminder.id },
      update: { title: reminder.title, category: reminder.category, dueAt: reminder.dueAt, status: reminder.status, completedAt: reminder.completedAt },
      create: { ...reminder, timezone, source: 'DEMO' },
    });
  }

  const studies = [
    { id: 'demo-study-typescript', subject: 'TypeScript', track: 'Programação', objective: 'Praticar tipagem de APIs', notes: 'Exercício fictício de portfólio.', durationMinutes: 55, questions: 12, correctAnswers: 10, studiedAt: localDate(0, 10) },
    { id: 'demo-study-dns', subject: 'DNS', track: 'Redes de Computadores', objective: 'Revisar resolução de nomes', notes: 'Laboratório demonstrativo.', durationMinutes: 45, questions: 10, correctAnswers: 8, studiedAt: localDate(-1, 16) },
    { id: 'demo-study-english', subject: 'Vocabulário técnico', track: 'Inglês', objective: 'Leitura guiada', notes: 'Conteúdo inteiramente fictício.', durationMinutes: 35, questions: 8, correctAnswers: 7, studiedAt: localDate(-2, 11) },
  ];
  for (const study of studies) {
    await prisma.studyLog.upsert({
      where: { id: study.id },
      update: study,
      create: { ...study, activityType: 'STUDY', difficulty: 3 },
    });
  }

  await prisma.review.upsert({
    where: { id: 'demo-review-dns' },
    update: { dueAt: localDate(0, 15), status: 'PENDING' },
    create: { id: 'demo-review-dns', studyLogId: 'demo-study-dns', subject: 'DNS', intervalDays: 1, dueAt: localDate(0, 15), status: 'PENDING' },
  });

  await prisma.focusSession.upsert({
    where: { id: 'demo-focus-completed' },
    update: { startedAt: localDate(0, 10), endsAt: localDate(0, 10, 50), completedAt: localDate(0, 10, 50), status: 'COMPLETED' },
    create: { id: 'demo-focus-completed', durationMinutes: 50, subject: 'TypeScript', track: 'Programação', objective: 'Praticar tipagem de APIs', startedAt: localDate(0, 10), endsAt: localDate(0, 10, 50), completedAt: localDate(0, 10, 50), status: 'COMPLETED' },
  });

  await prisma.conversationSession.upsert({
    where: { id: 'demo-session-local' },
    update: { channel: 'LOCAL' },
    create: { id: 'demo-session-local', channel: 'LOCAL' },
  });
  const messages = [
    { id: 'demo-message-user', direction: 'INBOUND', text: 'O que tenho hoje?', createdAt: localDate(0, 8, 5) },
    { id: 'demo-message-assistant', direction: 'OUTBOUND', text: 'Hoje você tem laboratório de redes às 14h e uma caminhada às 18h30. A revisão de TypeScript já foi concluída.', createdAt: localDate(0, 8, 6) },
  ];
  for (const message of messages) {
    await prisma.message.upsert({
      where: { id: message.id },
      update: message,
      create: { ...message, sessionId: 'demo-session-local', channel: 'LOCAL', status: 'DELIVERED' },
    });
  }

  console.log('Base demo fictícia pronta em .demo/edy-assist-demo.db.');
}

main()
  .finally(async () => prisma.$disconnect())
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Falha ao preparar a base demo.');
    process.exitCode = 1;
  });
