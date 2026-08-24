import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Switch } from '@base-ui/react/switch';
import { fromZonedTime } from 'date-fns-tz';
import { AnimatePresence, motion } from 'motion/react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlarmClock,
  Archive,
  ArchiveRestore,
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  Cloud,
  Droplets,
  Download,
  Focus,
  Gauge,
  History,
  LayoutDashboard,
  LoaderCircle,
  Menu,
  MessageCircle,
  Mic,
  MoonStar,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Settings as SettingsIcon,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { activatePwaUpdate } from './pwa';
import {
  ApiError,
  ChatMessage,
  DashboardData,
  FocusSession,
  Reminder,
  ReportData,
  Settings,
  Study,
  StudyModule,
  Review,
  api,
} from './api';

type Page = 'dashboard' | 'agenda' | 'estudos' | 'foco' | 'relatorios' | 'whatsapp' | 'historico' | 'configuracoes';
type Theme = 'obsidian' | 'midnight' | 'graphite' | 'oled';
type AsyncState<T> = { status: 'loading' | 'success' | 'error'; data: T; error?: string };
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

const nav: Array<{ id: Page; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'Hoje', icon: LayoutDashboard },
  { id: 'agenda', label: 'Agenda', icon: CalendarDays },
  { id: 'estudos', label: 'Estudos', icon: BookOpen },
  { id: 'foco', label: 'Modo Foco', icon: Focus },
  { id: 'relatorios', label: 'Relatórios', icon: BarChart3 },
  { id: 'whatsapp', label: 'Assistente', icon: MessageCircle },
  { id: 'historico', label: 'Histórico', icon: History },
  { id: 'configuracoes', label: 'Configurações', icon: SettingsIcon },
];

const pageMeta: Record<Page, { eyebrow: string; title: string; description: string }> = {
  dashboard: { eyebrow: 'HOJE', title: 'Seu dia, com clareza', description: 'Prioridades, agenda, estudos e bem-estar em um só lugar.' },
  agenda: { eyebrow: 'PLANEJAMENTO', title: 'Agenda inteligente', description: 'Compromissos, lembretes e recorrências sem atrito.' },
  estudos: { eyebrow: 'CENTRAL DE ESTUDOS', title: 'Construa consistência', description: 'Acompanhe matérias, questões, acertos e revisões.' },
  foco: { eyebrow: 'AMBIENTE DE FOCO', title: 'Uma coisa por vez', description: 'Escolha uma duração, silencie o ruído e comece.' },
  relatorios: { eyebrow: 'EVOLUÇÃO', title: 'Relatórios de desempenho', description: 'Entenda onde seu tempo está gerando resultado.' },
  whatsapp: { eyebrow: 'ASSISTENTE PESSOAL', title: 'Converse com o EDY Assist', description: 'Organize sua rotina em linguagem natural, com os mesmos dados do WhatsApp.' },
  historico: { eyebrow: 'MEMÓRIA', title: 'Histórico de mensagens', description: 'Consulte comandos, confirmações e respostas anteriores.' },
  configuracoes: { eyebrow: 'PREFERÊNCIAS', title: 'Configurações', description: 'Personalize notificações, silêncio, hidratação e integração.' },
};

const tracks = ['Redes de Computadores', 'Linux', 'Windows', 'Segurança da Informação', 'Blue Team e SOC', 'Power BI', 'Programação', 'Inglês', 'ENEM', 'Vestibular', 'Faculdade', 'Certificações'];
const chartColors = ['#7c5cff', '#22d3ee', '#31e8a4', '#f5b94c', '#ff6b9e', '#5b8cff', '#9b7bff'];
const fallbackWeekly = [
  { day: 'Seg', minutes: 0 }, { day: 'Ter', minutes: 0 }, { day: 'Qua', minutes: 0 },
  { day: 'Qui', minutes: 0 }, { day: 'Sex', minutes: 0 }, { day: 'Sáb', minutes: 0 }, { day: 'Dom', minutes: 0 },
];

