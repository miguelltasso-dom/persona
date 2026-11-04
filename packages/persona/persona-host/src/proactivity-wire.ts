/**
 * Binds {@link ProactivityScheduler} to the real host: requests enter through the same door as a person's message
 * (so a routine or a plan is a real Ticket with the usual budget, runner, ledger and #geral lines), goals come from
 * the sprints, readiness from the engine probe, tokens from the usage ledger. `index.ts` only calls this.
 */

import type { EventRepos, ProductRepos, RoutineRepos, ScreenRepos } from '@deepseek-ai/dsh-persona-store'
import type { BoardsHost } from './boards.ts'
import type { DraftFilesBook } from './draft-files.ts'
import type { GovernanceHost } from './governance.ts'
import type { Orchestration, ProjectRuntime } from './orchestration.ts'
import type { ProactivityHost } from './proactivity.ts'
import { ProactivityScheduler, type PostResult, type SchedulerOptions, type TeamRequest } from './proactivity-scheduler.ts'
import type { TeamStateBook } from './team-state.ts'

/** What the host hands over. */
export interface ProactivityWireHost {
  readonly product: ProductRepos
  readonly events: EventRepos
  readonly routines: RoutineRepos
  readonly proactivity: ProactivityHost
  readonly screens: ScreenRepos
  readonly orchestration: Orchestration
  readonly boards: Pick<BoardsHost, 'listSprintGoals' | 'goals'>
  readonly teamState: TeamStateBook
  readonly governance: Pick<GovernanceHost, 'gov'>
  readonly draftFiles: DraftFilesBook
}

/**
 * The channel every automatic request goes to (the same #geral the engine posts its lines to).
 */
const CHANNEL = 'geral'

/**
 * Append the request as a message and let the orchestration decide, exactly as for a person's message.
 * @param host - Host parts.
 * @param request - Routine / plan / initiative request.
 * @returns The Ticket it became, or why the pre-router did not make one.
 */
export function postTeamRequest(host: Pick<ProactivityWireHost, 'product' | 'events' | 'orchestration'>, request: TeamRequest): PostResult {
  const project = host.product.getProject(request.projectId)
  if (project === undefined) return { ok: false, reason: 'o projeto não existe mais' }
  const stored = host.events.append({
    id: request.id,
    workspaceId: request.workspaceId,
    projectId: request.projectId,
    streamKind: 'channel',
    ownerId: CHANNEL,
    type: 'message',
    body: request.body,
    actorId: request.actorId,
    subjectId: '',
    occurredAt: host.orchestration.now(),
  })
  const runtime = host.orchestration.runtime(request.projectId)
  runtime.lastRoute = undefined // so a refusal below is this message's, never a stale one
  host.orchestration.ingest(stored, 'channel', CHANNEL, request.personaId)
  const ticket = runtime.repo.tickets.list().find(item => item.origin.triggerId === stored.id)
  if (ticket !== undefined) return { ok: true, ticketId: ticket.id }
  const routed = routeOf(runtime) // read after ingest, not narrowed by the reset above
  if (routed === undefined || routed.action === 'model') return { ok: false, reason: 'a mensagem foi tratada como conversa, não como tarefa' }
  return { ok: false, reason: routed.why }
}

function routeOf(runtime: { readonly lastRoute: ProjectRuntime['lastRoute'] }): ProjectRuntime['lastRoute'] {
  return runtime.lastRoute
}

/**
 * Build the scheduler for a host. The caller starts it (production) or drives `cycle()` (tests).
 * @param host - Host parts.
 * @param options - Timing / clock.
 */
export function createProactivityScheduler(host: ProactivityWireHost, options: SchedulerOptions = {}): ProactivityScheduler {
  return new ProactivityScheduler({
    product: host.product,
    routines: host.routines,
    proactivity: host.proactivity,
    screens: host.screens,
    events: host.events,
    teamState: host.teamState,
    orchestration: host.orchestration,
    chargeOf: (workspaceId, routineId) => host.governance.gov.listRoutineCharges(workspaceId).find(row => row.routineId === routineId),
    goalsOf: (projectId) => {
      host.boards.listSprintGoals(projectId) // rebuilds the in-memory board from the stored sprints
      return host.boards.goals.list(projectId)
    },
    engineReady: () => (host.orchestration.engineReadinessOf?.().state ?? 'ready') === 'ready',
    refreshDraft: async (projectId, ticketId) => {
      const summary = await host.orchestration.reviewSummary(projectId, ticketId)
      host.draftFiles.record(projectId, ticketId, summary.files.length)
    },
    postRequest: request => postTeamRequest(host, request),
    driveTicket: (projectId, ticketId) => host.orchestration.driveTicket(projectId, ticketId),
    tokensSince: (projectId, personaId, fromIso) => host.orchestration.usage?.tokens({
      projectId, personaId, from: fromIso, to: host.orchestration.now(),
    }) ?? 0,
  }, options)
}
