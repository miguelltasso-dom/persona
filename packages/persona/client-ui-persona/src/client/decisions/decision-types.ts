/** Central human decision types across Overview and Approvals (UX-PHASE Item 4 / DECISIONS-SPEC). */

import type { ApprovalView } from '@deepseek-ai/dsh-persona-host/types'

export type DecisionKind = 'hire' | 'vault' | 'skill' | 'proactive' | 'blocker'

export type DecisionState = 'pending' | 'deciding' | 'accepted' | 'declined' | 'failed'

/** Locale keys the shared decision pieces read; both the shell and approvals dictionaries define them. */
export type DecisionKey =
  | 'decision.approve'
  | 'decision.review'
  | 'decision.declined'
  | 'decision.failed'
  | 'decision.retry'
  | 'decision.undoToast'
  | 'decision.undo'
  | 'decision.live.accepted'
  | 'decision.live.declined'
  | 'decision.noticesLabel'

export type DecisionT = (key: DecisionKey, params?: Readonly<Record<string, string | number>>) => string

/** Time the accepted stamp holds before the card leaves every list (DECISIONS-SPEC Regra 2). */
export const DECISION_ACCEPT_EXIT_MS = 750
/** Time the "set aside" chip holds before the card leaves every list. */
export const DECISION_DECLINE_EXIT_MS = 400
/** How long the undo toast stays when the host marks the decision reversible. */
export const DECISION_UNDO_MS = 6000

export interface DecisionRequester {
  readonly personaId: string
  readonly name: string
  /** Portrait of the persona, resolved from the real team (absent for the system / an unknown persona). */
  readonly avatarSrc?: string | undefined
}

export interface Decision {
  /** Stable host ID (proposal, task ticket, or attention ID). */
  readonly id: string
  /** Decision category. */
  readonly kind: DecisionKind
  /** User-facing title. */
  readonly title: string
  /** Who requested the decision. */
  readonly requester: DecisionRequester
  /** True when someone or the team is blocked waiting on this decision. */
  readonly blocking: boolean
  /** Risk tier: 'low' allows 1-click approve from Visão Geral; 'normal' requires Review. */
  readonly risk: 'low' | 'normal'
  /** ISO timestamp when decision was generated ('' when the host did not say). */
  readonly createdAt: string
  /** Current state in the decision lifecycle. */
  readonly state: DecisionState
  /** Whether the host can undo it (the "Desfazer" toast only exists when true). */
  readonly reversible?: boolean
  /** Repeating need rationale (required for hire decisions; UX-02). */
  readonly reason?: string
  /** The host's own one-line "why" (only when the host said it; never the question fallback). Shown on the hire card. */
  readonly why?: string
  /** "Sempre permitir" made a permanent READ grant: the words of the toast's Desfazer ("Agora {name} pode ler o {connector} sem perguntar"). */
  readonly connectorGrant?: { readonly personaName: string; readonly connectorName: string }
  /** Underlying host approval kind for RPC routing. */
  readonly targetApprovalKind?: 'hire' | 'vault' | 'skill' | 'attention' | 'connector' | 'action'
  /** Raw host card (Approvals builds its rich card — brain scope, hire portrait — from it). */
  readonly approval?: ApprovalView
  /** Decision came from a daily-summary proposal (Approvals shows it in the daily list). */
  readonly fromSummary?: boolean
}
