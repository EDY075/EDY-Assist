import { addMinutes } from 'date-fns';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/errors.js';

export async function getCurrentFocus() {
  return prisma.focusSession.findFirst({ where: { status: 'ACTIVE' }, orderBy: { startedAt: 'desc' } });
}

export async function startFocus(input: { durationMinutes: number; subject?: string; track?: string; objective?: string }) {
  if (input.durationMinutes < 1 || input.durationMinutes > 720) throw new ApiError(400, 'INVALID_DURATION', 'A duração deve ficar entre 1 e 720 minutos.');
  const current = await getCurrentFocus();
  if (current) throw new ApiError(409, 'FOCUS_ALREADY_ACTIVE', 'Já existe uma sessão de foco ativa.', { focusSessionId: current.id });
  const settings = await prisma.appSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  const startedAt = new Date();
  return prisma.$transaction(async (tx) => {
    let hydrationReminderId: string | undefined;
    if (input.durationMinutes >= 60 && settings.waterReminderEnabled) {
      const hydration = await tx.reminder.create({
        data: {
          title: 'Beber 250 ml de água',
          description: 'Hidratação após 60 minutos de estudo.',
          category: 'HEALTH',
          dueAt: addMinutes(startedAt, 60),
          source: 'FOCUS',
        },
      });
      hydrationReminderId = hydration.id;
    }
    return tx.focusSession.create({
      data: {
        durationMinutes: input.durationMinutes,
        subject: input.subject,
        track: input.track,
        objective: input.objective,
        startedAt,
        endsAt: addMinutes(startedAt, input.durationMinutes),
        hydrationReminderId,
      },
      include: { hydrationReminder: true },
    });
  });
}

export async function finishFocus(id: string, cancelled = false) {
  const focus = await prisma.focusSession.findUnique({ where: { id } });
  if (!focus) throw new ApiError(404, 'FOCUS_NOT_FOUND', 'Sessão de foco não encontrada.');
  if (focus.status !== 'ACTIVE') throw new ApiError(409, 'FOCUS_ALREADY_CLOSED', 'A sessão de foco já foi encerrada.');
  return prisma.focusSession.update({
    where: { id },
    data: cancelled
      ? { status: 'CANCELLED', cancelledAt: new Date() }
      : { status: 'COMPLETED', completedAt: new Date() },
  });
}
