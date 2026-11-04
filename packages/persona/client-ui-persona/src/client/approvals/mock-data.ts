import type { PersonaProposal } from '@deepseek-ai/dsh-persona-core'
import type { DecisionState } from '../decisions/decision-types.ts'

export type ApprovalKind = 'hire' | 'vault' | 'skill' | 'attention'

export interface ApprovalItem {
  readonly id: string
  readonly kind: ApprovalKind
  readonly title: string
  readonly question: string
  readonly primaryKey: string
  readonly hireProposal?: PersonaProposal
  readonly proposerName?: string
  readonly proposerPersonaId?: string
  readonly hirePortraitKey?: string
  readonly contextBody?: string
  /** One-line "why" from the host for a hire (UX-02). */
  readonly hireWhy?: string
  /** Role the proposed persona fills (spec.title); the card title reads "Contratar uma persona para {role}?" (A-4). */
  readonly hireRoleTitle?: string
  /** What the proposed persona does (spec.description): the card's intro line, never labelled as a motive. */
  readonly hireDescription?: string
  /** Average tasks per month, ONLY when the host measured it; absent = no line (never a guess). */
  readonly hireMonthlyTasks?: number
  /** `low` = may go in the batch "Aprovar de risco baixo"; anything else (hire, spend, access) never does. */
  readonly risk?: 'low' | 'normal'
  /** ISO moment the host created the card (rendered with `formatWhen`); absent = no time shown. */
  readonly createdAt?: string
  /** Cofre update (A-4b): which record changes, and before → after in the host's own words. All optional. */
  readonly vaultField?: string
  readonly vaultBefore?: string
  readonly vaultAfter?: string
  /** Title of the card this one waits on, ONLY when the host names a real dependency: the primary stays off and says so. */
  readonly dependsOnTitle?: string
  /** Lifecycle of the shared Decision (DECISIONS-SPEC). Present = the card is driven by the live store, not by local state. */
  readonly decisionState?: DecisionState
  /** When set, accept can call `grantBrainPermission` (Segundo cérebro). */
  readonly brain?: {
    readonly grantId: string
    readonly personaId: string
    readonly personaName: string
    readonly action: string
    readonly target: string
  }
}

export const MOCK_APPROVALS: readonly ApprovalItem[] = [
  {
    id: 'ap-hire-1',
    kind: 'hire',
    title: 'Sol',
    question: 'Contratar Sol?',
    primaryKey: 'action.primary.hire',
    hireProposal: {
      id: 'prop-sol',
      workspaceId: 'ws-demo',
      creatorPersonaId: 'persona-atlas',
      policy: 'approval',
      status: 'pending',
      createdAt: '2026-11-03T12:00:00Z',
      spec: {
        name: 'Sol',
        avatar: { kind: 'gallery', ref: 'sol-default' },
        title: 'Suporte',
        description: 'Atendimento ao cliente',
        personality: 'Empática',
        instructions: 'Tom acolhedor',
        runner: { kind: 'cli', cli: 'codex', model: 'gpt' },
        tools: { files: 'read' },
        skills: [],
        limits: {},
        systemRoles: [],
        canRecruit: false,
      },
    },
  },
  {
    id: 'ap-vault-1',
    kind: 'vault',
    title: 'Tom de voz',
    question: 'Atualizar registro no Cofre?',
    primaryKey: 'action.primary.vault',
  },
  {
    id: 'ap-att-1',
    kind: 'attention',
    title: 'Aprovar deploy em staging',
    question: 'Precisa de você nesta tarefa',
    primaryKey: 'action.primary.attention',
  },
]
