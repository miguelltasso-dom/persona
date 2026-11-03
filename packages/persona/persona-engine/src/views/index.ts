/**
 * JSON-safe UI read models over Repositories + `can()`.
 */

export { overview, needsYou, type OverviewView } from './overview.ts'
export {
  ticketList, ticketRow, ticketSummary, ticketDetail, basisFacts,
  type TicketRowView, type TicketDetailView, type BasisFact,
} from './tickets.ts'
export {
  threadList, threadDetail, encodeCursor, decodeCursor, type ThreadRowView, type TimelineTurn,
} from './threads.ts'
export { decisionList, decisionRow, search, type DecisionRowView, type SearchHit } from './records.ts'
export {
  page, newestFirst, stamp, listDecisions, knownTriggers, turnsFromRepo,
  type ViewHost, type ExecutorLoad,
} from './host.ts'
export { preview, capped } from './text.ts'
export { honestState, nowOverview, whileAway } from './now.ts'
export type { HonestState, NowOverview, PersonaLoad, PersonaNow, WhileAway } from './now.ts'
