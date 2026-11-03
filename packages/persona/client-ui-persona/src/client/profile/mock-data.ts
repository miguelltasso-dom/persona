/** Preview snapshots typed with Forge domain (swap source when B3 RPC exists). */
import type { Persona } from '@deepseek-ai/dsh-persona-core'

export type PersonaLiveState =
  | 'idle'
  | 'working'
  | 'reviewing'
  | 'waiting'
  | 'resting'
  | 'offline'
  | 'error'

export interface PersonaActivityItem {
  readonly id: string
  readonly at: string
  readonly summary: string
}

export type LazinessBenchGrade = 'strong' | 'fair' | 'weak'

export interface PersonaProactivityMetrics {
  readonly proposalsToday: number
  readonly proposalsAccepted7d: number
  readonly acceptanceRatePct: number
  readonly idleMinutesToday: number
  readonly lazinessBench: {
    readonly runner: string
    readonly model: string
    readonly grade: LazinessBenchGrade
    readonly lastRunAt: string
  }
}

export interface PersonaProfileSnapshot {
  readonly persona: Persona
  readonly liveState: PersonaLiveState
  readonly projectNames: readonly string[]
  readonly recentActivity: readonly PersonaActivityItem[]
  readonly proactivity?: PersonaProactivityMetrics
}

const basePersona = (overrides: Partial<Persona> & Pick<Persona, 'id' | 'name' | 'title'>): Persona => ({
  workspaceId: 'ws-demo',
  avatar: { kind: 'gallery', ref: 'atlas-default' },
  description: 'Coordena o time e destrava bloqueios.',
  personality: 'Calma, direta, protege o foco da equipe.',
  instructions: 'Priorize clareza e peça confirmação antes de gastar cota.',
  runner: { kind: 'cli', cli: 'claude', model: 'claude-sonnet' },
  tools: { files: 'read', web: 'read', shell: 'write' },
  skills: ['skill:code-review', 'skill:client-email'],
  limits: { tokensPerMonth: 500_000, concurrency: 2 },
  schedule: { timeZone: 'America/Sao_Paulo' },
  systemRoles: [],
  canRecruit: true,
  createdAt: '2026-11-01T10:00:00Z',
  updatedAt: '2026-11-03T14:00:00Z',
  createdBy: 'member-miguel',
  ...overrides,
})

export const MOCK_PERSONA_ATLAS: Persona = basePersona({
  id: 'persona-atlas',
  name: 'Atlas',
  title: 'Coordenação',
  systemRoles: ['coordination'],
})

export const MOCK_PERSONA_NINA: Persona = basePersona({
  id: 'persona-nina',
  name: 'Nina',
  title: 'Engenharia',
  avatar: { kind: 'gallery', ref: 'nina-default' },
  systemRoles: ['watchdog'],
  canRecruit: false,
  runner: { kind: 'cli', cli: 'cursor', model: 'composer' },
})

export const MOCK_PROFILE_ATLAS: PersonaProfileSnapshot = {
  persona: MOCK_PERSONA_ATLAS,
  liveState: 'working',
  projectNames: ['Site da agência', 'Dendrix CRM'],
  recentActivity: [
    { id: 'a1', at: '14:05', summary: 'Moveu tarefa para revisão no Site da agência' },
    { id: 'a2', at: '13:40', summary: 'Respondeu no #geral sobre prioridades' },
  ],
  proactivity: {
    proposalsToday: 1,
    proposalsAccepted7d: 9,
    acceptanceRatePct: 72,
    idleMinutesToday: 6,
    lazinessBench: {
      runner: 'claude',
      model: 'claude-sonnet',
      grade: 'strong',
      lastRunAt: '2026-11-02T18:00:00Z',
    },
  },
}
