import type { ApprovalView, DailySummaryView, TaskView } from '@deepseek-ai/dsh-persona-host/types'
import type { Decision, DecisionKind, DecisionState } from './decision-types.ts'

/** Optional fields the host (Anvil) adds to an approval card; every one degrades to a safe default. */
export interface HostDecisionExtras {
  /** Someone is stopped waiting on this card. Default: true for the inbox, false for daily proposals. */
  readonly blocking?: boolean | undefined
  /** `low` = approve straight from Visão geral. Default: low only for vault/skill. */
  readonly risk?: 'low' | 'normal' | undefined
  /** Host can undo it — the only case where "Desfazer" is shown. Default: false. */
  readonly reversible?: boolean | undefined
  readonly createdAt?: string | undefined
  /** One-line "why" for a hire (shown as "Por quê" when present; its absence never hides the card). */
  readonly reason?: string | undefined
}

export type HostApprovalCard = ApprovalView & HostDecisionExtras

export interface DeriveDecisionsParams {
  readonly needsYou?: readonly Pick<TaskView, 'id' | 'title'>[] | undefined
  readonly approvals?: readonly HostApprovalCard[] | undefined
  readonly dailySummaries?: readonly DailySummaryView[] | undefined
  /** Local lifecycle overrides (deciding / accepted / declined / failed) keyed by decision id. */
  readonly statesById?: ReadonlyMap<string, DecisionState> | Readonly<Record<string, DecisionState>> | undefined
  /**
   * Ids the host already confirmed this session, whose list may still be the old one (a refresh that started before the
   * confirmation). They are skipped so a stale list can never bring a decided card back as pending.
   */
  readonly settledIds?: ReadonlySet<string> | undefined
}

/** Hosts older than this UI omit fields: read any of them as text, never throw. */
function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function kindOf(raw: ApprovalView['kind'], fromSummary: boolean): DecisionKind {
  if (raw === 'hire' || raw === 'vault' || raw === 'skill') return raw
  return fromSummary ? 'proactive' : 'blocker'
}

function riskOf(card: HostApprovalCard): 'low' | 'normal' {
  // Anything that leaves the company or opens an access is never "de risco baixo", whatever the host says: no batch, no one-click from Visão geral.
  if (card.kind === 'action' || card.kind === 'connector') return 'normal'
  if (card.risk !== undefined) return card.risk
  return card.kind === 'vault' || card.kind === 'skill' ? 'low' : 'normal'
}

/** The host's own words for the "why" — nothing else is allowed to pose as one. */
function explicitWhy(card: HostApprovalCard): string | undefined {
  const why = text(card.reason).trim()
  return why.length > 0 ? why : undefined
}

function reasonOf(card: HostApprovalCard): string {
  const reason = text(card.reason).trim()
  if (reason.length > 0) return reason
  return text(card.question).trim()
}

/**
 * Deduplicates and harmonizes human decisions from host approvals, overview tasks, and daily summaries (DECISIONS-SPEC).
 *
 * Rules:
 * 1. Single source: the same id appears at most once, whichever list the host returned it in.
 * 2. Attention/reactive wins over a proactive proposal with the same id (blocking version kept, proposal omitted).
 * 3. Inbox cards and tasks that need the person are `blocking: true`; daily proposals are `blocking: false`
 *    unless the host says otherwise.
 * 4. A pending decision never disappears for lack of data (DECISIONS-SPEC Regra 4, corrected by Muse): a hire without a
 *    "why" is listed without the "Por quê" line. Whether a proposal deserves to exist is the proposer's rule (Forge
 *    `recommend`) and the host's, never a reason to hide what someone is waiting on.
 * 5. Only pending host cards are decisions; a card already decided stays only while its local exit state is running.
 */
export function deriveDecisions({
  needsYou = [],
  approvals = [],
  dailySummaries = [],
  statesById,
  settledIds,
}: DeriveDecisionsParams): readonly Decision[] {
  const override = (id: string): DecisionState | undefined => {
    if (statesById === undefined) return undefined
    if (statesById instanceof Map) return (statesById as ReadonlyMap<string, DecisionState>).get(id)
    return (statesById as Readonly<Record<string, DecisionState | undefined>>)[id]
  }

  const result: Decision[] = []
  const seenIds = new Set<string>()

  const push = (decision: Decision): void => {
    seenIds.add(decision.id)
    result.push(decision)
  }

  // 1. Reactive approvals (hire / vault / skill / attention) from the host inbox.
  for (const card of approvals) {
    if (seenIds.has(card.id)) continue
    const local = override(card.id)
    if (card.status !== 'pending' && local === undefined) continue
    if (local === undefined && settledIds?.has(card.id) === true) continue
    const reason = reasonOf(card)
    push({
      id: card.id,
      kind: kindOf(card.kind, false),
      title: text(card.title).length > 0 ? card.title : card.id,
      requester: {
        personaId: text(card.personaId).length > 0 ? card.personaId : 'system',
        name: text(card.personaName).length > 0 ? card.personaName : 'Equipe',
      },
      blocking: card.blocking ?? true,
      risk: riskOf(card),
      createdAt: card.createdAt ?? '',
      state: local ?? 'pending',
      ...(reason.length > 0 ? { reason } : {}),
      ...(explicitWhy(card) === undefined ? {} : { why: explicitWhy(card)! }),
      targetApprovalKind: card.kind,
      ...(card.reversible === true ? { reversible: true } : {}),
      approval: card,
    })
  }

  // 2. Tasks that need the person (the same ticket id as an attention card collapses into it).
  for (const task of needsYou) {
    if (seenIds.has(task.id)) continue
    if (override(task.id) === undefined && settledIds?.has(task.id) === true) continue
    push({
      id: task.id,
      kind: 'blocker',
      title: task.title,
      requester: { personaId: 'system', name: 'Equipe' },
      blocking: true,
      risk: 'normal',
      createdAt: '',
      state: override(task.id) ?? 'pending',
      targetApprovalKind: 'attention',
    })
  }

  // 3. Proactive daily summaries (the attention version above wins on a repeated id).
  for (const summary of dailySummaries) {
    for (const proposal of summary.proposals) {
      if (proposal.kind === 'attention' || seenIds.has(proposal.id)) continue
      const card = proposal as HostApprovalCard
      const local = override(proposal.id)
      if (proposal.status !== 'pending' && local === undefined) continue
      if (local === undefined && settledIds?.has(proposal.id) === true) continue
      const reason = reasonOf(card)
      push({
        id: proposal.id,
        kind: kindOf(proposal.kind, true),
        title: text(proposal.title).length > 0 ? proposal.title : proposal.id,
        requester: { personaId: summary.personaId, name: summary.personaName },
        blocking: card.blocking ?? false,
        risk: riskOf(card),
        createdAt: card.createdAt ?? summary.date,
        state: local ?? 'pending',
        ...(reason.length > 0 ? { reason } : {}),
        ...(explicitWhy(card) === undefined ? {} : { why: explicitWhy(card)! }),
        targetApprovalKind: proposal.kind,
        ...(card.reversible === true ? { reversible: true } : {}),
        approval: proposal,
        fromSummary: true,
      })
    }
  }

  return result
}