function App() {
  const initialPage = new URLSearchParams(window.location.search).get('page');
  const [page, setPage] = useState<Page>(nav.some((item) => item.id === initialPage) ? initialPage as Page : 'dashboard');
  const [mobileNav, setMobileNav] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('edy-assist-theme') as Theme) || 'obsidian');
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [updateRegistration, setUpdateRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('edy-assist-theme', theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'oled' ? '#000000' : theme === 'midnight' ? '#06142a' : theme === 'graphite' ? '#111214' : '#08090d');
  }, [theme]);

  useEffect(() => {
    let active = true;
    const check = () => api.health().then((result) => active && setOnline(result?.status === 'ok')).catch(() => active && setOnline(false));
    const connectionChanged = () => void check();
    void check();
    const timer = window.setInterval(check, 30_000);
    window.addEventListener('online', connectionChanged);
    window.addEventListener('offline', connectionChanged);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('online', connectionChanged); window.removeEventListener('offline', connectionChanged); };
  }, []);

  useEffect(() => {
    const beforeInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent); };
    const installed = () => setInstallPrompt(null);
    const updateReady = (event: Event) => setUpdateRegistration((event as CustomEvent<ServiceWorkerRegistration>).detail);
    window.addEventListener('beforeinstallprompt', beforeInstall);
    window.addEventListener('appinstalled', installed);
    window.addEventListener('edy-pwa-update', updateReady);
    return () => { window.removeEventListener('beforeinstallprompt', beforeInstall); window.removeEventListener('appinstalled', installed); window.removeEventListener('edy-pwa-update', updateReady); };
  }, []);

  useActiveReminderNotifications();

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const navigate = (next: Page) => {
    setPage(next);
    setMobileNav(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') setToast('EDY Assist instalado.');
    setInstallPrompt(null);
  };

  return (
    <div className="app-shell">
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />
      <a className="skip-link" href="#conteudo">Pular para o conteúdo</a>
      <Sidebar active={page} open={mobileNav} onClose={() => setMobileNav(false)} onNavigate={navigate} />

      <main id="conteudo" className="main-shell">
        <Topbar online={online} onMenu={() => setMobileNav(true)} onQuick={() => setQuickOpen(true)} canInstall={Boolean(installPrompt)} onInstall={install} />
        <StatusBanners online={online} updateRegistration={updateRegistration} onUpdated={() => setUpdateRegistration(null)} />
        <div className="page-wrap">
          <PageHeader page={page} />
          <AnimatePresence mode="wait">
            <motion.div
              key={page}
              className="page-content"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.22 }}
            >
              {page === 'dashboard' && <DashboardPage onNavigate={navigate} />}
              {page === 'agenda' && <AgendaPage onToast={setToast} />}
              {page === 'estudos' && <StudiesPage onToast={setToast} />}
              {page === 'foco' && <FocusPage onToast={setToast} />}
              {page === 'relatorios' && <ReportsPage />}
              {page === 'whatsapp' && <WhatsAppPage onToast={setToast} />}
              {page === 'historico' && <HistoryPage />}
              {page === 'configuracoes' && <SettingsPage onToast={setToast} theme={theme} onTheme={setTheme} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      <BottomNav active={page} onNavigate={navigate} />

      <QuickCapture open={quickOpen} onOpenChange={setQuickOpen} onSaved={() => setToast('Comando processado com sucesso.')} />
      <AnimatePresence>
        {toast && (
          <motion.div className="toast" role="status" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Check size={17} /> {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Sidebar({ active, open, onNavigate, onClose }: { active: Page; open: boolean; onNavigate: (p: Page) => void; onClose: () => void }) {
  return (
    <>
      <button className={`sidebar-backdrop ${open ? 'is-open' : ''}`} onClick={onClose} aria-label="Fechar menu" />
      <aside className={`sidebar ${open ? 'is-open' : ''}`} aria-label="Navegação principal">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true"><span /><i /></div>
          <div><strong>EDY</strong><b>ASSIST</b></div>
          <button className="icon-btn sidebar-close" onClick={onClose} aria-label="Fechar menu"><X size={19} /></button>
        </div>
        <div className="workspace-pill"><span className="live-dot" /> Espaço pessoal <ChevronRight size={15} /></div>
        <nav className="nav-list">
          <p className="nav-label">SEU ESPAÇO</p>
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={`nav-item ${active === item.id ? 'active' : ''}`} onClick={() => onNavigate(item.id)} aria-current={active === item.id ? 'page' : undefined}>
                <Icon size={19} strokeWidth={1.8} /><span>{item.label}</span>{active === item.id && <i />}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="mini-orbit"><Sparkles size={17} /><span>Seu dia em equilíbrio</span></div>
          <small>America/Sao_Paulo</small>
        </div>
      </aside>
    </>
  );
}

function Topbar({ online, onMenu, onQuick, canInstall, onInstall }: { online: boolean | null; onMenu: () => void; onQuick: () => void; canInstall: boolean; onInstall: () => void }) {
  return (
    <header className="topbar">
      <button className="icon-btn menu-btn" onClick={onMenu} aria-label="Abrir menu"><Menu size={21} /></button>
      <div className="search-box"><Search size={17} /><span>Buscar lembretes, matérias...</span><kbd>Ctrl K</kbd></div>
      <div className={`connection ${online === false ? 'offline' : ''}`} title={online ? 'API local conectada' : 'API indisponível'}>
        {online === null ? <LoaderCircle className="spin" size={15} /> : online ? <Wifi size={15} /> : <WifiOff size={15} />}
        <span>{online === null ? 'Conectando' : online ? 'Local ativo' : 'API offline'}</span>
      </div>
      <button className="icon-btn" aria-label="Notificações"><Bell size={19} /><i className="notification-dot" /></button>
      {canInstall && <button className="secondary-btn install-btn" onClick={onInstall}><Download size={16}/> <span>Instalar</span></button>}
      <button className="primary-btn compact" onClick={onQuick}><Plus size={17} /> <span>Novo</span></button>
      <div className="avatar" title="Perfil EDY">E</div>
    </header>
  );
}

function StatusBanners({ online, updateRegistration, onUpdated }: { online: boolean | null; updateRegistration: ServiceWorkerRegistration | null; onUpdated: () => void }) {
  return <div className="status-banners" aria-live="polite">
    {online === false && <div className="app-status-banner offline"><WifiOff size={17}/><span><b>Sem conexão com a API.</b> O que você digitar será mantido, mas só poderá ser salvo quando o computador e o túnel voltarem.</span></div>}
    {updateRegistration && <div className="app-status-banner update"><RefreshCw size={17}/><span><b>Nova versão disponível.</b> Atualize quando terminar o que está digitando.</span><button onClick={() => { activatePwaUpdate(updateRegistration); onUpdated(); }}>Atualizar</button></div>}
  </div>;
}

function useActiveReminderNotifications() {
  useEffect(() => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    let stopped = false;
    const notifiedKey = 'edy-assist-active-notifications';
    const readNotified = () => {
      try { return new Set<string>(JSON.parse(localStorage.getItem(notifiedKey) || '[]') as string[]); }
      catch { return new Set<string>(); }
    };
    const check = async () => {
      if (stopped || document.visibilityState !== 'visible') return;
      try {
        const reminders = await api.reminders();
        const now = Date.now();
        const notified = readNotified();
        for (const reminder of reminders) {
          const due = new Date(reminder.dueAt).getTime();
          if (reminder.status !== 'PENDING' || due > now || due < now - 90_000 || notified.has(reminder.id)) continue;
          const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
          if (registration) {
            await registration.showNotification('EDY Assist', {
              body: reminder.title,
              icon: '/icons/edy-assist.svg',
              badge: '/icons/edy-assist-maskable.svg',
              tag: `reminder-${reminder.id}`,
              data: { url: '/?page=agenda' },
            });
          } else {
            new Notification('EDY Assist', { body: reminder.title, icon: '/icons/edy-assist.svg', tag: `reminder-${reminder.id}` });
          }
          notified.add(reminder.id);
        }
        localStorage.setItem(notifiedKey, JSON.stringify([...notified].slice(-100)));
      } catch { /* O banner global informa quando a API está indisponível. */ }
    };
    void check();
    const timer = window.setInterval(check, 30_000);
    const visible = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', visible);
    return () => { stopped = true; window.clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, []);
}

const mobileNavItems = nav.filter((item) => ['dashboard', 'agenda', 'whatsapp', 'estudos', 'foco'].includes(item.id));
function BottomNav({ active, onNavigate }: { active: Page; onNavigate: (page: Page) => void }) {
  return <nav className="bottom-nav" aria-label="Navegação móvel">{mobileNavItems.map((item) => {
    const Icon = item.icon;
    return <button key={item.id} className={active === item.id ? 'active' : ''} onClick={() => onNavigate(item.id)} aria-current={active === item.id ? 'page' : undefined}><Icon size={19}/><span>{item.label}</span></button>;
  })}</nav>;
}

function PageHeader({ page }: { page: Page }) {
  const meta = pageMeta[page];
  return <div className="page-header"><div><span className="eyebrow">{meta.eyebrow}</span><h1>{meta.title}</h1><p>{meta.description}</p></div><time>{formatFullDate(new Date())}</time></div>;
}

function useApiData<T>(loader: () => Promise<T>, initial: T) {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading', data: initial });
  const load = useCallback(() => {
    setState((s) => ({ ...s, status: 'loading', error: undefined }));
    loader().then((data) => setState({ status: 'success', data })).catch((error: unknown) => {
      const message = error instanceof ApiError ? error.message : 'Não foi possível carregar os dados.';
      setState((s) => ({ ...s, status: 'error', error: message }));
    });
  }, [loader]);
  useEffect(load, [load]);
  return { ...state, reload: load, setState };
}

function DashboardPage({ onNavigate }: { onNavigate: (p: Page) => void }) {
  const loader = useCallback(() => api.dashboard(), []);
  const state = useApiData<DashboardData>(loader, {});
  const weekly = state.data.weeklyStudy?.length ? state.data.weeklyStudy : fallbackWeekly;
  if (state.status === 'loading') return <PageLoading />;
  if (state.status === 'error') return <ErrorState message={state.error!} onRetry={state.reload} />;
  const today = state.data.todayItems ?? [];
  const overdue = state.data.overdueReminders ?? [];
  const completed = today.filter((item) => item.status === 'COMPLETED');
  const pending = today.filter((item) => item.status === 'PENDING');
  const next = pending[0];
  const study = state.data.recentStudies?.[0];
  const review = state.data.reviews?.[0];
  return <>
    <section className="today-hero">
      <div><span className="eyebrow">PRÓXIMA ATIVIDADE</span><h2>{next?.title || 'Agenda livre no momento'}</h2><p>{next ? formatDateTime(next.dueAt) : 'Use o Assistente para planejar seu próximo passo.'}</p></div>
      <button className="primary-btn" onClick={() => onNavigate(next ? 'agenda' : 'whatsapp')}>{next ? <CalendarDays size={17}/> : <Sparkles size={17}/>} {next ? 'Abrir agenda' : 'Planejar com o EDY'}</button>
    </section>
    <section className="metric-grid" aria-label="Resumo do dia">
      <MetricCard icon={CalendarDays} label="Marcados hoje" value={pending.length} unit="pendentes" color="violet" />
      <MetricCard icon={CircleAlert} label="Atrasados" value={overdue.length} unit="prioridades" color="amber" />
      <MetricCard icon={Check} label="Concluídos" value={completed.length} unit="finalizados" color="green" />
      <MetricCard icon={Focus} label="Foco hoje" value={state.data.focusMinutesToday ?? 0} unit="min" color="cyan" />
    </section>
    <div className="dashboard-grid today-grid">
      <Panel className="span-2" title="Agenda de hoje" subtitle={`${pending.length} pendentes · ${completed.length} concluídos`} action={<button className="text-btn" onClick={() => onNavigate('agenda')}>Ver agenda <ChevronRight size={14}/></button>}>
        <ReminderList reminders={today} emptyText="Nenhum compromisso para hoje." compact showOrigin />
      </Panel>
      <Panel title="Prioridades" subtitle="Atenção recomendada pelo assistente">
        <div className="priority-stack">
          {overdue[0] && <button onClick={() => onNavigate('agenda')}><CircleAlert size={18}/><span><b>{overdue[0].title}</b><small>Atrasado · resolver ou reagendar</small></span></button>}
          {review && <button onClick={() => onNavigate('estudos')}><RotateCcw size={18}/><span><b>Revisar {review.subject}</b><small>Sugestão do EDY Assist · ciclo de {review.intervalDays} dias</small></span></button>}
          {!overdue.length && !review && <EmptyState icon={Check} title="Tudo em ordem" text="Nenhuma prioridade urgente agora."/>}
        </div>
      </Panel>
      <Panel title="Estudo planejado" subtitle="Seu avanço mais recente">
        <div className="today-study"><BookOpen size={22}/><div><b>{study?.subject || 'Nenhum estudo registrado hoje'}</b><span>{study ? `${study.track} · ${study.minutes} min` : 'Escolha um módulo e registre sua sessão.'}</span></div><button className="text-btn" onClick={() => onNavigate('estudos')}>Abrir</button></div>
      </Panel>
      <FocusNow session={state.data.focus ?? null} onNavigate={() => onNavigate('foco')} />
      <Panel title="Hidratação" subtitle="Cuidado que acompanha seu ritmo"><div className="hydration-card"><Droplets size={25}/><div><b>250 ml após 60 minutos</b><span>O lembrete é criado automaticamente em estudos longos.</span></div></div></Panel>
      <Panel className="span-2" title="Ritmo da semana" subtitle="Minutos de estudo por dia" action={<button className="text-btn" onClick={() => onNavigate('relatorios')}>Relatórios <ChevronRight size={14}/></button>}>
        <div className="chart-box"><ResponsiveContainer width="100%" height="100%"><AreaChart data={weekly} margin={{top:16,right:8,left:-22,bottom:0}}><defs><linearGradient id="studyFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7c5cff" stopOpacity={.45}/><stop offset="100%" stopColor="#7c5cff" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="rgba(255,255,255,.055)" vertical={false}/><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fill:'#77809a',fontSize:11}}/><YAxis axisLine={false} tickLine={false} tick={{fill:'#77809a',fontSize:11}}/><Tooltip contentStyle={tooltipStyle} formatter={(v)=>[`${v} min`,'Estudo']}/><Area type="monotone" dataKey="minutes" stroke="#8b71ff" strokeWidth={2.3} fill="url(#studyFill)"/></AreaChart></ResponsiveContainer></div>
      </Panel>
    </div>
  </>;
}

function AgendaPage({ onToast }: { onToast: (s: string) => void }) {
  const loader = useCallback(() => api.reminders(), []);
  const state = useApiData<Reminder[]>(loader, []);
  const [filter, setFilter] = useState<'todos' | 'hoje' | 'semana'>('todos');
  const [title, setTitle] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [saving, setSaving] = useState(false);
  const filtered = state.data.filter((r) => {
    if (filter === 'todos') return true;
    const d = new Date(r.dueAt);
    const now = new Date();
    if (filter === 'hoje') return dateKey(d) === dateKey(now);
    const week = new Date(now); week.setDate(now.getDate() + 7);
    return d >= now && d <= week;
  });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !dueAt) return;
    setSaving(true);
    try { await api.createReminder({ title: title.trim(), dueAt: fromZonedTime(dueAt, 'America/Sao_Paulo').toISOString() }); setTitle(''); setDueAt(''); state.reload(); onToast('Lembrete criado.'); }
    catch (err) { onToast(err instanceof ApiError ? err.message : 'Erro ao criar lembrete.'); }
    finally { setSaving(false); }
  };
  const act = async (id: string, action: string) => {
    try { await api.updateReminder(id, { action }); state.reload(); onToast(action === 'complete' ? 'Lembrete concluído.' : 'Lembrete atualizado.'); }
    catch (err) { onToast(err instanceof ApiError ? err.message : 'Erro ao atualizar.'); }
  };
  return <div className="content-grid agenda-layout">
    <Panel className="span-2" title="Sua agenda" subtitle={`${filtered.length} compromissos encontrados`} action={<Segmented value={filter} onChange={(v) => setFilter(v as typeof filter)} items={[['todos','Todos'],['hoje','Hoje'],['semana','7 dias']]} />}>
      {state.status === 'loading' ? <ListSkeleton /> : state.status === 'error' ? <ErrorState compact message={state.error!} onRetry={state.reload} /> : <ReminderList reminders={filtered} emptyText="Nenhum compromisso neste período." onAction={act} />}
    </Panel>
    <Panel title="Novo compromisso" subtitle="Salvo diretamente no SQLite">
      <form className="stack-form" onSubmit={submit}>
        <label>Título<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Aula de Power BI" /></label>
        <label>Data e horário<input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} /></label>
        <button className="primary-btn full" disabled={saving || !title || !dueAt}>{saving ? <LoaderCircle className="spin" size={17} /> : <CalendarDays size={17} />} Salvar compromisso</button>
      </form>
      <div className="tip-card"><Sparkles size={17} /><div><b>Mais natural pelo chat</b><p>“Me lembre da aula de Power BI sábado às 9h.”</p></div></div>
    </Panel>
  </div>;
}

