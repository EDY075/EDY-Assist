import { addDays, addMinutes, addMonths, addWeeks } from 'date-fns';
import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/errors.js';
import { DEFAULT_TIMEZONE } from '../lib/time.js';

export type CreateReminderInput = {
  title: string;
  dueAt: Date;
  description?: string;
  category?: string;
  recurrence?: string;
  recurrenceInterval?: number;
  source?: string;
  timezone?: string;
};

export async function createReminder(input: CreateReminderInput) {
  if (input.dueAt <= new Date()) throw new ApiError(400, 'PAST_DATE', 'O lembrete precisa estar no futuro.');
  return prisma.reminder.create({
    data: {
      title: input.title.trim(),
      description: input.description,
      category: input.category ?? 'GENERAL',
      dueAt: input.dueAt,
      timezone: input.timezone ?? DEFAULT_TIMEZONE,
      recurrence: input.recurrence ?? 'NONE',
      recurrenceInterval: input.recurrenceInterval ?? 1,
      source: input.source ?? 'LOCAL',
    },
  });
}

export async function listReminders(filters: { from?: Date; to?: Date; status?: string; category?: string }) {
  const where: Prisma.ReminderWhereInput = {};
  if (filters.from || filters.to) where.dueAt = { gte: filters.from, lte: filters.to };
  if (filters.status) where.status = filters.status;
  if (filters.category) where.category = filters.category;
  return prisma.reminder.findMany({ where, orderBy: { dueAt: 'asc' } });
}

function nextRecurringDate(dueAt: Date, recurrence: string, interval: number) {
  if (recurrence === 'DAILY') return addDays(dueAt, interval);
  if (recurrence === 'WEEKLY') return addWeeks(dueAt, interval);
  if (recurrence === 'MONTHLY') return addMonths(dueAt, interval);
  return undefined;
}

export async function mutateReminder(
  id: string,
  action: 'COMPLETE' | 'CANCEL' | 'SNOOZE' | 'RESCHEDULE',
  options: { minutes?: number; dueAt?: Date } = {},
) {
  const reminder = await prisma.reminder.findUnique({ where: { id } });
  if (!reminder) throw new ApiError(404, 'REMINDER_NOT_FOUND', 'Lembrete não encontrado.');
  if (['COMPLETED', 'CANCELLED'].includes(reminder.status) && action !== 'RESCHEDULE') {
    throw new ApiError(409, 'REMINDER_CLOSED', 'Esse lembrete já está encerrado.');
  }

  if (action === 'SNOOZE') {
    const minutes = options.minutes ?? 15;
    if (minutes < 1 || minutes > 10_080) throw new ApiError(400, 'INVALID_SNOOZE', 'Use um adiamento entre 1 minuto e 7 dias.');
    const base = reminder.dueAt > new Date() ? reminder.dueAt : new Date();
    return prisma.reminder.update({ where: { id }, data: { dueAt: addMinutes(base, minutes), status: 'PENDING', notificationSentAt: null } });
  }
  if (action === 'RESCHEDULE') {
    if (!options.dueAt || options.dueAt <= new Date()) throw new ApiError(400, 'INVALID_DATE', 'Informe uma nova data futura.');
    return prisma.reminder.update({ where: { id }, data: { dueAt: options.dueAt, status: 'PENDING', completedAt: null, cancelledAt: null, notificationSentAt: null } });
  }
  if (action === 'CANCEL') {
    return prisma.reminder.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
  }

  return prisma.$transaction(async (tx) => {
    const completed = await tx.reminder.update({ where: { id }, data: { status: 'COMPLETED', completedAt: new Date() } });
    const nextDueAt = nextRecurringDate(reminder.dueAt, reminder.recurrence, reminder.recurrenceInterval);
    if (nextDueAt && (!reminder.recurrenceUntil || nextDueAt <= reminder.recurrenceUntil)) {
      await tx.reminder.create({
        data: {
          title: reminder.title,
          description: reminder.description,
          category: reminder.category,
          dueAt: nextDueAt,
          timezone: reminder.timezone,
          recurrence: reminder.recurrence,
          recurrenceInterval: reminder.recurrenceInterval,
          recurrenceDaysJson: reminder.recurrenceDaysJson,
          recurrenceUntil: reminder.recurrenceUntil,
          source: reminder.source,
          parentReminderId: reminder.parentReminderId ?? reminder.id,
        },
      });
    }
    return completed;
  });
}
