import { prisma } from '../lib/prisma.js';
import { addDays } from 'date-fns';
import { dayRangeUtc, formatPt, weekRangeUtc } from '../lib/time.js';
import { createReminder, listReminders, mutateReminder } from './reminders.js';
import { finishFocus, startFocus } from './focus.js';
import { createStudyLog } from './studies.js';
import { parseCommand } from './nlp.js';
import { listStudyModules } from './study-modules.js';

type ChatOptions = {
  sessionId?: string;
  channel?: 'LOCAL' | 'WHATSAPP' | 'TWILIO';
  externalUserId?: string;
  externalId?: string;
};

async function resolveSession(options: ChatOptions) {
  if (options.sessionId) {
    const existing = await prisma.conversationSession.findUnique({ where: { id: options.sessionId } });
    if (existing) return existing;
  }
  const channel = options.channel ?? 'LOCAL';
  if (options.externalUserId) {
    return prisma.conversationSession.upsert({
      where: { channel_externalUserId: { channel, externalUserId: options.externalUserId } },
      update: {},
      create: { channel, externalUserId: options.externalUserId },
    });
  }
  const existing = await prisma.conversationSession.findFirst({ where: { channel, externalUserId: null }, orderBy: { createdAt: 'asc' } });
  return existing ?? prisma.conversationSession.create({ data: { channel } });
}

async function answer(sessionId: string, channel: string, text: string, metadata?: unknown) {
  return prisma.message.create({
    data: {
      sessionId,
      channel,
      direction: 'OUTBOUND',
      text,
      metadataJson: metadata ? JSON.stringify(metadata) : undefined,
    },
  });
}