function StudiesPage({ onToast }: { onToast: (s: string) => void }) {
  const state = useApiData<Study[]>(useCallback(() => api.studies(), []), []);
  const modules = useApiData<StudyModule[]>(useCallback(() => api.studyModules(true), []), []);
  const reviews = useApiData<Review[]>(useCallback(() => api.reviews(), []), []);
  const report = useApiData<ReportData>(useCallback(() => api.reports('weekly'), []), {});
  const [selected, setSelected] = useState<string>('');
  const [creating, setCreating] = useState(false);
  const [newModule, setNewModule] = useState({ name: '', description: '' });
  const [newTopic, setNewTopic] = useState('');
  const [goal, setGoal] = useState('300');
  const [showArchived, setShowArchived] = useState(false);
  const [moduleEdit, setModuleEdit] = useState({ name: '', description: '', color: '#7c5cff' });
  const [form, setForm] = useState({ subject: '', track: 'ENEM', objective: '', activityType: 'STUDY', notes: '', difficulty: '3', minutes: '60', questions: '', correctAnswers: '' });
  const [saving, setSaving] = useState(false);
  const visibleModules = modules.data.filter((module) => showArchived || !module.isArchived);
  useEffect(() => { if ((!selected || !modules.data.some((module) => module.id === selected)) && visibleModules[0]) setSelected(visibleModules[0].id); }, [modules.data, selected, showArchived]);
  const activeModule = modules.data.find((module) => module.id === selected);
  useEffect(() => { if (activeModule) { setGoal(String(activeModule.goalMinutes || 300)); setModuleEdit({ name: activeModule.name, description: activeModule.description || '', color: activeModule.color }); } }, [activeModule?.id, activeModule?.goalMinutes]);
  const total = state.data.reduce((n, s) => n + Number(s.minutes || 0), 0);
  const questions = state.data.reduce((n, s) => n + Number(s.questions || 0), 0);
  const correct = state.data.reduce((n, s) => n + Number(s.correctAnswers || 0), 0);
  const overdue = reviews.data.filter((item) => item.status === 'PENDING' && new Date(item.dueAt) < new Date());
  const difficult = state.data.filter((item) => (item.questions || 0) >= 5 && ((item.correctAnswers || 0) / (item.questions || 1)) < .7).slice(0, 3);
  const weeklyGoal = activeModule?.goalMinutes || 300;
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true);
    try { await api.createStudy({ ...form, difficulty: Number(form.difficulty), durationMinutes: Number(form.minutes), questions: Number(form.questions || 0), correctAnswers: Number(form.correctAnswers || 0), minutes: undefined }); setForm({ subject: '', track: activeModule?.name || 'ENEM', objective: '', activityType: 'STUDY', notes: '', difficulty: '3', minutes: '60', questions: '', correctAnswers: '' }); state.reload(); reviews.reload(); report.reload(); onToast('Estudo registrado e revisões programadas.'); }
    catch (err) { onToast(err instanceof ApiError ? err.message : 'Erro ao registrar estudo.'); }
    finally { setSaving(false); }
  };
  const createModule = async (e: FormEvent) => { e.preventDefault(); if (!newModule.name.trim()) return; setSaving(true); try { const created = await api.createStudyModule({ ...newModule, color: '#7c5cff', topics: [] }); setSelected(created.id); setNewModule({ name: '', description: '' }); setCreating(false); modules.reload(); onToast('Módulo criado.'); } catch (error) { onToast(error instanceof ApiError ? error.message : 'Não foi possível criar o módulo.'); } finally { setSaving(false); } };
  const addTopic = async (e: FormEvent) => { e.preventDefault(); if (!activeModule || !newTopic.trim()) return; try { await api.updateStudyModule(activeModule.id, { topics: [...activeModule.topics, newTopic.trim()] }); setNewTopic(''); modules.reload(); onToast('Tópico adicionado ao módulo.'); } catch (error) { onToast(error instanceof ApiError ? error.message : 'Não foi possível adicionar o tópico.'); } };
  const saveGoal = async () => { if (!activeModule) return; try { await api.updateStudyModule(activeModule.id, { goalMinutes: Number(goal) }); modules.reload(); onToast('Meta semanal atualizada.'); } catch (error) { onToast(error instanceof ApiError ? error.message : 'Não foi possível atualizar a meta.'); } };
  const saveModule = async () => { if (!activeModule || !moduleEdit.name.trim()) return; try { await api.updateStudyModule(activeModule.id, { name: moduleEdit.name.trim(), description: moduleEdit.description.trim(), color: moduleEdit.color }); modules.reload(); onToast('Módulo atualizado.'); } catch (error) { onToast(error instanceof ApiError ? error.message : 'Não foi possível editar o módulo.'); } };
  const toggleArchive = async () => { if (!activeModule) return; const archive = !activeModule.isArchived; if (archive && !window.confirm(`Arquivar o módulo “${activeModule.name}”? Os estudos existentes serão preservados.`)) return; try { await api.updateStudyModule(activeModule.id, { isArchived: archive }); modules.reload(); if (archive) setSelected(''); onToast(archive ? 'Módulo arquivado sem apagar os estudos.' : 'Módulo restaurado.'); } catch (error) { onToast(error instanceof ApiError ? error.message : 'Não foi possível alterar o módulo.'); } };
  const completeReview = async (id: string) => { try { await api.completeReview(id); reviews.reload(); onToast('Revisão concluída.'); } catch (error) { onToast(error instanceof ApiError ? error.message : 'Não foi possível concluir a revisão.'); } };
  return <>
    <section className="metric-grid"><MetricCard icon={Clock3} label="Tempo total" value={formatHours(total)} unit="horas" color="violet"/><MetricCard icon={Target} label="Questões" value={questions} unit="resolvidas" color="cyan"/><MetricCard icon={Trophy} label="Aproveitamento" value={`${questions ? Math.round(correct/questions*100) : 0}%`} unit="média" color="green"/><MetricCard icon={RotateCcw} label="Revisões atrasadas" value={overdue.length} unit="pendentes" color="amber"/></section>
    <Panel title="Módulos de estudo" subtitle="Trilhas iniciais editáveis e módulos personalizados" action={<div className="module-toolbar"><button className="text-btn" onClick={() => setShowArchived(!showArchived)}>{showArchived ? 'Ocultar arquivados' : 'Ver arquivados'}</button><button className="secondary-btn" onClick={() => setCreating(!creating)}><Plus size={16}/> Novo módulo</button></div>}>
      {creating && <form className="module-create" onSubmit={createModule}><input required value={newModule.name} onChange={(e)=>setNewModule({...newModule,name:e.target.value})} placeholder="Nome do módulo"/><input value={newModule.description} onChange={(e)=>setNewModule({...newModule,description:e.target.value})} placeholder="Descrição opcional"/><button className="primary-btn" disabled={saving}>Criar</button></form>}
      {modules.status === 'loading' ? <ListSkeleton/> : modules.status === 'error' ? <ErrorState compact message={modules.error!} onRetry={modules.reload}/> : visibleModules.length ? <div className="module-grid">{visibleModules.map((module) => { const minutes = state.data.filter((item)=>item.track.toLowerCase()===module.name.toLowerCase()).reduce((sum,item)=>sum+item.minutes,0); return <button key={module.id} className={`module-card ${selected===module.id?'active':''} ${module.isArchived?'archived':''}`} onClick={()=>{setSelected(module.id);if(!module.isArchived)setForm((value)=>({...value,track:module.name}));}} style={{'--module':module.color} as React.CSSProperties}><i/><span><b>{module.name}</b><small>{module.isArchived ? 'Arquivado · estudos preservados' : `${module.topics.length} tópicos · ${minutes} min`}</small></span></button>; })}</div> : <EmptyState icon={Archive} title="Nenhum módulo ativo" text="Restaure um módulo arquivado ou crie uma nova trilha."/>}
    </Panel>
    {activeModule && <Panel title={activeModule.name} subtitle={activeModule.description || 'Organize os tópicos que deseja dominar'}><div className="module-editor"><label>Nome<input value={moduleEdit.name} onChange={(e)=>setModuleEdit({...moduleEdit,name:e.target.value})}/></label><label>Descrição<input value={moduleEdit.description} onChange={(e)=>setModuleEdit({...moduleEdit,description:e.target.value})}/></label><label>Cor<input type="color" value={moduleEdit.color} onChange={(e)=>setModuleEdit({...moduleEdit,color:e.target.value})}/></label><button className="secondary-btn" onClick={saveModule}>Salvar módulo</button><button className="secondary-btn danger" onClick={toggleArchive}>{activeModule.isArchived?<ArchiveRestore size={16}/>:<Archive size={16}/>} {activeModule.isArchived?'Restaurar':'Arquivar'}</button></div>{!activeModule.isArchived && <><div className="module-meta-form"><label>Meta semanal (min)<input type="number" min="30" max="10080" value={goal} onChange={(e)=>setGoal(e.target.value)}/></label><button className="secondary-btn" onClick={saveGoal}><Target size={16}/> Salvar meta</button></div><div className="topic-cloud">{activeModule.topics.map((topic)=><span key={topic}>{topic}</span>)}</div><form className="topic-add" onSubmit={addTopic}><input value={newTopic} onChange={(e)=>setNewTopic(e.target.value)} placeholder="Adicionar matéria, assunto ou aula"/><button className="secondary-btn"><Plus size={16}/> Adicionar</button></form></>}</Panel>}
    <div className="content-grid studies-layout">
      <Panel className="span-2" title="Sessões recentes" subtitle="Histórico real armazenado no SQLite">{state.status==='loading'?<ListSkeleton/>:state.status==='error'?<ErrorState compact message={state.error!} onRetry={state.reload}/>:state.data.length?<div className="study-list">{state.data.map((s)=><div className="study-row" key={s.id}><div className="subject-icon"><BookOpen size={18}/></div><div><b>{s.subject}</b><span>{s.track} · {s.activityType==='CLASS'?'Aula':s.activityType==='REVIEW'?'Revisão':s.objective||'Estudo livre'}{s.notes?` · ${s.notes}`:''}</span></div><div className="study-stats"><b>{s.minutes} min</b><span>{s.questions||0} questões · {s.correctAnswers||0} acertos · {(s.questions||0)-(s.correctAnswers||0)} erros{s.difficulty?` · dificuldade ${s.difficulty}/5`:''}</span></div></div>)}</div>:<EmptyState icon={BookOpen} title="Comece seu registro" text="Nenhuma sessão foi marcada como concluída automaticamente."/>}</Panel>
      <Panel title="Registrar estudo" subtitle="Gera revisões em 1, 3, 7, 15 e 30 dias"><form className="stack-form" onSubmit={submit}><label>Matéria ou assunto<input required value={form.subject} onChange={(e)=>setForm({...form,subject:e.target.value})} placeholder="Ex.: Subnetting"/></label><label>Módulo<select value={form.track} onChange={(e)=>setForm({...form,track:e.target.value})}>{modules.data.map((module)=><option key={module.id}>{module.name}</option>)}</select></label><div className="form-pair"><label>Tipo<select value={form.activityType} onChange={(e)=>setForm({...form,activityType:e.target.value})}><option value="STUDY">Sessão de estudo</option><option value="CLASS">Aula</option><option value="REVIEW">Revisão</option></select></label><label>Dificuldade<select value={form.difficulty} onChange={(e)=>setForm({...form,difficulty:e.target.value})}>{[1,2,3,4,5].map((value)=><option key={value} value={value}>{value}/5</option>)}</select></label></div><label>Meta da sessão<input value={form.objective} onChange={(e)=>setForm({...form,objective:e.target.value})} placeholder="O que deseja alcançar?"/></label><label>Anotações<textarea rows={3} value={form.notes} onChange={(e)=>setForm({...form,notes:e.target.value})} placeholder="Pontos importantes, dúvidas e próximos passos"/></label><div className="form-pair"><label>Minutos<input required type="number" min="1" value={form.minutes} onChange={(e)=>setForm({...form,minutes:e.target.value})}/></label><label>Questões<input type="number" min="0" value={form.questions} onChange={(e)=>setForm({...form,questions:e.target.value})}/></label></div><label>Acertos<input type="number" min="0" max={form.questions||undefined} value={form.correctAnswers} onChange={(e)=>setForm({...form,correctAnswers:e.target.value})}/></label><button className="primary-btn full" disabled={saving}>{saving?<LoaderCircle className="spin" size={17}/>:<Check size={17}/>} Registrar sessão</button></form></Panel>
    </div>
    <div className="content-grid study-insights"><Panel title="Meta semanal" subtitle={`${Math.min(report.data.totalMinutes||0,weeklyGoal)} de ${weeklyGoal} minutos`}><div className="goal-ring"><div style={{'--goal':`${Math.min(100,((report.data.totalMinutes||0)/weeklyGoal)*100)}%`} as React.CSSProperties}><b>{Math.round(Math.min(100,((report.data.totalMinutes||0)/weeklyGoal)*100))}%</b></div><span>Continue avançando em blocos sustentáveis.</span></div></Panel><Panel title="Assuntos difíceis" subtitle="Sugestões baseadas em aproveitamento abaixo de 70%">{difficult.length?<div className="review-list">{difficult.map((item)=><div key={item.id}><span><b>{item.subject}</b><small>{Math.round((item.correctAnswers||0)/(item.questions||1)*100)}% de acertos</small></span><em>Sugestão do EDY Assist</em></div>)}</div>:<EmptyState icon={Target} title="Sem alerta de desempenho" text="Registre questões para receber sugestões."/>}</Panel><Panel title="Revisões programadas" subtitle="Ciclo espaçado preservado">{reviews.status==='loading'?<ListSkeleton/>:reviews.data.length?<div className="review-list">{reviews.data.slice(0,6).map((item)=><div key={item.id}><span><b>{item.subject}</b><small>{formatDateTime(item.dueAt)} · {item.intervalDays} dias</small></span><button onClick={()=>completeReview(item.id)} aria-label={`Concluir revisão de ${item.subject}`}><Check size={15}/></button></div>)}</div>:<EmptyState icon={RotateCcw} title="Nenhuma revisão pendente" text="Elas aparecem após um registro de estudo."/>}</Panel></div>
  </>;
}

