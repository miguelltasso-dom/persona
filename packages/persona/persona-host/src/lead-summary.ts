/**
 * Marco Dogfood M2: the day summary of the responsible, the rule around Anvil's composer (`day-summary.ts`). PURE: the host hands in the clock, the responsible, the facts and the posting. It decides WHEN it is due
 * (TODAY from the end of the local day; a PAST day at any hour, which is how a night held by the silence window still gets its summary at the end of the window), WHO writes it (the responsible; a paused one does not) and
 * that it goes ONCE (stable id). An empty day posts nothing (the right to silence). The facts are the host's: computed for the LEAST privileged member of the channel (no card born in a DM, nothing private).
 */

import { composeDaySummary, daySummaryId, type DaySummaryFacts } from './day-summary.ts'
import type { SummaryOutcome } from './project-lead.ts'

/** Local minute of the day from which TODAY's summary is due: 23:30 (the end of the day, before the next one begins). */
export const SUMMARY_DUE_MINUTE = 23 * 60 + 30

/** What the board gives the composer (the rest of {@link DaySummaryFacts} is the project, the day and the responsible). */
export type SummaryFacts = Pick<DaySummaryFacts, 'done' | 'doing' | 'waiting' | 'stuck' | 'teamMemory' | 'ceiling' | 'tomorrow'>

export interface SummaryPorts {
  /** The LOCAL day of the host's clock (`AAAA-MM-DD`). */
  today(): string
  /** Minutes since the local midnight. */
  minuteOfDay(): number
  responsible(projectId: string): { readonly id: string; readonly name: string } | undefined
  responsiblePaused(projectId: string): boolean
  /** The facts of that day as the least privileged member of the channel reads them. Only asked once the summary is due. */
  facts(projectId: string, dayLocal: string, responsible: { readonly id: string; readonly name: string }): SummaryFacts
  /** Whether the message of that id already exists (the host restarted after posting). */
  posted(id: string): boolean
  /** Write the message as the responsible, with that id. */
  post(projectId: string, speakerId: string, id: string, text: string): void
}

/**
 * @param ports - The host's ports.
 * @param projectId - The project.
 * @param dayLocal - The local day to summarize.
 * @returns `not-due` (nothing is read), `waiting` (no responsible or she is paused: tried again), `quiet-day` (empty: nothing posted), or `posted` (written now or already there).
 */
export function leadSummary(ports: SummaryPorts, projectId: string, dayLocal: string): SummaryOutcome {
  const today = ports.today()
  if (dayLocal > today || (dayLocal === today && ports.minuteOfDay() < SUMMARY_DUE_MINUTE)) return 'not-due'
  const lead = ports.responsible(projectId)
  if (lead === undefined || ports.responsiblePaused(projectId)) return 'waiting'
  const id = daySummaryId(projectId, dayLocal)
  if (ports.posted(id)) return 'posted'
  const text = composeDaySummary({ projectId, dayLocal, responsible: lead, ...ports.facts(projectId, dayLocal, lead) })
  if (text === undefined) return 'quiet-day'
  ports.post(projectId, lead.id, id, text.text)
  return 'posted'
}
