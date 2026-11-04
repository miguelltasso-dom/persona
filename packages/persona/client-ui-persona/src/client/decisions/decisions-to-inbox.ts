/** Decision[] → the two lists Aprovações draws (reactive "Precisa de você agora" + daily summary). Pure, no state. */

import type { ApprovalView, DailySummaryView } from '@deepseek-ai/dsh-persona-host/types'
import type { ApprovalItem } from '../approvals/mock-data.ts'
import type { PersonaDailyProactiveSummary } from '../approvals/proactivity-mock-data.ts'
import { approvalViewToItem } from '../data/adapters/approvals.ts'
import { dailySummariesToUi } from '../data/adapters/proactive.ts'
import type { Decision, DecisionState } from './decision-types.ts'

export interface DecisionInbox {
  /** Blocking decisions: someone is waiting. */
  readonly items: readonly ApprovalItem[]
  /** Non-blocking proposals, grouped per persona (the daily summary). */
  readonly proactiveSummaries: readonly PersonaDailyProactiveSummary[]
}

function viewOf(decision: Decision): ApprovalView {
  if (decision.approval !== undefined) return decision.approval
  // A task that needs the person has no card of its own: it is an "attention" question.
  return {
    id: decision.id,
    kind: 'attention',
    title: decision.title,
    question: decision.title,
    status: 'pending',
    personaId: decision.requester.personaId === 'system' ? '' : decision.requester.personaId,
    personaName: decision.requester.name,
  }
}

export function decisionsToInbox(decisions: readonly Decision[]): DecisionInbox {
  const items = decisions
    .filter(decision => decision.blocking)
    .map((decision): ApprovalItem => ({
      ...approvalViewToItem(viewOf(decision)),
      decisionState: decision.state,
      ...(decision.kind === 'hire' && decision.why !== undefined ? { hireWhy: decision.why } : {}),
    }))

  const rows = new Map<string, { personaId: string; personaName: string; date: string; proposals: ApprovalView[] }>()
  const states = new Map<string, DecisionState>()
  for (const decision of decisions) {
    if (decision.blocking) continue
    const view = viewOf(decision)
    const date = decision.createdAt.slice(0, 10)
    const key = `${decision.requester.personaId}|${date}`
    const row = rows.get(key) ?? { personaId: decision.requester.personaId, personaName: decision.requester.name, date, proposals: [] }
    // The Decision store owns the lifecycle; the adapter only needs the card to pass its "pending" gate.
    row.proposals.push({ ...view, status: 'pending' })
    rows.set(key, row)
    states.set(decision.id, decision.state)
  }
  const summaries: DailySummaryView[] = [...rows.values()]
  return {
    items,
    proactiveSummaries: dailySummariesToUi(summaries, undefined, states).filter(summary => summary.proposals.length > 0),
  }
}