function FocusPage({ onToast }: { onToast: (s: string) => void }) {
  const loader = useCallback(() => api.currentFocus(), []);
  const state = useApiData<FocusSession | null>(loader, null);
  const [duration, setDuration] = useState(25);
  const [customDuration, setCustomDuration] = useState(false);
  const [subject, setSubject] = useState('');
  const [track, setTrack] = useState('ENEM');
  const [starting, setStarting] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const start = async () => { setStarting(true); try { await api.startFocus({ durationMinutes: duration, subject: subject || undefined, track }); state.reload(); onToast('Sessão de foco iniciada.'); } catch(e) { onToast(e instanceof ApiError ? e.message : 'Erro ao iniciar foco.'); } finally { setStarting(false); } };
  const finish = async () => { if (!state.data) return; try { await api.finishFocus(state.data.id); state.reload(); onToast('Sessão finalizada e registrada.'); } catch(e) { onToast(e instanceof ApiError ? e.message : 'Erro ao finalizar.'); } };
  const remaining = state.data ? Math.max(0, Math.round(((state.data.endsAt ? new Date(state.data.endsAt).getTime() : new Date(state.data.startedAt).getTime() + state.data.durationMinutes*60000) - now)/1000)) : duration*60;
  const progress = state.data ? 100 - Math.min(100, remaining/(state.data.durationMinutes*60)*100) : 0;
  return <div className="focus-layout">
    <section className="focus-stage">
      <div className="focus-glow" />
      <span className={`status-badge ${state.data ? 'active' : ''}`}><i /> {state.data ? 'SESSÃO EM ANDAMENTO' : 'PRONTO PARA COMEÇAR'}</span>
      <div className="timer-ring" style={{'--progress': `${progress * 3.6}deg`} as React.CSSProperties}><div><strong>{formatTimer(remaining)}</strong><span>{state.data?.subject || 'Tempo de foco'}</span></div></div>
      {state.data ? <div className="focus-actions"><button className="secondary-btn" disabled><Pause size={18}/> Pausar</button><button className="primary-btn" onClick={finish}><Check size={18}/> Concluir</button></div> : <button className="primary-btn focus-start" onClick={start} disabled={starting}>{starting ? <LoaderCircle className="spin" size={19}/> : <Play size={19} fill="currentColor"/>} Iniciar foco</button>}
      <div className="hydration-note"><Droplets size={17}/><span>Após 60 min de estudo, lembraremos você de beber <b>250 ml de água</b>.</span></div>
    </section>
    <aside className="focus-config">
      <div><span className="eyebrow">CONFIGURE A SESSÃO</span><h2>Prepare seu espaço</h2><p>Defina uma intenção clara antes de começar.</p></div>
      <fieldset className="duration-field"><legend>Duração</legend><div className="duration-grid">{[25,50,60].map(n=><button key={n} type="button" className={!customDuration&&duration===n?'active':''} onClick={()=>{setDuration(n);setCustomDuration(false)}}>{n}<small>min</small></button>)}<button type="button" className={customDuration?'active':''} onClick={()=>setCustomDuration(true)}>Outro<small>1–720</small></button></div></fieldset>
      {customDuration&&<label>Duração personalizada (minutos)<input type="number" min="1" max="720" value={duration} onChange={(e)=>setDuration(Math.min(720,Math.max(1,Number(e.target.value)||1)))}/></label>}
      <label>Matéria<input value={subject} onChange={(e)=>setSubject(e.target.value)} placeholder="O que você vai estudar?"/></label>
      <label>Trilha<select value={track} onChange={(e)=>setTrack(e.target.value)}>{tracks.map(t=><option key={t}>{t}</option>)}</select></label>
      <div className="quiet-indicator"><MoonStar size={18}/><div><b>Silêncio inteligente</b><span>Notificações não essenciais serão adiadas.</span></div></div>
    </aside>
  </div>;
}