export async function processChat(text: string, options: ChatOptions = {}) {
  const settings = await prisma.appSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  const session = await resolveSession(options);
  if (options.externalId) {
    const duplicate = await prisma.message.findUnique({ where: { externalId: options.externalId } });
    if (duplicate) return { session, inbound: duplicate, outbound: undefined, duplicate: true };
  }
  let inbound;
  try {
    inbound = await prisma.message.create({
      data: {
        sessionId: session.id,
        channel: session.channel,
        direction: 'INBOUND',
        text,
        externalId: options.externalId,
      },
    });
  } catch (error) {
    // O índice único é o gate autoritativo contra entregas simultâneas do mesmo webhook.
    if (options.externalId && typeof error === 'object' && error && 'code' in error && error.code === 'P2002') {
      const duplicate = await prisma.message.findUnique({ where: { externalId: options.externalId } });
      if (duplicate) return { session, inbound: duplicate, outbound: undefined, duplicate: true };
    }
    throw error;
  }

  if (session.pendingIntentJson && /^(cancelar|cancele|esquece|esqueca)$/i.test(text.trim())) {
    await prisma.conversationSession.update({ where: { id: session.id }, data: { pendingIntentJson: null } });
    const outbound = await answer(session.id, session.channel, 'Tudo bem — não salvei o item pendente.');
    return { session, inbound, outbound };
  }

  let inputText = text;
  if (session.pendingIntentJson) {
    const pending = JSON.parse(session.pendingIntentJson) as { originalText: string };
    inputText = `${pending.originalText} ${text}`;
  }
  const command = parseCommand(inputText, settings.timezone);

  if (command.type === 'CREATE_REMINDER') {
    if (!command.dueAt || command.needsConfirmation) {
      await prisma.conversationSession.update({
        where: { id: session.id },
        data: { pendingIntentJson: JSON.stringify({ originalText: inputText }) },
      });
      const outbound = await answer(session.id, session.channel, command.needsConfirmation ?? 'Confirme a data e o horário antes de salvar.');
      return { session, inbound, outbound, requiresConfirmation: true };
    }
    const reminder = await createReminder({
      title: command.title,
      category: command.category,
      dueAt: command.dueAt,
      recurrence: command.recurrence,
      source: session.channel,
      timezone: settings.timezone,
    });
    await prisma.conversationSession.update({ where: { id: session.id }, data: { lastReminderId: reminder.id, pendingIntentJson: null } });
    const recurrence = reminder.recurrence === 'NONE' ? '' : `, recorrência ${reminder.recurrence.toLowerCase()}`;
    const outbound = await answer(session.id, session.channel, `Combinado! “${reminder.title}” ficou para ${formatPt(reminder.dueAt, settings.timezone)}${recurrence}.`, { reminderId: reminder.id });
    return { session, inbound, outbound, reminder };
  }

  if (command.type === 'REMINDER_ACTION') {
    if (!session.lastReminderId) {
      const outbound = await answer(session.id, session.channel, 'Não encontrei um lembrete recente nessa conversa. Abra ou crie um lembrete primeiro.');
      return { session, inbound, outbound };
    }
    if (command.needsConfirmation || (command.action === 'RESCHEDULE' && !command.dueAt)) {
      await prisma.conversationSession.update({
        where: { id: session.id },
        data: { pendingIntentJson: JSON.stringify({ originalText: inputText }) },
      });
      const outbound = await answer(session.id, session.channel, command.needsConfirmation ?? 'Informe a nova data e o horário.');
      return { session, inbound, outbound, requiresConfirmation: true };
    }
    const reminder = await mutateReminder(session.lastReminderId, command.action, { minutes: command.minutes, dueAt: command.dueAt });
    await prisma.conversationSession.update({ where: { id: session.id }, data: { pendingIntentJson: null } });
    const verbs = { COMPLETE: 'concluído', CANCEL: 'cancelado', SNOOZE: 'adiado', RESCHEDULE: 'reagendado' } as const;
    const outbound = await answer(session.id, session.channel, `Pronto: “${reminder.title}” foi ${verbs[command.action]}${['SNOOZE', 'RESCHEDULE'].includes(command.action) ? ` para ${formatPt(reminder.dueAt, settings.timezone)}` : ''}.`, { reminderId: reminder.id });
    return { session, inbound, outbound, reminder };
  }

  if (command.type === 'AGENDA_QUERY') {
    const range = command.period === 'TODAY'
      ? dayRangeUtc(new Date(), settings.timezone)
      : command.period === 'TOMORROW'
        ? dayRangeUtc(addDays(new Date(), 1), settings.timezone)
        : weekRangeUtc(new Date(), settings.timezone);
    const reminders = await listReminders({ from: range.from, to: range.to, status: 'PENDING' });
    const label = command.period === 'TODAY' ? 'hoje' : command.period === 'TOMORROW' ? 'amanhã' : 'nesta semana';
    const body = reminders.length
      ? reminders.map((item, index) => `${index + 1}. ${formatPt(item.dueAt, settings.timezone)} — ${item.title}`).join('\n')
      : `Você não tem compromissos pendentes ${label}.`;
    if (reminders[0]) await prisma.conversationSession.update({ where: { id: session.id }, data: { lastReminderId: reminders[0].id } });
    const outbound = await answer(session.id, session.channel, reminders.length ? `Sua agenda ${label}:\n${body}` : body);
    return { session, inbound, outbound, reminders };
  }

  if (command.type === 'REVIEW_QUERY') {
    const reviews = await prisma.review.findMany({ where: { status: 'PENDING', dueAt: { lt: new Date() } }, orderBy: { dueAt: 'asc' }, take: 10 });
    const text = reviews.length
      ? `Revisões atrasadas:\n${reviews.map((review, index) => `${index + 1}. ${review.subject} — ciclo de ${review.intervalDays} dia${review.intervalDays === 1 ? '' : 's'}`).join('\n')}`
      : 'Você não tem revisões atrasadas. Ótimo ritmo!';
    const outbound = await answer(session.id, session.channel, text);
    return { session, inbound, outbound, reviews };
  }

  if (command.type === 'STUDY_SUGGESTION') {
    const overdue = await prisma.review.findFirst({ where: { status: 'PENDING', dueAt: { lt: new Date() } }, orderBy: { dueAt: 'asc' } });
    const modules = await listStudyModules();
    const recent = await prisma.studyLog.findFirst({ orderBy: { studiedAt: 'desc' } });
    const suggestion = overdue?.subject ?? modules.find((module) => module.name.toUpperCase() !== recent?.track)?.name ?? modules[0]?.name;
    const reason = overdue ? 'porque há uma revisão atrasada dessa matéria' : 'para equilibrar sua sequência de estudos';
    const outbound = await answer(session.id, session.channel, suggestion ? `Sugiro estudar ${suggestion} agora, ${reason}. Quer iniciar um foco de 25, 50 ou 60 minutos?` : 'Registre seu primeiro módulo de estudo para eu sugerir a próxima matéria com base nos seus dados.');
    return { session, inbound, outbound, suggestion };
  }

  if (command.type === 'PERFORMANCE_QUERY') {
    const studies = await prisma.studyLog.findMany({ where: { questions: { gt: 0 } }, orderBy: { studiedAt: 'desc' } });
    const performance = Object.entries(studies.reduce<Record<string, { questions: number; correct: number }>>((acc, item) => {
      const current = acc[item.subject] ?? { questions: 0, correct: 0 };
      current.questions += item.questions;
      current.correct += item.correctAnswers;
      acc[item.subject] = current;
      return acc;
    }, {})).map(([subject, values]) => ({ subject, ...values, accuracy: Math.round(values.correct / values.questions * 1000) / 10 }))
      .sort((a, b) => a.accuracy - b.accuracy || b.questions - a.questions);
    const lowest = performance[0];
    const text = lowest
      ? `${lowest.subject} está com o menor aproveitamento: ${lowest.accuracy}% em ${lowest.questions} questões. Considere revisar esse assunto antes da próxima sessão.`
      : 'Ainda não há questões registradas. Registre questões e acertos para eu calcular o menor aproveitamento real.';
    const outbound = await answer(session.id, session.channel, text);
    return { session, inbound, outbound, performance: lowest };
  }

  if (command.type === 'START_FOCUS') {
    const focus = await startFocus(command);
    await prisma.conversationSession.update({ where: { id: session.id }, data: { lastFocusSessionId: focus.id } });
    const context = [focus.subject, focus.track].filter(Boolean).join(' • ');
    const hydration = focus.hydrationReminder ? ' Também vou lembrar você de beber 250 ml de água após 60 minutos.' : '';
    const outbound = await answer(session.id, session.channel, `Foco iniciado por ${focus.durationMinutes} minutos${context ? ` — ${context}` : ''}.${hydration}`, { focusSessionId: focus.id });
    return { session, inbound, outbound, focus };
  }

  if (command.type === 'LOG_STUDY') {
    const focus = session.lastFocusSessionId
      ? await prisma.focusSession.findUnique({ where: { id: session.lastFocusSessionId } })
      : await prisma.focusSession.findFirst({ orderBy: { startedAt: 'desc' } });
    if (!focus?.subject && !command.subject) {
      const outbound = await answer(session.id, session.channel, 'Qual matéria você estudou? Inicie um foco com a matéria ou registre o estudo pelo painel.');
      return { session, inbound, outbound, requiresConfirmation: true };
    }
    const log = await createStudyLog({
      focusSessionId: focus?.id,
      subject: command.subject ?? focus?.subject ?? 'Estudo geral',
      track: command.track ?? focus?.track ?? 'FACULDADE',
      objective: focus?.objective ?? undefined,
      durationMinutes: command.durationMinutes ?? focus?.durationMinutes ?? 0,
      questions: command.questions,
      correctAnswers: command.correctAnswers,
    });
    if (focus?.status === 'ACTIVE') await finishFocus(focus.id);
    const accuracy = command.questions ? Math.round((command.correctAnswers / command.questions) * 100) : 0;
    const outbound = await answer(session.id, session.channel, `Estudo registrado: ${log.subject}, ${command.questions} questões, ${command.correctAnswers} acertos (${accuracy}%). Revisões agendadas para 1, 3, 7, 15 e 30 dias.`, { studyLogId: log.id });
    return { session, inbound, outbound, studyLog: log };
  }

  const outbound = await answer(
    session.id,
    session.channel,
    'Eu sou o EDY Assist. Posso organizar lembretes, agenda, foco, estudos e revisões. Exemplo: “Adicione academia hoje às 19h”.',
  );
  return { session, inbound, outbound };
}
