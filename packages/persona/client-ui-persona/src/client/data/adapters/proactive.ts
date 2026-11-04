import type { DailySummaryView } from '@deepseek-ai/dsh-persona-host/types'
import type { PersonaDailyProactiveSummary } from '../../approvals/proactivity-mock-data.ts'
import type { DecisionState } from '../../decisions/decision-types.ts'
import { normalizeCharacterId } from '../../governance/governance-ui-helpers.ts'

/** Host daily summaries → Aprovações proactive section (PRO-5 / DECISIONS-SPEC UX-01). */
export function dailySummariesToUi(
  rows: readonly DailySummaryView[],
  blockingIds?: ReadonlySet<string>,
  /** Shared Decision lifecycle by id: a proposal with a state stays listed (exit animation) and carries it. */
  stateById?: ReadonlyMap<string, DecisionState>,
): readonly PersonaDailyProactiveSummary[] {
  return rows.map((row) => {
    const personaCharacterId = normalizeCharacterId(row.personaName)
    return {
      personaId: row.personaId,
      personaName: row.personaName,
      summaryDate: row.date,
      ...(personaCharacterId === undefined ? {} : { personaCharacterId }),
      proposals: row.proposals
        .filter(proposal => (proposal.status === 'pending' || stateById?.has(proposal.id) === true)
          && proposal.kind !== 'attention' && (!blockingIds || !blockingIds.has(proposal.id)))
        .map((proposal) => {
          const kind = proposal.kind === 'skill' ? 'followUp' as const
            : proposal.kind === 'vault' ? 'risk' as const
              : 'initiative' as const
          const decisionState = stateById?.get(proposal.id)
          const mapped = {
            id: proposal.id,
            kind,
            title: proposal.title,
            oneQuestion: proposal.question,
            impactDetail: proposal.question,
            ...(decisionState === undefined ? {} : { decisionState }),
          }
          if (proposal.kind === 'hire' || proposal.kind === 'vault' || proposal.kind === 'skill') {
            return { ...mapped, approvalKind: proposal.kind }
          }
          return mapped
        }),
    }
  })
}