function ReportsPage() {
  const [period, setPeriod] = useState<'daily'|'weekly'>('weekly');
  const loader = useCallback(() => api.reports(period), [period]);
  const state = useApiData<ReportData>(loader, {});
  const data = state.data.byDay?.length ? state.data.byDay : fallbackWeekly;
  const pie = state.data.byTrack?.length ? state.data.byTrack : [{name:'Sem dados',value:1}];
  if (state.status === 'loading') return <PageLoading/>;
  if (state.status === 'error') return <ErrorState message={state.error!} onRetry={state.reload}/>;
  return <>
    <div className="report-toolbar"><Segmented value={period} onChange={(v)=>setPeriod(v as typeof period)} items={[["daily","Hoje"],["weekly","Esta semana"]]}/><span>Atualizado agora · America/Sao_Paulo</span></div>
    <section className="metric-grid"><MetricCard icon={Clock3} label="Tempo total" value={formatHours(state.data.totalMinutes??0)} unit="horas" color="violet"/><MetricCard icon={Focus} label="Sessões" value={state.data.sessions??0} unit="blocos" color="cyan"/><MetricCard icon={Target} label="Questões" value={state.data.questions??0} unit="resolvidas" color="green"/><MetricCard icon={TrendingUp} label="Sequência" value={state.data.streak??0} unit="dias" color="amber"/></section>
    <div className="content-grid report-grid">
      <Panel className="span-2" title="Tempo de estudo" subtitle="Distribuição ao longo do período"><div className="chart-box tall"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{top:18,right:8,left:-22,bottom:0}}><CartesianGrid stroke="rgba(255,255,255,.055)" vertical={false}/><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fill:'#77809a',fontSize:11}}/><YAxis axisLine={false} tickLine={false} tick={{fill:'#77809a',fontSize:11}}/><Tooltip contentStyle={tooltipStyle} formatter={(v)=>[`${v} min`,'Estudo']}/><Bar dataKey="minutes" radius={[6,6,0,0]} fill="#7c5cff"/></BarChart></ResponsiveContainer></div></Panel>
      <Panel title="Por trilha" subtitle="Onde você investiu energia"><div className="pie-wrap"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={pie} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="87%" paddingAngle={4}>{pie.map((_,i)=><Cell key={i} fill={chartColors[i%chartColors.length]}/>)}</Pie><Tooltip contentStyle={tooltipStyle}/></PieChart></ResponsiveContainer><div className="pie-center"><b>{formatHours(state.data.totalMinutes??0)}</b><span>total</span></div></div><div className="chart-legend">{pie.slice(0,4).map((p,i)=><span key={p.name}><i style={{background:chartColors[i]}}/>{p.name}<b>{p.value}</b></span>)}</div></Panel>
    </div>
  </>;
}

