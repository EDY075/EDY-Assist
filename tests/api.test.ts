import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { addMinutes } from 'date-fns';
import { createApp } from '../server/app.js';
import { env } from '../server/config.js';
import { prisma } from '../server/lib/prisma.js';

const app = createApp();

async function resetDatabase() {
  await prisma.studyModule.deleteMany();
  await prisma.review.deleteMany();
  await prisma.studyLog.deleteMany();
  await prisma.focusSession.deleteMany();
  await prisma.reminder.deleteMany();
  await prisma.message.deleteMany();
  await prisma.conversationSession.deleteMany();
  await prisma.appSettings.deleteMany();
  await prisma.appSettings.create({ data: { id: 1, timezone: 'America/Sao_Paulo', appMode: 'LOCAL' } });
}

beforeEach(resetDatabase);
afterAll(async () => prisma.$disconnect());

describe('API local persistente', () => {
  it('responde health com banco operacional', async () => {
    const response = await request(app).get('/api/health').expect(200);
    expect(response.body.data).toMatchObject({ status: 'ok', mode: 'LOCAL', timezone: 'America/Sao_Paulo' });
    expect(response.headers['cache-control']).toContain('private, no-store');
  });

  it('cria lembrete pelo chat e o persiste no SQLite', async () => {
    const response = await request(app)
      .post('/api/chat')
      .send({ text: 'Me lembre da aula de Power BI 30/08/2027 às 9h.' })
      .expect(201);
    expect(response.body.data.outbound.text).toContain('Combinado');
    expect(await prisma.reminder.count({ where: { category: 'CLASS' } })).toBe(1);
    expect(await prisma.message.count()).toBe(2);
  });

  it('não salva data ambígua e conclui após a confirmação', async () => {
    const first = await request(app).post('/api/chat').send({ text: 'Me lembre de entregar o trabalho às 14h.' }).expect(201);
    expect(first.body.data.requiresConfirmation).toBe(true);
    expect(await prisma.reminder.count()).toBe(0);
    const sessionId = first.body.data.session.id as string;
    await request(app).post('/api/chat').send({ sessionId, text: '30/08/2027 às 14h' }).expect(201);
    expect(await prisma.reminder.count()).toBe(1);
  });

  it('inicia foco, agenda hidratação e registra desempenho com cinco revisões', async () => {
    const focusResponse = await request(app)
      .post('/api/chat')
      .send({ text: 'Iniciar foco de 60 minutos estudando matemática para o ENEM.' })
      .expect(201);
    expect(focusResponse.body.data.focus.durationMinutes).toBe(60);
    expect(await prisma.reminder.count({ where: { category: 'HEALTH' } })).toBe(1);
    const sessionId = focusResponse.body.data.session.id as string;
    const logResponse = await request(app)
      .post('/api/chat')
      .send({ sessionId, text: 'Registre 20 questões e 15 acertos.' })
      .expect(201);
    expect(logResponse.body.data.studyLog.correctAnswers).toBe(15);
    expect(await prisma.review.count()).toBe(5);
    expect((await prisma.focusSession.findFirst())?.status).toBe('COMPLETED');
  });

  it('adia o lembrete contextual em 15 minutos', async () => {
    const created = await request(app).post('/api/chat').send({ text: 'Marque o post do EDY RECON para 30/08/2027 às 12h.' }).expect(201);
    const oldDate = new Date(created.body.data.reminder.dueAt).getTime();
    const sessionId = created.body.data.session.id as string;
    const delayed = await request(app).post('/api/chat').send({ sessionId, text: 'Adie esse lembrete por 15 minutos.' }).expect(201);
    expect(new Date(delayed.body.data.reminder.dueAt).getTime() - oldDate).toBe(15 * 60 * 1000);
  });

  it('gera a próxima ocorrência ao concluir compromisso recorrente', async () => {
    const created = await request(app).post('/api/reminders').send({
      title: 'Aula semanal', dueAt: addMinutes(new Date(), 60).toISOString(), recurrence: 'WEEKLY', category: 'CLASS',
    }).expect(201);
    await request(app).patch(`/api/reminders/${created.body.data.id}`).send({ action: 'complete' }).expect(200);
    const reminders = await prisma.reminder.findMany({ orderBy: { dueAt: 'asc' } });
    expect(reminders).toHaveLength(2);
    expect(reminders.map((item) => item.status)).toEqual(['COMPLETED', 'PENDING']);
  });

  it('impede modo WhatsApp sem credenciais e rejeita webhook sem assinatura', async () => {
    const original = {
      provider: env.WHATSAPP_PROVIDER,
      verifyToken: env.META_VERIFY_TOKEN,
      accessToken: env.META_ACCESS_TOKEN,
      phoneNumberId: env.META_PHONE_NUMBER_ID,
      appSecret: env.META_APP_SECRET,
    };
    try {
      env.WHATSAPP_PROVIDER = 'meta';
      env.META_VERIFY_TOKEN = undefined;
      env.META_ACCESS_TOKEN = undefined;
      env.META_PHONE_NUMBER_ID = undefined;
      env.META_APP_SECRET = undefined;
      const settings = await request(app).patch('/api/settings').send({ appMode: 'WHATSAPP' }).expect(409);
      expect(settings.body.error.code).toBe('WHATSAPP_NOT_CONFIGURED');
      await request(app).post('/api/whatsapp/webhook').send({ object: 'whatsapp_business_account' }).expect(401);
    } finally {
      env.WHATSAPP_PROVIDER = original.provider;
      env.META_VERIFY_TOKEN = original.verifyToken;
      env.META_ACCESS_TOKEN = original.accessToken;
      env.META_PHONE_NUMBER_ID = original.phoneNumberId;
      env.META_APP_SECRET = original.appSecret;
    }
  });

  it('persiste a preferência e desativa a hidratação automática', async () => {
    const settings = await request(app).patch('/api/settings').send({ waterReminderEnabled: false }).expect(200);
    expect(settings.body.data.waterReminderEnabled).toBe(false);
    await request(app).post('/api/focus/start').send({ durationMinutes: 60, subject: 'Inglês', track: 'INGLÊS' }).expect(201);
    expect(await prisma.reminder.count({ where: { category: 'HEALTH' } })).toBe(0);
  });

  it('valida desempenho inválido', async () => {
    const response = await request(app).post('/api/studies').send({ subject: 'Matemática', track: 'ENEM', questions: 10, correctAnswers: 11 }).expect(400);
    expect(response.body.error.code).toBe('INVALID_PERFORMANCE');
  });

  it('registra aula, anotações, dificuldade e erros calculáveis', async () => {
    const response = await request(app).post('/api/studies').send({ subject: 'Subnetting', track: 'Redes de Computadores', activityType: 'CLASS', notes: 'Rever VLSM', difficulty: 4, durationMinutes: 50, questions: 10, correctAnswers: 6 }).expect(201);
    expect(response.body.data).toMatchObject({ activityType: 'CLASS', notes: 'Rever VLSM', difficulty: 4, questions: 10, correctAnswers: 6 });
    expect(await prisma.review.count()).toBe(5);
  });

  it('mantém módulos iniciais editáveis e permite criar módulos próprios', async () => {
    const listed = await request(app).get('/api/study-modules').expect(200);
    expect(listed.body.data).toHaveLength(12);
    expect(listed.body.data.map((item: { name: string }) => item.name)).toContain('Blue Team e SOC');

    const created = await request(app).post('/api/study-modules').send({
      name: 'Laboratório pessoal', description: 'Trilha criada pelo usuário', topics: ['Docker', 'Cloud'], color: '#14b8a6',
    }).expect(201);
    expect(created.body.data.topics).toEqual(['Docker', 'Cloud']);

    const updated = await request(app).patch(`/api/study-modules/${created.body.data.id}`).send({ topics: ['Docker', 'Cloud', 'Kubernetes'], goalMinutes: 240 }).expect(200);
    expect(updated.body.data.topics).toContain('Kubernetes');
    expect(updated.body.data.goalMinutes).toBe(240);
    expect(await prisma.studyModule.count()).toBe(13);
  });

  it('arquiva e restaura módulos sem apagar estudos', async () => {
    const created = await request(app).post('/api/study-modules').send({ name: 'Temporário', topics: ['Tópico'] }).expect(201);
    await request(app).post('/api/studies').send({ subject: 'Tópico', track: 'Temporário', durationMinutes: 30 }).expect(201);
    await request(app).patch(`/api/study-modules/${created.body.data.id}`).send({ isArchived: true }).expect(200);
    const active = await request(app).get('/api/study-modules').expect(200);
    expect(active.body.data.some((item: { id: string }) => item.id === created.body.data.id)).toBe(false);
    const all = await request(app).get('/api/study-modules?includeArchived=true').expect(200);
    expect(all.body.data.find((item: { id: string }) => item.id === created.body.data.id).isArchived).toBe(true);
    expect(await prisma.studyLog.count({ where: { track: 'TEMPORÁRIO' } })).toBe(1);
    await request(app).patch(`/api/study-modules/${created.body.data.id}`).send({ isArchived: false }).expect(200);
  });

  it('responde o menor aproveitamento somente com dados reais', async () => {
    await request(app).post('/api/studies').send({ subject: 'Subnetting', track: 'Redes de Computadores', durationMinutes: 30, questions: 20, correctAnswers: 10 }).expect(201);
    await request(app).post('/api/studies').send({ subject: 'Linux', track: 'Linux', durationMinutes: 30, questions: 20, correctAnswers: 18 }).expect(201);
    const response = await request(app).post('/api/chat').send({ text: 'Qual assunto está com menor aproveitamento?' }).expect(201);
    expect(response.body.data.outbound.text).toContain('Subnetting');
    expect(response.body.data.outbound.text).toContain('50%');
  });
});
