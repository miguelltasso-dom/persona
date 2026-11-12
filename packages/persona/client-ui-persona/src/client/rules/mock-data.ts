export interface TriageRule {
  readonly id: string
  readonly gateText: string
  readonly assessmentText: string
  readonly logOnly: boolean
  readonly speculativeEnabled: boolean
  /** When the host says what the rule did lately ("Barrou 2 gastos esta semana"); absent = no line, never an invented one. */
  readonly lastApplied?: string | undefined
  /** P1-10: the lock kind the host obeys; a rule with one lives in the "Travas da casa" card. Absent = free text. */
  readonly kind?: 'never-spend' | 'never-send' | 'never-publish' | 'never-delete' | 'never-hire' | undefined
  /** P1-10: `false` = the host only noted it (text, no `kind`): the screen says so and promises nothing. Absent = the host did not say. */
  readonly enforced?: boolean | undefined
}

export interface TriageSimulationLog {
  readonly id: string
  readonly at: string
  readonly summary: string
  readonly mode: 'logOnly' | 'execute'
}

export interface QuietWindow {
  readonly id: string
  readonly label: string
  readonly days: readonly string[]
  readonly start: string
  readonly end: string
}

export interface ProactivityLimits {
  readonly maxProposalsPerDay: number
  readonly tokensPerPersonaMonth: number
  readonly tokensPerProjectMonth: number
}

export const MOCK_QUIET_WINDOWS: readonly QuietWindow[] = [
  { id: 'qw-1', label: 'Noites de semana', days: ['mon', 'tue', 'wed', 'thu', 'fri'], start: '22:00', end: '07:00' },
  { id: 'qw-2', label: 'Fim de semana', days: ['sat', 'sun'], start: '00:00', end: '23:59' },
]

export const MOCK_PROACTIVITY_LIMITS: ProactivityLimits = {
  maxProposalsPerDay: 5,
  tokensPerPersonaMonth: 500_000,
  tokensPerProjectMonth: 1_200_000,
}

export const MOCK_TRIAGE_RULES: readonly TriageRule[] = [
  {
    id: 'rule-1',
    gateText: 'Só @Atlas ou membros admin podem pedir deploy em produção.',
    assessmentText: 'Se for staging, preparar checklist; se for produção, pedir confirmação humana.',
    logOnly: true,
    speculativeEnabled: false,
  },
]

export const MOCK_TRIAGE_LOG: readonly TriageSimulationLog[] = [
  {
    id: 'log-1',
    at: '13:58',
    summary: 'Teria aberto ticket de revisão para copy (não executou).',
    mode: 'logOnly',
  },
  {
    id: 'log-2',
    at: '11:20',
    summary: 'Teria pausado propostas extras após atingir limite diário (Nina).',
    mode: 'logOnly',
  },
]