function WhatsAppPage({ onToast }: { onToast: (s:string)=>void }) {
  const loader = useCallback(()=>api.messages(),[]);
  const state = useApiData<ChatMessage[]>(loader,[]);
  const [text,setText]=useState(''); const [sending,setSending]=useState(false); const [listening,setListening]=useState(false);
  const chatRef=useRef<HTMLDivElement>(null); const recognitionRef=useRef<SpeechRecognitionLike|null>(null);
  useEffect(()=>()=>recognitionRef.current?.abort(),[]);
  useEffect(()=>{const area=chatRef.current;if(area)area.scrollTo({top:area.scrollHeight,behavior:'smooth'});},[state.data.length]);
  const send = async(e:FormEvent)=>{e.preventDefault();if(!text.trim())return;setSending(true);try{await api.chat(text.trim());setText('');state.reload();}catch(err){onToast(err instanceof ApiError?err.message:'Não foi possível enviar.');}finally{setSending(false)}};
  const examples=['O que tenho hoje?','Tenho algo a mais hoje além do que já estava marcado?','O que tenho amanhã?','Qual matéria devo estudar agora?','Quais revisões estão atrasadas?','Iniciar foco de 50 minutos.'];
  const startVoice=()=>{ if(listening&&recognitionRef.current){recognitionRef.current.abort();return;} const browser=window as unknown as {SpeechRecognition?:new()=>SpeechRecognitionLike;webkitSpeechRecognition?:new()=>SpeechRecognitionLike}; const Recognition=browser.SpeechRecognition||browser.webkitSpeechRecognition; if(!Recognition){onToast('Ditado por voz não é compatível com este navegador.');return;} const recognition=new Recognition(); recognitionRef.current=recognition; recognition.lang='pt-BR'; recognition.interimResults=false; recognition.continuous=false; recognition.onresult=(event)=>{const transcript=event.results[0]?.[0]?.transcript?.trim();if(transcript)setText(transcript);else onToast('Nenhuma fala foi reconhecida. Tente novamente.');}; recognition.onerror=(event)=>{const messages:Record<string,string>={"not-allowed":'Permissão do microfone recusada. Libere-a nas configurações do navegador.',"service-not-allowed":'O reconhecimento de voz foi bloqueado pelo navegador.',"audio-capture":'Nenhum microfone disponível.',"no-speech":'Nenhuma fala foi detectada.',aborted:'Gravação interrompida.'};onToast(messages[event.error]||'Não foi possível reconhecer a fala.');}; recognition.onend=()=>{setListening(false);recognitionRef.current=null;}; setListening(true); try{recognition.start();}catch{setListening(false);recognitionRef.current=null;onToast('Não foi possível iniciar o microfone.');} };
  return <div className="assistant-layout">
    <section className="assistant-shell"><header className="chat-header"><div className="bot-avatar"><Sparkles size={18}/></div><div><b>EDY Assist</b><span><i/> disponível no modo local</span></div><span className="secure-label">SQLite</span></header><div className="assistant-prompts" aria-label="Sugestões rápidas">{examples.map((example)=><button key={example} onClick={()=>setText(example)}>{example}</button>)}</div><div className="chat-bg" ref={chatRef}>{state.status==='loading'?<div className="chat-loading"><LoaderCircle className="spin"/> Carregando conversa...</div>:state.status==='error'?<ErrorState compact message={state.error!} onRetry={state.reload}/>:state.data.length?<div className="messages">{state.data.map((m)=><ChatBubble key={m.id} message={m}/>)}</div>:<div className="chat-welcome"><div><Sparkles/></div><h3>Olá, eu sou o EDY Assist</h3><p>Posso organizar agenda, tarefas, estudos, foco e hidratação. Se uma data estiver ambígua, confirmo antes de salvar.</p></div>}</div><form className="chat-compose" onSubmit={send}><button type="button" className={`voice-btn ${listening?'listening':''}`} onClick={startVoice} aria-label="Ditar mensagem"><Mic size={18}/></button><input aria-label="Mensagem" value={text} onChange={(e)=>setText(e.target.value)} placeholder={listening?'Ouvindo...':'Escreva ou dite uma mensagem...'}/><button disabled={sending||!text.trim()} aria-label="Enviar mensagem">{sending?<LoaderCircle className="spin" size={19}/>:<Send size={19}/>}</button></form></section>
    <aside className="assistant-side"><Panel title="O que posso fazer" subtitle="Ações reais, no mesmo motor do WhatsApp"><div className="capability-list"><span><CalendarDays/> Agenda e lembretes</span><span><BookOpen/> Estudos e revisões</span><span><Focus/> Sessões de foco</span><span><Droplets/> Hidratação</span></div></Panel><div className="meta-ready"><Cloud size={20}/><div><b>WhatsApp complementar</b><span>Mock, Meta e Twilio usam este mesmo motor.</span></div><span className="status-chip">PRONTO</span></div></aside>
  </div>;
}

