import type { TriageLogView } from '@deepseek-ai/dsh-persona-host/types'
import { formatTriageLogAt } from '../../rules/format-triage-log-at.ts'
import type { TriageSimulationLog } from '../../rules/mock-data.ts'

/** Host triage trail → Regras log panel. */
export function triageLogFromHost(rows: readonly TriageLogView[]): readonly TriageSimulationLog[] {
  return rows.map(row => ({
    id: row.id,
    at: formatTriageLogAt(row.at),
    summary: row.summary || `${row.gateText} → ${row.assessmentText}`,
    mode: row.mode,
  }))
}
