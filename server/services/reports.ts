import { prisma } from '../lib/prisma.js';
import { dayRangeUtc, weekRangeUtc } from '../lib/time.js';
import { eachDayOfInterval, format, startOfDay } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

export async function buildReport(period: 'daily' | 'weekly', timezone: string, reference = new Date()) {
  const range = period === 'daily' ? dayRangeUtc(reference, timezone) : weekRangeUtc(reference, timezone);
  const [studies, focusSessions, reminders, completedReminders, reviewsDue] = await Promise.all([
    prisma.studyLog.findMany({ where: { studiedAt: { gte: range.from, lte: range.to } } }),
    prisma.focusSession.findMany({ where: { startedAt: { gte: range.from, lte: range.to } } }),
    prisma.reminder.count({ where: { dueAt: { gte: range.from, lte: range.to } } }),
    prisma.reminder.count({ where: { completedAt: { gte: range.from, lte: range.to } } }),
    prisma.review.count({ where: { dueAt: { gte: range.from, lte: range.to }, status: 'PENDING' } }),
  ]);
  const questions = studies.reduce((sum, item) => sum + item.questions, 0);
  const correctAnswers = studies.reduce((sum, item) => sum + item.correctAnswers, 0);
  const daily = studies.reduce<Record<string, { minutes: number; questions: number; correctAnswers: number }>>((acc, item) => {
    const key = format(toZonedTime(item.studiedAt, timezone), 'yyyy-MM-dd');
    const value = acc[key] ?? { minutes: 0, questions: 0, correctAnswers: 0 };
    value.minutes += item.durationMinutes;
    value.questions += item.questions;
    value.correctAnswers += item.correctAnswers;
    acc[key] = value;
    return acc;
  }, {});
  const weekdayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const localDays = eachDayOfInterval({
    start: startOfDay(toZonedTime(range.from, timezone)),
    end: startOfDay(toZonedTime(range.to, timezone)),
  });
  return {
    period,
    from: range.from,
    to: range.to,
    studyMinutes: studies.reduce((sum, item) => sum + item.durationMinutes, 0),
    focusMinutes: focusSessions.filter((item) => item.status !== 'CANCELLED').reduce((sum, item) => sum + item.durationMinutes, 0),
    focusSessions: focusSessions.length,
    questions,
    correctAnswers,
    accuracyPercent: questions ? Math.round((correctAnswers / questions) * 1000) / 10 : 0,
    reminders,
    completedReminders,
    reviewsDue,
    byDay: localDays.map((day) => {
      const values = daily[format(day, 'yyyy-MM-dd')] ?? { minutes: 0, questions: 0, correctAnswers: 0 };
      return {
        day: period === 'weekly' ? weekdayNames[day.getDay()] : format(day, 'dd/MM'),
        ...values,
        accuracy: values.questions ? Math.round((values.correctAnswers / values.questions) * 1000) / 10 : 0,
      };
    }),
    byTrack: Object.entries(
      studies.reduce<Record<string, { minutes: number; questions: number; correctAnswers: number }>>((acc, item) => {
        const current = acc[item.track] ?? { minutes: 0, questions: 0, correctAnswers: 0 };
        current.minutes += item.durationMinutes;
        current.questions += item.questions;
        current.correctAnswers += item.correctAnswers;
        acc[item.track] = current;
        return acc;
      }, {}),
    ).map(([track, values]) => ({ track, ...values })),
  };
}
