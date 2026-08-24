import { addDays, endOfDay, endOfWeek, format, startOfDay, startOfWeek } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';

export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

export function zonedNow(timezone = DEFAULT_TIMEZONE, now = new Date()) {
  return toZonedTime(now, timezone);
}

export function localDateToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone = DEFAULT_TIMEZONE,
) {
  const localIso = `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day
    .toString()
    .padStart(2, '0')} ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;
  return fromZonedTime(localIso, timezone);
}

export function dayRangeUtc(date: Date, timezone = DEFAULT_TIMEZONE) {
  const local = toZonedTime(date, timezone);
  return {
    from: fromZonedTime(startOfDay(local), timezone),
    to: fromZonedTime(endOfDay(local), timezone),
  };
}

export function weekRangeUtc(date: Date, timezone = DEFAULT_TIMEZONE) {
  const local = toZonedTime(date, timezone);
  return {
    from: fromZonedTime(startOfWeek(local, { weekStartsOn: 1 }), timezone),
    to: fromZonedTime(endOfWeek(local, { weekStartsOn: 1 }), timezone),
  };
}

export function formatPt(date: Date, timezone = DEFAULT_TIMEZONE) {
  return format(toZonedTime(date, timezone), "dd/MM/yyyy 'às' HH:mm");
}

export function isQuietTime(
  now: Date,
  start: string,
  end: string,
  timezone = DEFAULT_TIMEZONE,
) {
  const value = format(toZonedTime(now, timezone), 'HH:mm');
  return start <= end ? value >= start && value < end : value >= start || value < end;
}

export function futureReviewDate(studiedAt: Date, intervalDays: number) {
  return addDays(studiedAt, intervalDays);
}
