/**
 * What waits for the PERSON gets asked for (EQUIPE-REAL, "a equipe cobra"): a Task the team finished that has waited in the person's
 * review for three days or more is mentioned by the Coordenação in #geral, in one line, with the days said. Deterministic (no model, no
 * cost), inside the attention budget: at most ONE line per project per day, a Task is mentioned again only after three more days, and
 * several Tasks are one line. Inert unless the team switch (`Config.teamwork`) is on.
 */

import type { EventRepos, ProductRepos, ScreenRepos } from '@deepseek-ai/dsh-persona-store'

const KIND = 'person_waiting'
const DAY_MS = 86_400_000
/** Days a finished Task waits for the person before the team asks, and before it asks again. */
export const WAITING_DAYS = 3
const NAMED = 3

/** A Task that waits for the person's review. */
export interface WaitingTask {
  readonly taskId: string
  readonly personaId: string
  readonly title: string
  /** When it started waiting (ISO). */
  readonly since: string
}

export interface PersonWaitingDeps {
  readonly enabled: () => boolean
  readonly now: () => string
  readonly product: Pick<ProductRepos, 'listPersonas' | 'listChannels' | 'getProject'>
  readonly events: Pick<EventRepos, 'append' | 'has'>
  readonly screens: ScreenRepos
  /** The Tasks that wait for the person's review right now. */
  readonly waiting: (projectId: string) => readonly WaitingTask[]
}

export type WaitingOutcome = 'posted' | 'off' | 'nothing' | 'no-coordination' | 'no-channel'

/** The reminders of what waits for the person. */
export class PersonWaiting {
  /** @param deps - Host parts. */
  constructor(private readonly deps: PersonWaitingDeps) {}

  /**
   * Look at what waits and, when something has waited long enough, say so once.
   * @param projectId - Tenant.
   * @returns What happened (`nothing` when no Task is due or the day's line was already said).
   */
  check(projectId: string): WaitingOutcome {
    const { deps } = this
    if (!deps.enabled()) return 'off'
    const nowIso = deps.now()
    const now = Date.parse(nowIso)
    const day = nowIso.slice(0, 10)
    const eventId = `person-waiting:${projectId}:${day}`
    if (deps.events.has(eventId)) return 'nothing' // the budget: one line a day
    const due = deps.waiting(projectId).filter((task) => {
      const days = Math.floor((now - Date.parse(task.since)) / DAY_MS)
      if (!(days >= WAITING_DAYS)) return false
      const last = deps.screens.get<{ at: string }>(projectId, KIND, task.taskId)
      return last === undefined || now - Date.parse(last.at) >= WAITING_DAYS * DAY_MS
    })
    if (due.length === 0) return 'nothing'
    const personas = deps.product.listPersonas(projectId)
    const coordination = personas.find(persona => persona.systemRoles.includes('coordination'))
    if (coordination === undefined) return 'no-coordination'
    const channels = deps.product.listChannels(projectId)
    const channel = channels.find(row => row.name === 'geral') ?? channels[0]
    const project = deps.product.getProject(projectId)
    if (channel === undefined || project === undefined) return 'no-channel'
    const oldest = [...due].sort((a, b) => a.since.localeCompare(b.since))
    const first = oldest[0]
    if (first === undefined) return 'nothing'
    const daysOf = (task: WaitingTask): number => Math.floor((now - Date.parse(task.since)) / DAY_MS)
    const who = (task: WaitingTask): string => personas.find(row => row.id === task.personaId)?.name ?? 'a equipe'
    const body = due.length === 1
      ? `“${first.title}”, de ${who(first)}, espera a sua revisão há ${String(daysOf(first))} dias.`
      : `${String(due.length)} tarefas esperam a sua revisão há mais de ${String(WAITING_DAYS)} dias: ${oldest.slice(0, NAMED).map(task => `“${task.title}”`).join(', ')}${due.length > NAMED ? ` e mais ${String(due.length - NAMED)}` : ''}.`
    deps.events.append({
      id: eventId, workspaceId: project.workspaceId, projectId, streamKind: 'channel', ownerId: channel.id, type: 'message',
      body, actorId: coordination.id, subjectId: 'person-waiting', occurredAt: nowIso,
    })
    for (const task of due) deps.screens.put(projectId, KIND, task.taskId, { at: nowIso })
    return 'posted'
  }
}
