/**
 * Marco DOGFOOD, M2: the host's side of `ProjectAdmission`. The rule (project-admission.ts) is pure; here it gets its memory (screen documents: the owner's ceiling, the durable
 * turn counter per project and local day, the journal of what was announced), the tokens of the turn ledger, and the ONE line the person reads in the project's #geral.
 */

import type { EventRepos, ProductRepos, ScreenRepos } from '@deepseek-ai/dsh-persona-store'
import type { WindowReserve } from '@deepseek-ai/dsh-persona-usage'
import { DEFAULT_CEILING, ProjectAdmission, type PauseJournal, type ProjectCeiling, type ProjectPauseEvent } from './project-admission.ts'

/** The owner's ceiling of a project (one document, id `v1`). */
export const PROJECT_CEILING_KIND = 'project_ceiling'
export const PROJECT_CEILING_ID = 'v1'
/** The turns admitted in one local day (document id = the day `YYYY-MM-DD`). */
export const PROJECT_TURNS_KIND = 'project_turns'
/** What was announced (document id = the mark of the journal). */
export const PROJECT_PAUSE_KIND = 'project_pause_event'

/** The most requests one day remembers (a request the host recovers is not counted twice). */
const KEYS_KEPT = 2000

interface TurnsDoc {
  readonly used: number
  readonly keys: readonly string[]
}

type PauseDoc = ProjectPauseEvent & { readonly seq: number }

/** Collaborators of {@link createProjectAdmission}. */
export interface ProjectAdmissionHostDeps {
  readonly screens: ScreenRepos
  readonly events: EventRepos
  readonly product: ProductRepos
  /** Input + output tokens the ledger holds for the project between two instants (inclusive). */
  readonly tokens: (query: { readonly projectId: string; readonly from: string; readonly to: string }) => number
  readonly now: () => string
  readonly offsetMinutes: (iso: string) => number
  /** The reserve of the subscription account the project's personas use (the person's "Continuar agora" already applied). */
  readonly accountReserve: (projectId: string) => WindowReserve | undefined
  readonly slotFree: (projectId: string) => boolean
  /** The #geral of a project (created when missing). */
  readonly geralOf: (workspaceId: string, projectId: string) => string
  /** Told once per pause/resume (the lead's trail listens). */
  readonly onPause?: (event: ProjectPauseEvent) => void
}

const whole = (value: unknown, min: number, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) && value >= min ? Math.floor(value) : fallback)

/**
 * The ceiling the owner set, read as a document: a missing or malformed field is the default, never a crash (and never "no ceiling").
 * @param screens - Doc store.
 * @param projectId - The project.
 * @returns Its ceiling.
 */
export function projectCeilingOf(screens: Pick<ScreenRepos, 'get'>, projectId: string): ProjectCeiling {
  const doc = screens.get<Partial<ProjectCeiling>>(projectId, PROJECT_CEILING_KIND, PROJECT_CEILING_ID)
  if (doc === undefined) return DEFAULT_CEILING
  const pause = whole(doc.pausePct, 50, DEFAULT_CEILING.pausePct)
  return {
    turnsPerDay: whole(doc.turnsPerDay, 1, DEFAULT_CEILING.turnsPerDay),
    tokensPerDay: whole(doc.tokensPerDay, 0, DEFAULT_CEILING.tokensPerDay),
    pausePct: pause > 99 ? DEFAULT_CEILING.pausePct : pause,
  }
}

/**
 * @param event - The pause/resume.
 * @returns The id of its line in the channel: the pause keeps the deterministic key of the contract; the full stop and the resume get their own.
 */
export function pauseLineIdOf(event: ProjectPauseEvent): string {
  if (event.kind === 'pause') return event.key
  if (event.kind === 'full') return `${event.key}:full`
  return `project-resume:${event.projectId}:${event.windowKey}:${event.reason}`
}

/**
 * @param event - The pause/resume.
 * @returns What the person reads (plain words: no turns, no tokens, no ceiling jargon).
 */
