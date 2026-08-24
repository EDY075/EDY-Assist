import { addDays, addMinutes, getDay, getDaysInMonth } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { DEFAULT_TIMEZONE, localDateToUtc } from '../lib/time.js';

export const STUDY_TRACKS = [
  'ENEM',
  'VESTIBULAR',
  'FACULDADE',
  'POWER BI',
  'INGLÊS',
  'PROGRAMAÇÃO',
  'CIBERSEGURANÇA',
  'REDES DE COMPUTADORES',
  'LINUX',
  'WINDOWS',
  'SEGURANÇA DA INFORMAÇÃO',
  'BLUE TEAM E SOC',
  'CERTIFICAÇÕES',
] as const;

export type ParsedCommand =
  | { type: 'CREATE_REMINDER'; title: string; category: string; dueAt?: Date; recurrence: string; needsConfirmation?: string }
  | { type: 'REMINDER_ACTION'; action: 'COMPLETE' | 'CANCEL' | 'SNOOZE' | 'RESCHEDULE'; minutes?: number; dueAt?: Date; needsConfirmation?: string }
  | { type: 'AGENDA_QUERY'; period: 'TODAY' | 'TOMORROW' | 'WEEK' }
  | { type: 'START_FOCUS'; durationMinutes: number; subject?: string; track?: string; objective?: string }
  | { type: 'LOG_STUDY'; questions: number; correctAnswers: number; durationMinutes?: number; subject?: string; track?: string }
  | { type: 'STUDY_SUGGESTION' }
  | { type: 'PERFORMANCE_QUERY' }
  | { type: 'REVIEW_QUERY' }
  | { type: 'UNKNOWN' };

const weekdays: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  'segunda-feira': 1,
  terca: 2,
  'terca-feira': 2,
  quarta: 3,
  'quarta-feira': 3,
  quinta: 4,
  'quinta-feira': 4,
  sexta: 5,
  'sexta-feira': 5,
  sabado: 6,
};

export function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function extractTime(text: string) {
  const normalized = normalize(text);
  const match = normalized.match(/(?:\bas\s+|\bpelas?\s+|\b)([01]?\d|2[0-3])(?::|h)([0-5]\d)?\b/);
  if (match) return { hour: Number(match[1]), minute: Number(match[2] ?? 0) };
  const bare = normalized.match(/(?:\bas\s+|\bpelas?\s+)([01]?\d|2[0-3])\b/);
  if (bare) return { hour: Number(bare[1]), minute: 0 };
  const hours = normalized.match(/\b([01]?\d|2[0-3])\s*horas?\b/);
  return hours ? { hour: Number(hours[1]), minute: 0 } : undefined;
}

export function parseDateTime(text: string, timezone = DEFAULT_TIMEZONE, now = new Date()) {
  const normalized = normalize(text);
  const relative = normalized.match(/(?:daqui\s+a|depois\s+de)\s+(?:(uma|um)\s+|(\d+)\s*)(hora|minuto)s?/);
  if (relative) {
    const amount = relative[1] ? 1 : Number(relative[2] ?? 1);
    const minutes = relative[3] === 'hora' ? amount * 60 : amount;
    return { dueAt: addMinutes(now, minutes) };
  }
  const time = extractTime(text);
  if (!time) return { needsConfirmation: 'Informe também o horário exato.' };

  const localNow = toZonedTime(now, timezone);
  let year = localNow.getFullYear();
  let month = localNow.getMonth() + 1;
  let day = localNow.getDate();
  let dateFound = false;

  if (normalized.includes('depois de amanha')) {
    const target = addDays(localNow, 2);
    year = target.getFullYear(); month = target.getMonth() + 1; day = target.getDate(); dateFound = true;
  } else if (normalized.includes('amanha')) {
    const target = addDays(localNow, 1);
    year = target.getFullYear(); month = target.getMonth() + 1; day = target.getDate(); dateFound = true;
  } else if (normalized.includes('hoje')) {
    dateFound = true;
  }

  const fullDate = normalized.match(/\b([0-3]?\d)[\/-]([01]?\d)(?:[\/-](\d{2,4}))?\b/);
  if (fullDate) {
    day = Number(fullDate[1]); month = Number(fullDate[2]);
    if (fullDate[3]) {
      year = Number(fullDate[3]);
      if (year < 100) year += 2000;
    }
    if (month < 1 || month > 12 || day < 1 || day > getDaysInMonth(new Date(year, month - 1))) {
      return { needsConfirmation: 'A data informada não é válida. Confirme no formato DD/MM/AAAA e o horário.' };
    }
    dateFound = true;
    if (!fullDate[3]) {
      const candidate = localDateToUtc(year, month, day, time.hour, time.minute, timezone);
      if (candidate <= now) year += 1;
    }
  }

  if (!fullDate && !dateFound) {
    const dayOnly = normalized.match(/\bdia\s+([0-3]?\d)\b/);
    if (dayOnly) {
      day = Number(dayOnly[1]);
      if (day < 1 || day > getDaysInMonth(new Date(year, month - 1))) {
        return { needsConfirmation: 'Esse dia não existe no mês indicado. Confirme a data completa e o horário.' };
      }
      let candidate = localDateToUtc(year, month, day, time.hour, time.minute, timezone);
      if (candidate <= now) {
        month += 1;
        if (month > 12) { month = 1; year += 1; }
        if (day > getDaysInMonth(new Date(year, month - 1))) {
          return { needsConfirmation: 'Esse dia não existe no próximo mês. Confirme a data completa e o horário.' };
        }
        candidate = localDateToUtc(year, month, day, time.hour, time.minute, timezone);
      }
      dateFound = true;
    }
  }

  if (!fullDate && !dateFound) {
    for (const [name, targetDay] of Object.entries(weekdays)) {
      if (normalized.includes(name)) {
        let delta = (targetDay - getDay(localNow) + 7) % 7;
        if (delta === 0) delta = 7;
        const target = addDays(localNow, delta);
        year = target.getFullYear(); month = target.getMonth() + 1; day = target.getDate(); dateFound = true;
        break;
      }
    }
  }

  if (!dateFound) return { needsConfirmation: 'Qual é a data exata? Você pode responder, por exemplo, “amanhã às 14h”.' };
  const dueAt = localDateToUtc(year, month, day, time.hour, time.minute, timezone);
  if (dueAt <= now) return { needsConfirmation: 'Esse horário já passou. Confirme uma data e um horário futuros.' };
  return { dueAt };
}

