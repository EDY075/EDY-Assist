import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/errors.js';

type ModuleInput = { name: string; description?: string; color?: string; topics?: string[]; goalMinutes?: number; isArchived?: boolean };
type ModuleRecord = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  topicsJson: string;
  goalMinutes: number;
  isStarter: boolean;
  isArchived: boolean;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
export type StudyModuleView = Omit<ModuleRecord, 'topicsJson'> & { topics: string[] };

const starterModules: Array<ModuleInput> = [
  { name: 'Redes de Computadores', description: 'Infraestrutura, protocolos e diagnóstico de conectividade.', color: '#5b8cff', topics: ['Modelo OSI', 'TCP/IP', 'IPv4 e IPv6', 'Subnetting', 'DNS', 'DHCP', 'HTTP e HTTPS', 'Portas e protocolos', 'Roteamento', 'Switching', 'VLAN', 'Wi-Fi', 'Troubleshooting'] },
  { name: 'Linux', description: 'Administração, terminal e segurança do sistema.', color: '#f5b94c', topics: ['Terminal', 'Sistema de arquivos', 'Usuários e grupos', 'Permissões', 'Processos', 'Serviços', 'Gerenciamento de pacotes', 'Redes', 'Logs', 'Bash', 'SSH', 'Hardening básico'] },
  { name: 'Windows', description: 'Administração, eventos, serviços e produtividade.', color: '#22d3ee', topics: ['Sistema de arquivos', 'Usuários e grupos', 'Serviços', 'PowerShell', 'Windows Event Logs', 'Redes', 'Atualizações', 'Hardening básico'] },
  { name: 'Segurança da Informação', description: 'Fundamentos, riscos, controles e resposta.', color: '#ff6b9e', topics: ['Fundamentos', 'Confidencialidade, integridade e disponibilidade', 'Controle de acesso', 'Autenticação', 'Vulnerabilidades', 'Riscos', 'Políticas', 'Resposta a incidentes'] },
  { name: 'Blue Team e SOC', description: 'Monitoramento, detecção, triagem e investigação.', color: '#7c5cff', topics: ['Análise de logs', 'SIEM', 'Alertas', 'Triagem', 'Indicadores', 'Investigação', 'MITRE ATT&CK', 'Resposta a incidentes', 'Windows Event Logs', 'Fundamentos de detecção'] },
  { name: 'Power BI', description: 'Dados, modelagem e comunicação visual.', color: '#f2c94c', topics: ['Importação de dados', 'Power Query', 'Modelagem', 'Relacionamentos', 'DAX', 'Medidas', 'Dashboards', 'Visualização', 'Publicação'] },
  { name: 'Programação', description: 'Lógica, linguagens, projetos e boas práticas.', color: '#31e8a4', topics: ['Lógica de programação', 'Estruturas de dados', 'Git', 'APIs', 'Testes', 'Projetos práticos'] },
  { name: 'Inglês', description: 'Vocabulário, leitura, escuta e conversação.', color: '#9b7bff', topics: ['Vocabulário', 'Gramática', 'Leitura', 'Listening', 'Conversação', 'Inglês técnico'] },
  { name: 'ENEM', description: 'Planejamento e desempenho para o exame.', color: '#2dd4bf', topics: ['Matemática', 'Linguagens', 'Ciências Humanas', 'Ciências da Natureza', 'Redação'] },
  { name: 'Vestibular', description: 'Conteúdos, provas e estratégia de revisão.', color: '#fb7185', topics: ['Plano de provas', 'Conteúdos prioritários', 'Simulados', 'Redação'] },
  { name: 'Faculdade', description: 'Disciplinas, aulas, trabalhos e avaliações.', color: '#60a5fa', topics: ['Disciplinas atuais', 'Aulas', 'Trabalhos', 'Avaliações'] },
  { name: 'Certificações', description: 'Trilhas, laboratórios e preparação para exames.', color: '#a78bfa', topics: ['Plano da certificação', 'Conteúdo oficial', 'Laboratórios', 'Simulados'] },
];

function normalizeTopics(topics: string[] = []) {
  return [...new Set(topics.map((topic) => topic.trim()).filter(Boolean))].slice(0, 120);
}

function view(module: ModuleRecord): StudyModuleView {
  let topics: string[] = [];
  try { topics = normalizeTopics(JSON.parse(module.topicsJson) as string[]); } catch { topics = []; }
  const { topicsJson: _topicsJson, ...data } = module;
  return { ...data, topics };
}

export async function ensureStarterModules() {
  for (const item of starterModules) {
    await prisma.studyModule.upsert({
      where: { name: item.name },
      update: {},
      create: { name: item.name, description: item.description, color: item.color, topicsJson: JSON.stringify(item.topics), goalMinutes: item.goalMinutes, isStarter: true },
    });
  }
}

export async function listStudyModules(includeArchived = false) {
  await ensureStarterModules();
  return (await prisma.studyModule.findMany({
    where: includeArchived ? undefined : { isArchived: false },
    orderBy: [{ isArchived: 'asc' }, { isStarter: 'desc' }, { name: 'asc' }],
  })).map(view);
}

export async function createStudyModule(input: ModuleInput) {
  try {
    return view(await prisma.studyModule.create({ data: { name: input.name.trim(), description: input.description?.trim(), color: input.color, topicsJson: JSON.stringify(normalizeTopics(input.topics)), goalMinutes: input.goalMinutes } }));
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') throw new ApiError(409, 'MODULE_EXISTS', 'Já existe um módulo com esse nome.');
    throw error;
  }
}

export async function updateStudyModule(id: string, input: Partial<ModuleInput>) {
  const current = await prisma.studyModule.findUnique({ where: { id } });
  if (!current) throw new ApiError(404, 'MODULE_NOT_FOUND', 'Módulo de estudo não encontrado.');
  return view(await prisma.studyModule.update({ where: { id }, data: {
    name: input.name?.trim(), description: input.description?.trim(), color: input.color,
    topicsJson: input.topics ? JSON.stringify(normalizeTopics(input.topics)) : undefined, goalMinutes: input.goalMinutes,
    isArchived: input.isArchived,
    archivedAt: input.isArchived === true ? new Date() : input.isArchived === false ? null : undefined,
  } }));
}
