export type ApiErrorBody = { error?: { code?: string; message?: string; details?: unknown } };

const API_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code = 'UNKNOWN_ERROR',
    readonly details?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...init?.headers,
    },
  });
  const body = (await response.json().catch(() => ({}))) as ApiErrorBody & { data?: T };
  if (!response.ok) {
    throw new ApiError(
      body.error?.message || 'Não foi possível concluir a solicitação.',
      response.status,
      body.error?.code,
      body.error?.details,
    );
  }
  return body.data as T;
}

export const api = {
  health: () => request<{ status: string; mode?: string }>('/health'),
  dashboard: async () => {
    const raw = await request<{
      todayReminders?: Reminder[];
      weekReminders?: Reminder[];
      overdueReminders?: Reminder[];
      currentFocus?: FocusSession | null;
      recentStudies?: Array<Study & { durationMinutes?: number }>;
      reviews?: Review[];
      dailyReport?: {
        studyMinutes?: number;
        focusMinutes?: number;
        questions?: number;
        correctAnswers?: number;
        accuracyPercent?: number;
      };
      weeklyReport?: {
        studyMinutes?: number;
        accuracyPercent?: number;
        byDay?: Array<{ day: string; minutes: number; accuracy?: number }>;
        byTrack?: Array<{ track: string; minutes: number }>;
      };
    }>('/dashboard');
    return {
      remindersToday: raw.todayReminders?.length ?? 0,
      focusMinutesToday: raw.dailyReport?.focusMinutes ?? 0,
      studyMinutesWeek: raw.weeklyReport?.studyMinutes ?? 0,
      accuracy: raw.weeklyReport?.accuracyPercent ?? raw.dailyReport?.accuracyPercent ?? 0,
      reminders: raw.weekReminders ?? raw.todayReminders ?? [],
      todayItems: raw.todayReminders ?? [],
      overdueReminders: raw.overdueReminders ?? [],
      recentStudies: raw.recentStudies?.map((item) => ({ ...item, minutes: item.durationMinutes ?? item.minutes ?? 0 })) ?? [],
      reviews: raw.reviews ?? [],
      focus: raw.currentFocus ?? null,
      weeklyStudy: raw.weeklyReport?.byDay ?? [],
      tracks: raw.weeklyReport?.byTrack?.map((item) => ({ name: item.track, minutes: item.minutes })) ?? [],
    } satisfies DashboardData;
  },
  reminders: () => request<Reminder[]>('/reminders'),
  createReminder: (input: { title: string; dueAt: string; category?: string; recurrence?: string }) =>
    request<Reminder>('/reminders', { method: 'POST', body: JSON.stringify(input) }),
  updateReminder: (id: string, input: Record<string, unknown>) =>
    request<Reminder>(`/reminders/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  studies: async () => {
    const items = await request<Array<Study & { durationMinutes?: number }>>('/studies');
    return items.map((item) => ({ ...item, minutes: item.durationMinutes ?? item.minutes ?? 0 }));
  },
  createStudy: (input: Record<string, unknown>) =>
    request<Study>('/studies', { method: 'POST', body: JSON.stringify(input) }),
  studyModules: (includeArchived = false) => request<StudyModule[]>(`/study-modules?includeArchived=${includeArchived}`),
  createStudyModule: (input: Pick<StudyModule, 'name' | 'description' | 'color' | 'topics'> & { goalMinutes?: number }) =>
    request<StudyModule>('/study-modules', { method: 'POST', body: JSON.stringify(input) }),
  updateStudyModule: (id: string, input: Partial<Pick<StudyModule, 'name' | 'description' | 'color' | 'topics' | 'goalMinutes' | 'isArchived'>>) =>
    request<StudyModule>(`/study-modules/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  reviews: () => request<Review[]>('/reviews'),
  completeReview: (id: string) => request<Review>(`/reviews/${id}/complete`, { method: 'PATCH' }),
  currentFocus: () => request<FocusSession | null>('/focus/current'),
  startFocus: (input: Record<string, unknown>) =>
    request<FocusSession>('/focus/start', { method: 'POST', body: JSON.stringify(input) }),
  finishFocus: (id: string) => request<FocusSession>(`/focus/${id}/finish`, { method: 'POST' }),
  reports: async (period: 'daily' | 'weekly') => {
    const raw = await request<{
      studyMinutes?: number; focusMinutes?: number; focusSessions?: number; questions?: number;
      correctAnswers?: number; accuracyPercent?: number; byTrack?: Array<{ track: string; minutes: number }>;
      byDay?: Array<{ day: string; minutes: number; accuracy?: number }>;
    }>(`/reports?period=${period}`);
    return {
      totalMinutes: raw.studyMinutes ?? 0,
      sessions: raw.focusSessions ?? 0,
      questions: raw.questions ?? 0,
      correctAnswers: raw.correctAnswers ?? 0,
      byTrack: raw.byTrack?.map((item) => ({ name: item.track, value: item.minutes })) ?? [],
      byDay: raw.byDay ?? [],
    } satisfies ReportData;
  },
  settings: async () => normalizeSettings(await request<Record<string, unknown>>('/settings')),
  saveSettings: async (input: Partial<Settings>) => {
    const body = {
      timezone: input.timezone,
      quietEnabled: input.quietHoursEnabled,
      quietStart: input.quietHoursStart,
      quietEnd: input.quietHoursEnd,
      waterReminderEnabled: input.waterReminderEnabled,
    };
    return normalizeSettings(await request<Record<string, unknown>>('/settings', { method: 'PATCH', body: JSON.stringify(body) }));
  },
  messages: () => request<ChatMessage[]>('/messages'),
  chat: (text: string, sessionId = 'local-ui') =>
    request<{ reply?: string; message?: ChatMessage; outbound?: ChatMessage; requiresConfirmation?: boolean }>('/chat', {
      method: 'POST',
      body: JSON.stringify({ text, sessionId }),
    }),
};

function normalizeSettings(raw: Record<string, unknown>): Settings {
  return {
    timezone: String(raw.timezone ?? 'America/Sao_Paulo'),
    quietHoursEnabled: Boolean(raw.quietEnabled),
    quietHoursStart: String(raw.quietStart ?? '22:00'),
    quietHoursEnd: String(raw.quietEnd ?? '07:00'),
    waterReminderEnabled: raw.waterReminderEnabled !== false,
    whatsappMode: raw.appMode === 'WHATSAPP',
  };
}

export type Reminder = {
  id: string;
  title: string;
  dueAt: string;
  status: string;
  category?: string;
  recurrence?: string | null;
  createdAt?: string;
  completedAt?: string | null;
};

export type Study = {
  id: string;
  subject: string;
  track: string;
  objective?: string;
  minutes: number;
  questions?: number;
  correctAnswers?: number;
  studiedAt?: string;
  activityType?: 'STUDY' | 'CLASS' | 'REVIEW';
  notes?: string;
  difficulty?: number;
};

export type StudyModule = {
  id: string;
  name: string;
  description?: string | null;
  color: string;
  topics: string[];
  isStarter: boolean;
  goalMinutes: number;
  isArchived: boolean;
  archivedAt?: string | null;
};

export type Review = {
  id: string;
  subject: string;
  track: string;
  intervalDays: number;
  dueAt: string;
  status: string;
};

export type FocusSession = {
  id: string;
  durationMinutes: number;
  startedAt: string;
  endsAt?: string;
  subject?: string;
  track?: string;
  objective?: string;
  status?: string;
};

export type ChatMessage = {
  id: string;
  direction?: 'INBOUND' | 'OUTBOUND' | 'in' | 'out';
  role?: 'user' | 'assistant';
  text?: string;
  content?: string;
  createdAt: string;
};

export type Settings = {
  timezone?: string;
  quietHoursEnabled?: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  waterReminderEnabled?: boolean;
  whatsappMode?: boolean;
};

export type DashboardData = {
  remindersToday?: number;
  focusMinutesToday?: number;
  studyMinutesWeek?: number;
  accuracy?: number;
  reminders?: Reminder[];
  todayItems?: Reminder[];
  overdueReminders?: Reminder[];
  recentStudies?: Study[];
  reviews?: Review[];
  focus?: FocusSession | null;
  weeklyStudy?: Array<{ day: string; minutes: number }>;
  tracks?: Array<{ name: string; minutes: number; color?: string }>;
};

export type ReportData = {
  totalMinutes?: number;
  sessions?: number;
  questions?: number;
  correctAnswers?: number;
  streak?: number;
  byDay?: Array<{ day: string; minutes: number; accuracy?: number }>;
  byTrack?: Array<{ name: string; value: number }>;
};
