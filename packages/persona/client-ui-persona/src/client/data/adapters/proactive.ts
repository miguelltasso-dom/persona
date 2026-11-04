import type { DailySummaryView } from '@deepseek-ai/dsh-persona-host/types'
import type { PersonaDailyProactiveSummary } from '../../approvals/proactivity-mock-data.ts'
import { normalizeCharacterId } from '../../governance/governance-ui-helpers.ts'

/** Host daily summaries → Aprovações proactive section (PRO-5). */
export function dailySummariesToUi(rows: readonly DailySummaryView[]): readonly PersonaDailyProactiveSummary[] {
  return rows.map((row) => {
    const personaCharacterId = normalizeCharacterId(row.personaName)
    return {
      personaId: row.personaId,
      personaName: row.personaName,
      summaryDate: row.date,
      ...(personaCharacterId === undefined ? {} : { personaCharacterId }),
      proposals: row.proposals
        .filter(proposal => proposal.status === 'pending' && proposal.kind !== 'attention')
        .map((proposal) => {
          const kind = proposal.kind === 'skill' ? 'followUp' as const
            : proposal.kind === 'vault' ? 'risk' as const
              : 'initiative' as const
          const mapped = {
            id: proposal.id,
            kind,
            title: proposal.title,
            oneQuestion: proposal.question,
            impactDetail: proposal.question,
          }
          if (proposal.kind === 'hire' || proposal.kind === 'vault' || proposal.kind === 'skill') {
            return { ...mapped, approvalKind: proposal.kind }
          }
          return mapped
        }),
    }
  })
}
