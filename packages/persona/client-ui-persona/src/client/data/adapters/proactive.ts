import type { DailySummaryView } from '@deepseek-ai/dsh-persona-host/types'
import type { PersonaDailyProactiveSummary } from '../../approvals/proactivity-mock-data.ts'

/** Host daily summaries → Aprovações proactive section (PRO-5). */
export function dailySummariesToUi(rows: readonly DailySummaryView[]): readonly PersonaDailyProactiveSummary[] {
  return rows.map(row => ({
    personaId: row.personaId,
    personaName: row.personaName,
    summaryDate: row.date,
    proposals: row.proposals
      .filter(proposal => proposal.status === 'pending' && proposal.kind !== 'attention')
      .map(proposal => ({
        id: proposal.id,
        kind: 'initiative' as const,
        title: proposal.title,
        oneQuestion: proposal.question,
        impactPreview: proposal.personaName,
        cost: { tokens: 0, runs: 0 },
      })),
  }))
}