function detectTrack(text: string) {
  const normalized = normalize(text);
  return STUDY_TRACKS.find((track) => normalized.includes(normalize(track)));
}

function detectRecurrence(text: string) {
  const normalized = normalize(text);
  if (/\b(todo|toda)\s+(dia|manha|tarde|noite)\b|diariamente/.test(normalized)) return 'DAILY';
  if (/\b(todo|toda)\s+(segunda|terca|quarta|quinta|sexta|sabado|domingo)\b|semanalmente/.test(normalized)) return 'WEEKLY';
  if (/\b(todo|toda)\s+mes\b|mensalmente/.test(normalized)) return 'MONTHLY';
  return 'NONE';
}

function reminderTitle(text: string) {
  return text
    .replace(/^\s*(me\s+)?(lembre|lembrar|marque|marcar|agende|agendar|adicione|adicionar)(-me)?\s+((?:d[oa]|[oa])\s+|para\s+)?/i, '')
    .split(/\s+(?:(?:para\s+)?(?:hoje|amanh[ãa]|depois de amanh[ãa]|segunda(?:-feira)?|ter[çc]a(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|s[áa]bado|domingo|dia\s+\d|\d{1,2}[\/-]\d{1,2})|(?:daqui\s+a|depois\s+de)\s+(?:uma|um|\d+))\b/i)[0]
    ?.replace(/[.,;:]$/, '')
    .trim() || 'Novo compromisso';
}

function categoryOf(text: string) {
  const normalized = normalize(text);
  if (/\baula\b/.test(normalized)) return 'CLASS';
  if (/\b(post|publicacao|publicar)\b/.test(normalized)) return 'PUBLICATION';
  if (/\b(tarefa|trabalho|prova)\b/.test(normalized)) return 'TASK';
  if (/\bagua|hidrata/.test(normalized)) return 'HEALTH';
  return 'GENERAL';
}

export function parseCommand(text: string, timezone = DEFAULT_TIMEZONE, now = new Date()): ParsedCommand {
  const normalized = normalize(text);

  if (/\b(?:o que|oq) (eu )?tenho hoje\b|\bagenda (de )?hoje\b|\bmeu dia\b/.test(normalized)) return { type: 'AGENDA_QUERY', period: 'TODAY' };
  if (/\b(tenho|ha|tem) algo (a )?mais hoje\b|\balem do que ja estava marcado\b/.test(normalized)) return { type: 'AGENDA_QUERY', period: 'TODAY' };
  if (/\b(?:o que|oq) (eu )?tenho amanha\b|\bagenda (de )?amanha\b/.test(normalized)) return { type: 'AGENDA_QUERY', period: 'TOMORROW' };
  if (/\bo que (eu )?tenho (na|essa|esta) semana\b|\bagenda semanal\b|\bminha semana\b/.test(normalized)) return { type: 'AGENDA_QUERY', period: 'WEEK' };

  if (/\b(qual|o que) (materia|assunto) (eu )?(devo|posso) estudar agora\b|\bo que estudar agora\b/.test(normalized)) return { type: 'STUDY_SUGGESTION' };
  if (/\b(qual|que) (materia|assunto).*(menor|pior) aproveitamento\b|\bmenor aproveitamento\b/.test(normalized)) return { type: 'PERFORMANCE_QUERY' };
  if (/\b(quais|listar?|mostre).*\brevis(ao|oes).*\batrasad/.test(normalized) || /\brevis(ao|oes) atrasad/.test(normalized)) return { type: 'REVIEW_QUERY' };

  if (/\b(adie|adiar|postergue|postergar)\b/.test(normalized)) {
    if (/\b(hoje|amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo|dia\s+\d|\d{1,2}[\/-]\d{1,2})\b/.test(normalized)) {
      const parsed = parseDateTime(text, timezone, now);
      return { type: 'REMINDER_ACTION', action: 'RESCHEDULE', ...parsed };
    }
    const minutes = Number(normalized.match(/(\d+)\s*(?:min|minuto)/)?.[1] ?? 15);
    return { type: 'REMINDER_ACTION', action: 'SNOOZE', minutes };
  }
  if (/\b(reagende|reagendar|remarque|remarcar)\b/.test(normalized)) {
    const parsed = parseDateTime(text, timezone, now);
    return { type: 'REMINDER_ACTION', action: 'RESCHEDULE', ...parsed };
  }
  if (/\b(conclua|concluir|concluido|feito)\b/.test(normalized) && /\b(lembrete|compromisso|tarefa|esse|este)\b/.test(normalized)) return { type: 'REMINDER_ACTION', action: 'COMPLETE' };
  if (/\b(cancele|cancelar)\b/.test(normalized)) return { type: 'REMINDER_ACTION', action: 'CANCEL' };

  if (/\b(iniciar|inicie|comecar|comece)\b.*\b(foco|estudo)\b/.test(normalized)) {
    const durationMinutes = Number(normalized.match(/(\d+)\s*(?:min|minuto)/)?.[1] ?? 25);
    const subject = text.match(/(?:estudando|estudo\s+de)\s+(.+?)(?:\s+(?:por|para)\s+(?:(?:o\s+|a\s+)?(?:ENEM|vestibular|faculdade|Power BI|ingl[eê]s|programa[çc][aã]o|ciberseguran[çc]a)|\d+\s*(?:min|minuto))|[.!?]|$)/i)?.[1]?.trim();
    return { type: 'START_FOCUS', durationMinutes, subject, track: detectTrack(text) };
  }

  if ((/\b(registre|registrar|anote|anotar)\b/.test(normalized) && /\bquest/.test(normalized)) || /\b(fiz|resolvi)\s+\d+\s*quest/.test(normalized)) {
    const questions = Number(normalized.match(/(\d+)\s*quest/)?.[1] ?? 0);
    const correctAnswers = Number(normalized.match(/\bacertei\s+(\d+)/)?.[1] ?? normalized.match(/(\d+)\s*acert/)?.[1] ?? 0);
    const durationMinutes = Number(normalized.match(/(\d+)\s*(?:min|minuto)/)?.[1] ?? 0) || undefined;
    return { type: 'LOG_STUDY', questions, correctAnswers, durationMinutes, track: detectTrack(text) };
  }

  if (/\b(estudei|revisei)\b/.test(normalized)) {
    const subject = text.match(/(?:estudei|revisei)\s+(.+?)(?:\s+por\s+|[.!?]|$)/i)?.[1]?.trim();
    const hours = Number(normalized.match(/(\d+)\s*horas?/)?.[1] ?? (/\buma? hora\b/.test(normalized) ? 1 : 0));
    const minutes = Number(normalized.match(/(\d+)\s*(?:min|minuto)/)?.[1] ?? 0);
    return { type: 'LOG_STUDY', questions: 0, correctAnswers: 0, durationMinutes: hours * 60 + minutes || undefined, subject, track: detectTrack(text) };
  }

  if (/\b(lembre|lembrar|marque|marcar|agende|agendar|adicione|adicionar)\b/.test(normalized)) {
    const parsed = parseDateTime(text, timezone, now);
    return {
      type: 'CREATE_REMINDER',
      title: reminderTitle(text),
      category: categoryOf(text),
      recurrence: detectRecurrence(text),
      ...parsed,
    };
  }

  return { type: 'UNKNOWN' };
}