type SpeechRecognitionLike = { lang:string; interimResults:boolean; continuous:boolean; start:()=>void; abort:()=>void; onresult:(event:{results:ArrayLike<ArrayLike<{transcript:string}>>})=>void; onerror:(event:{error:string})=>void; onend:()=>void };

function HistoryPage() {
  const loader=useCallback(()=>api.messages(),[]); const state=useApiData<ChatMessage[]>(loader,[]); const [query,setQuery]=useState('');
  const filtered=state.data.filter(m=>messageText(m).toLowerCase().includes(query.toLowerCase()));
  return <Panel title="Todas as mensagens" subtitle="Comandos recebidos e respostas do assistente" action={<div className="inline-search"><Search size={15}/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Buscar no histórico"/></div>}>
    {state.status==='loading'?<ListSkeleton/>:state.status==='error'?<ErrorState compact message={state.error!} onRetry={state.reload}/>:filtered.length?<div className="history-list">{filtered.map(m=>{const user=isUserMessage(m);return <div className="history-row" key={m.id}><div className={`history-icon ${user?'user':'bot'}`}>{user?<MessageCircle size={17}/>:<Sparkles size={17}/>}</div><div><b>{user?'Você':'EDY Assist'}</b><p>{messageText(m)}</p></div><time>{formatDateTime(m.createdAt)}</time></div>})}</div>:<EmptyState icon={History} title="Nenhuma mensagem encontrada" text={query?'Tente buscar por outros termos.':'Use o Assistente para iniciar uma conversa.'}/>} </Panel>;
}

function SettingsPage({onToast,theme,onTheme}:{onToast:(s:string)=>void;theme:Theme;onTheme:(theme:Theme)=>void}) {
  const loader=useCallback(()=>api.settings(),[]); const state=useApiData<Settings>(loader,{timezone:'America/Sao_Paulo'}); const [saving,setSaving]=useState(false);
  const notificationSupported = 'Notification' in window;
  const [notificationPermission,setNotificationPermission]=useState<NotificationPermission| 'unsupported'>(notificationSupported?Notification.permission:'unsupported');
  const update=(patch:Partial<Settings>)=>state.setState(s=>({...s,data:{...s.data,...patch}}));
  const save=async()=>{setSaving(true);try{const data=await api.saveSettings(state.data);state.setState({status:'success',data});onToast('Configurações salvas.');}catch(e){onToast(e instanceof ApiError?e.message:'Erro ao salvar configurações.');}finally{setSaving(false)}};
  const requestNotifications=async()=>{if(!notificationSupported){onToast('Este navegador não oferece notificações web.');return;}const permission=await Notification.requestPermission();setNotificationPermission(permission);onToast(permission==='granted'?'Notificações ativas enquanto a PWA estiver aberta.':permission==='denied'?'Permissão de notificações recusada.':'Permissão não concedida.');};
  if(state.status==='loading')return <PageLoading/>; if(state.status==='error')return <ErrorState message={state.error!} onRetry={state.reload}/>;
  return <div className="settings-grid">
    <Panel title="Rotina e notificações" subtitle="Defina quando o EDY Assist pode interromper você"><SettingRow icon={MoonStar} title="Horário silencioso" text="Adia notificações não essenciais no período definido"><AccessibleSwitch checked={!!state.data.quietHoursEnabled} onChange={(v)=>update({quietHoursEnabled:v})}/></SettingRow><div className="setting-times"><label>Início<input type="time" value={state.data.quietHoursStart||'22:00'} onChange={(e)=>update({quietHoursStart:e.target.value})}/></label><span>até</span><label>Fim<input type="time" value={state.data.quietHoursEnd||'07:00'} onChange={(e)=>update({quietHoursEnd:e.target.value})}/></label></div><SettingRow icon={Droplets} title="Lembrete de hidratação" text="Lembra de beber 250 ml após 60 minutos de estudo"><AccessibleSwitch checked={state.data.waterReminderEnabled!==false} onChange={(v)=>update({waterReminderEnabled:v})}/></SettingRow></Panel>
    <Panel title="Notificações da PWA" subtitle="Somente enquanto o aplicativo estiver aberto"><div className="notification-permission"><Bell size={22}/><div><b>{notificationPermission==='granted'?'Permitidas':notificationPermission==='denied'?'Bloqueadas pelo navegador':notificationPermission==='unsupported'?'Sem suporte neste navegador':'Ainda não solicitadas'}</b><p>O EDY Assist verifica lembretes com a PWA ativa. Com o aplicativo fechado, Web Push ainda exige servidor público estável e VAPID.</p></div><button className="secondary-btn" onClick={requestNotifications} disabled={notificationPermission==='granted'||notificationPermission==='unsupported'}>{notificationPermission==='granted'?'Ativas':'Permitir'}</button></div></Panel>
    <Panel title="Aparência" subtitle="Tema escuro persistente neste dispositivo"><div className="theme-grid">{([['obsidian','Obsidian'],['midnight','Midnight Blue'],['graphite','Graphite'],['oled','OLED Black']] as Array<[Theme,string]>).map(([id,label])=><button key={id} className={theme===id?'active':''} onClick={()=>onTheme(id)}><i className={`theme-preview ${id}`}/><span><b>{label}</b><small>{id==='obsidian'?'Padrão equilibrado':id==='oled'?'Preto absoluto':'Contraste confortável'}</small></span>{theme===id&&<Check size={16}/>}</button>)}</div></Panel>
    <Panel title="Localização" subtitle="Datas e horários do assistente"><label className="wide-label">Fuso horário<select value={state.data.timezone||'America/Sao_Paulo'} onChange={(e)=>update({timezone:e.target.value})}><option>America/Sao_Paulo</option></select></label><div className="info-line"><Clock3 size={17}/><span>Todos os lembretes e resumos usam o horário de Brasília.</span></div></Panel>
    <Panel className="span-2" title="Integração WhatsApp" subtitle="Provedores oficial, Twilio e simulador preservados"><div className="integration-card"><div className="integration-logo"><MessageCircle size={25}/></div><div><b>WhatsApp complementar</b><p>Os modos mock, Meta e Twilio continuam usando o mesmo motor do EDY Assist e o SQLite local.</p><span className="status-chip muted"><i/> CONFIGURAÇÃO NO SERVIDOR</span></div></div></Panel>
    <div className="settings-actions"><button className="primary-btn" onClick={save} disabled={saving}>{saving?<LoaderCircle className="spin" size={17}/>:<Check size={17}/>} Salvar alterações</button></div>
  </div>;
}

function QuickCapture({open,onOpenChange,onSaved}:{open:boolean;onOpenChange:(o:boolean)=>void;onSaved:()=>void}) {
  const [text,setText]=useState(''); const [sending,setSending]=useState(false); const [result,setResult]=useState<string|null>(null);
  const submit=async(e:FormEvent)=>{e.preventDefault();if(!text.trim())return;setSending(true);setResult(null);try{const data=await api.chat(text.trim());setResult(data.reply||data.outbound?.text||data.message?.text||data.message?.content||'Comando processado.');onSaved();}catch(err){setResult(err instanceof ApiError?err.message:'Não foi possível processar o comando.');}finally{setSending(false)}};
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Backdrop className="dialog-backdrop"/><Dialog.Viewport className="dialog-viewport"><Dialog.Popup className="dialog-popup"><div className="dialog-head"><div><Dialog.Title>Captura rápida</Dialog.Title><Dialog.Description>Escreva como você falaria com o EDY Assist.</Dialog.Description></div><Dialog.Close className="icon-btn" aria-label="Fechar"><X size={19}/></Dialog.Close></div><form onSubmit={submit}><textarea autoFocus value={text} onChange={(e)=>setText(e.target.value)} placeholder="Ex.: Marque o post do EDY RECON para terça às 12h."/><div className="dialog-foot"><span><Sparkles size={15}/> Linguagem natural</span><button className="primary-btn" disabled={sending||!text.trim()}>{sending?<LoaderCircle className="spin" size={17}/>:<Send size={17}/>} Processar</button></div></form>{result&&<div className="dialog-result" role="status"><Check size={17}/><span>{result}</span></div>}</Dialog.Popup></Dialog.Viewport></Dialog.Portal></Dialog.Root>;
}

function MetricCard({icon:Icon,label,value,unit,color}:{icon:typeof Bell;label:string;value:string|number;unit:string;color:string}) { return <motion.article className="metric-card" whileHover={{y:-3}}><div className={`metric-icon ${color}`}><Icon size={21}/></div><div><span>{label}</span><strong>{value}</strong><small>{unit}</small></div><i className={`metric-line ${color}`}/></motion.article>; }
function Panel({title,subtitle,action,children,className=''}:{title:string;subtitle?:string;action?:ReactNode;children:ReactNode;className?:string}) { return <section className={`panel ${className}`}><header className="panel-head"><div><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div>{action}</header>{children}</section>; }
function QuickAction({icon:Icon,label,color,onClick}:{icon:typeof Play;label:string;color:string;onClick:()=>void}) { return <button className="quick-action" onClick={onClick}><span className={color}><Icon size={19}/></span><b>{label}</b><ChevronRight size={15}/></button>; }
function FocusNow({session,onNavigate}:{session:FocusSession|null;onNavigate:()=>void}) { return <Panel title="Foco atual" subtitle={session?'Sessão em andamento':'Pronto quando você estiver'}><div className="focus-mini"><div className="focus-mini-ring"><Focus size={25}/></div><strong>{session?`${session.durationMinutes}:00`:'25:00'}</strong><span>{session?.subject||'Escolha uma tarefa importante'}</span><button className="primary-btn full" onClick={onNavigate}>{session?<Gauge size={17}/>:<Play size={17}/>} {session?'Abrir sessão':'Começar agora'}</button></div></Panel>; }
function ReminderList({reminders,emptyText,onAction,compact=false,showOrigin=false}:{reminders:Reminder[];emptyText:string;onAction?:(id:string,action:string)=>void;compact?:boolean;showOrigin?:boolean}) { if(!reminders.length)return <EmptyState icon={CalendarDays} title="Tudo em ordem" text={emptyText}/>;return <div className={`reminder-list ${compact?'compact':''}`}>{reminders.slice(0,compact?4:50).map(r=><div className={`reminder-row ${r.status==='COMPLETED'?'completed':''}`} key={r.id}><div className="date-tile"><b>{new Date(r.dueAt).toLocaleDateString('pt-BR',{day:'2-digit',timeZone:'America/Sao_Paulo'})}</b><span>{new Date(r.dueAt).toLocaleDateString('pt-BR',{month:'short',timeZone:'America/Sao_Paulo'}).replace('.','')}</span></div><div className="reminder-main"><b>{r.title}</b><span><Clock3 size={13}/>{formatDateTime(r.dueAt)} {r.recurrence&&r.recurrence!=='NONE'&&<>· <RotateCcw size={12}/> recorrente</>}</span>{showOrigin&&<em>{r.createdAt&&dateKey(r.createdAt)===dateKey(new Date())?'Adicionado hoje':'Já estava na agenda'}</em>}</div><span className="category-pill">{r.category||'Pessoal'}</span>{onAction&&<div className="row-actions"><button onClick={()=>onAction(r.id,'complete')} aria-label={`Concluir ${r.title}`}><Check size={16}/></button><button onClick={()=>onAction(r.id,'snooze')} aria-label={`Adiar ${r.title}`}><AlarmClock size={16}/></button></div>}</div>)}</div>; }
function SettingRow({icon:Icon,title,text,children}:{icon:typeof Bell;title:string;text:string;children:ReactNode}) {return <div className="setting-row"><div className="setting-icon"><Icon size={19}/></div><div><b>{title}</b><span>{text}</span></div>{children}</div>}
function AccessibleSwitch({checked,onChange}:{checked:boolean;onChange:(v:boolean)=>void}) {return <Switch.Root className="switch" checked={checked} onCheckedChange={onChange} aria-label={checked?'Desativar configuração':'Ativar configuração'}><Switch.Thumb className="switch-thumb"/></Switch.Root>}
function Segmented({value,onChange,items}:{value:string;onChange:(v:string)=>void;items:string[][]}) {return <div className="segmented">{items.map(([v,l])=><button key={v} className={value===v?'active':''} onClick={()=>onChange(v)}>{l}</button>)}</div>}
function EmptyState({icon:Icon,title,text}:{icon:typeof Bell;title:string;text:string}) {return <div className="empty-state"><div><Icon size={23}/></div><b>{title}</b><p>{text}</p></div>}
function ErrorState({message,onRetry,compact=false}:{message:string;onRetry:()=>void;compact?:boolean}) {return <div className={`error-state ${compact?'compact':''}`} role="alert"><CircleAlert size={23}/><div><b>Algo saiu do ritmo</b><p>{message}</p></div><button className="secondary-btn" onClick={onRetry}><RefreshCw size={15}/> Tentar novamente</button></div>}
function PageLoading(){return <div className="loading-grid" aria-label="Carregando"><div/><div/><div/><div className="wide"/></div>}
function ListSkeleton(){return <div className="list-skeleton" aria-label="Carregando"><i/><i/><i/></div>}
function ChatBubble({message}:{message:ChatMessage}){const user=isUserMessage(message);return <div className={`chat-bubble ${user?'user':'bot'}`}><p>{messageText(message)}</p><span>{new Date(message.createdAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'})}{!user&&<Check size={12}/>}</span></div>}

function isUserMessage(m:ChatMessage){return m.role==='user'||m.direction==='INBOUND'||m.direction==='in'}
function messageText(m:ChatMessage){return m.text||m.content||''}
function formatDateTime(input:string){return new Date(input).toLocaleString('pt-BR',{weekday:'short',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'}).replace(',',' ·')}
function formatFullDate(d:Date){const value=d.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long',timeZone:'America/Sao_Paulo'});return value.charAt(0).toUpperCase()+value.slice(1)}
function formatHours(min:number){return (min/60).toLocaleString('pt-BR',{maximumFractionDigits:1,minimumFractionDigits:min%60?1:0})}
function formatTimer(s:number){return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`}
function dateKey(input:Date|string){return new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'America/Sao_Paulo'}).format(new Date(input))}
const tooltipStyle={background:'#12182a',border:'1px solid rgba(255,255,255,.1)',borderRadius:10,color:'#fff',fontSize:12};

export default App;