export function pauseLineOf(event: ProjectPauseEvent): string {
  const what = event.reason === 'turns' ? 'de trabalho' : 'de uso'
  if (event.kind === 'pause') {
    return `Pausei o trabalho do time neste projeto: o limite ${what} de hoje chegou a ${String(event.pct)}%. O que você pedir ainda eu atendo; o resto volta amanhã às 00:00.`
  }
  if (event.kind === 'full') {
    return `Este projeto atingiu o limite ${what} de hoje. Guardo os seus pedidos e continuo amanhã às 00:00, ou o dono do projeto pode aumentar o limite.`
  }
  return `Voltei ao trabalho do time neste projeto: começou um novo dia e o limite ${what} foi renovado.`
}

/**
 * The admission of the host.
 * @param deps - Stores, ledger, clock and ports.
 * @returns The rule wired to the host's memory.
 */
export function createProjectAdmission(deps: ProjectAdmissionHostDeps): ProjectAdmission {
  const journal: PauseJournal = {
    has: mark => deps.screens.get(projectOfMark(mark), PROJECT_PAUSE_KIND, mark) !== undefined,
    put: (mark, event) => {
      const seq = deps.screens.list<PauseDoc>(event.projectId, PROJECT_PAUSE_KIND).length + 1
      deps.screens.put(event.projectId, PROJECT_PAUSE_KIND, mark, { ...event, seq } satisfies PauseDoc)
    },
    list: projectId => deps.screens.list<PauseDoc>(projectId, PROJECT_PAUSE_KIND)
      .sort((a, b) => a.seq - b.seq)
      .map(({ seq, ...event }) => { void seq; return event }),
  }
  return new ProjectAdmission({
    now: deps.now,
    offsetMinutes: deps.offsetMinutes,
    ceilingOf: projectId => projectCeilingOf(deps.screens, projectId),
    turnsOf: (projectId, windowKey) => deps.screens.get<TurnsDoc>(projectId, PROJECT_TURNS_KIND, windowKey)?.used ?? 0,
    bump: (projectId, windowKey, key) => {
      const doc = deps.screens.get<TurnsDoc>(projectId, PROJECT_TURNS_KIND, windowKey) ?? { used: 0, keys: [] }
      const keys = key === undefined ? doc.keys : [...doc.keys, key].slice(-KEYS_KEPT)
      deps.screens.put(projectId, PROJECT_TURNS_KIND, windowKey, { used: doc.used + 1, keys } satisfies TurnsDoc)
    },
    counted: (projectId, windowKey, key) => deps.screens.get<TurnsDoc>(projectId, PROJECT_TURNS_KIND, windowKey)?.keys.includes(key) ?? false,
    tokensOf: (projectId, from, to) => deps.tokens({ projectId, from, to }),
    accountReserve: deps.accountReserve,
    slotFree: deps.slotFree,
    journal,
    onEvent: (event) => {
      announce(deps, event)
      deps.onPause?.(event)
    },
  })
}

/** The project a journal mark belongs to (`<project>|<day>|<reason>|<kind>`). */
function projectOfMark(mark: string): string {
  return mark.split('|')[0] ?? ''
}

/** One line in the #geral of the project, as the coordination: idempotent (the id is deterministic), and silent when the project has nobody to speak. */
function announce(deps: ProjectAdmissionHostDeps, event: ProjectPauseEvent): void {
  const project = deps.product.getProject(event.projectId)
  if (project === undefined) return
  const id = pauseLineIdOf(event)
  if (deps.events.has(id)) return
  const speaker = deps.product.listPersonas(event.projectId).find(row => row.systemRoles.includes('coordination'))
  if (speaker === undefined) return
  deps.events.append({
    id, workspaceId: project.workspaceId, projectId: event.projectId, streamKind: 'channel', ownerId: deps.geralOf(project.workspaceId, event.projectId),
    type: 'message', body: pauseLineOf(event), actorId: speaker.id, subjectId: '', occurredAt: deps.now(),
  })
}
