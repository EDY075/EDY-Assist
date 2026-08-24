import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/errors.js';
import { futureReviewDate } from '../lib/time.js';
import { STUDY_TRACKS } from './nlp.js';

const reviewIntervals = [1, 3, 7, 15, 30];

export async function createStudyLog(input: {
  focusSessionId?: string;
  subject: string;
  track: string;
  objective?: string;
  activityType?: string;
  notes?: string;
  difficulty?: number;
  durationMinutes?: number;
  questions?: number;
  correctAnswers?: number;
  studiedAt?: Date;
}) {
  const questions = input.questions ?? 0;
  const correctAnswers = input.correctAnswers ?? 0;
  if (questions < 0 || correctAnswers < 0 || correctAnswers > questions) {
    throw new ApiError(400, 'INVALID_PERFORMANCE', 'Acertos não podem ser maiores que o total de questões.');
  }
  const track = STUDY_TRACKS.find((item) => item === input.track.toUpperCase()) ?? input.track.toUpperCase();
  const studiedAt = input.studiedAt ?? new Date();
  return prisma.studyLog.create({
    data: {
      focusSessionId: input.focusSessionId,
      subject: input.subject.trim(),
      track,
      objective: input.objective,
      activityType: input.activityType ?? 'STUDY',
      notes: input.notes?.trim(),
      difficulty: input.difficulty,
      durationMinutes: input.durationMinutes ?? 0,
      questions,
      correctAnswers,
      studiedAt,
      reviews: {
        create: reviewIntervals.map((intervalDays) => ({
          subject: input.subject.trim(),
          intervalDays,
          dueAt: futureReviewDate(studiedAt, intervalDays),
        })),
      },
    },
    include: { reviews: { orderBy: { intervalDays: 'asc' } } },
  });
}

export async function listStudies(filters: { from?: Date; to?: Date; track?: string }) {
  return prisma.studyLog.findMany({
    where: {
      track: filters.track,
      studiedAt: filters.from || filters.to ? { gte: filters.from, lte: filters.to } : undefined,
    },
    include: { reviews: { orderBy: { dueAt: 'asc' } } },
    orderBy: { studiedAt: 'desc' },
  });
}

export async function completeReview(id: string) {
  const review = await prisma.review.findUnique({ where: { id } });
  if (!review) throw new ApiError(404, 'REVIEW_NOT_FOUND', 'Revisão não encontrada.');
  return prisma.review.update({ where: { id }, data: { status: 'COMPLETED', completedAt: new Date() } });
}
