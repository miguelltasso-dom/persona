import type { KanbanCardModel, KanbanFilterOptions, KanbanFilters } from './types.ts'

const atlas = { id: 'p-atlas', name: 'Atlas', initials: 'A' } as const
const bento = { id: 'p-bento', name: 'Bento', initials: 'B' } as const
const nina = { id: 'p-nina', name: 'Nina', initials: 'N' } as const

export const MOCK_KANBAN_FILTERS: KanbanFilterOptions = {
  teams: [{ id: 't1', name: 'Equipe principal' }],
  projects: [
    { id: 'proj-site', name: 'Site da agência' },
    { id: 'proj-crm', name: 'Dendrix CRM' },
  ],
  personas: [atlas, bento, nina],
}

export const DEFAULT_KANBAN_FILTERS: KanbanFilters = {
  teamId: 'all',
  projectId: 'all',
  personaId: 'all',
  column: 'all',
}

/** Cards for project `proj-site` preview. */
export const MOCK_PROJECT_KANBAN_CARDS: readonly KanbanCardModel[] = [
  {
    id: 'k1',
    title: 'Briefing do hero da landing',
    projectId: 'proj-site',
    projectName: 'Site da agência',
    teamId: 't1',
    teamName: 'Equipe principal',
    column: 'todo',
    assignee: atlas,
    assigneeState: 'resting',
    waitingEvent: false,
    blocked: false,
    reviewApproved: false,
  },
  {
    id: 'k2',
    title: 'Implementar formulário de contato',
    projectId: 'proj-site',
    projectName: 'Site da agência',
    teamId: 't1',
    teamName: 'Equipe principal',
    column: 'in_progress',
    assignee: bento,
    assigneeState: 'working',
    dueLabel: 'Amanhã',
    waitingEvent: false,
    blocked: false,
    reviewApproved: false,
  },
  {
    id: 'k3',
    title: 'Revisar copy da página de preços',
    projectId: 'proj-site',
    projectName: 'Site da agência',
    teamId: 't1',
    teamName: 'Equipe principal',
    column: 'in_review',
    assignee: nina,
    assigneeState: 'working',
    evidence: true,
    evidenceCount: 2,
    flowFields: [{ label: 'Página', value: 'Preços' }],
    waitingEvent: false,
    blocked: false,
    reviewApproved: false,
  },
  {
    id: 'k4',
    title: 'Aprovar deploy em staging',
    projectId: 'proj-site',
    projectName: 'Site da agência',
    teamId: 't1',
    teamName: 'Equipe principal',
    column: 'blocked',
    assignee: atlas,
    assigneeState: 'stuck',
    dependency: true,
    dependencyCount: 2,
    waitingEvent: false,
    blocked: true,
    reviewApproved: false,
  },
  {
    id: 'k5',
    title: 'Configurar domínio e SSL',
    projectId: 'proj-site',
    projectName: 'Site da agência',
    teamId: 't1',
    teamName: 'Equipe principal',
    column: 'done',
    assignee: bento,
    waitingEvent: false,
    blocked: false,
    reviewApproved: true,
    outcome: 'completed',
  },
  {
    id: 'k6',
    title: 'Aguardar retorno do cliente sobre logo',
    projectId: 'proj-site',
    projectName: 'Site da agência',
    teamId: 't1',
    teamName: 'Equipe principal',
    column: 'in_progress',
    assignee: nina,
    assigneeState: 'waiting',
    dueLabel: 'Sex., 14:00',
    waitingEvent: true,
    blocked: false,
    reviewApproved: false,
  },
]

/** Global board includes another project. */
export const MOCK_GLOBAL_KANBAN_CARDS: readonly KanbanCardModel[] = [
  ...MOCK_PROJECT_KANBAN_CARDS,
  {
    id: 'k7',
    title: 'Mapear campos do processo civil',
    projectId: 'proj-crm',
    projectName: 'Dendrix CRM',
    teamId: 't1',
    teamName: 'Equipe principal',
    column: 'in_progress',
    assignee: atlas,
    assigneeState: 'working',
    flowFields: [
      { label: 'Candidato', value: 'Ana Souza' },
      { label: 'Cargo', value: 'Designer' },
    ],
    waitingEvent: false,
    blocked: false,
    reviewApproved: false,
  },
]
