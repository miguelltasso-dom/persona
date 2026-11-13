/**
 * Marco Dogfood M6 (host) + the autopilot switch: the "quem está cuidando de quê" view of a project is COMPOSED here from what the host already knows (ports), and the switch "deixar a responsável tocar o quadro" is one
 * small doc per project (screens KV, default OFF). Pure over ports, so the Remotes in `index.ts` stay a few lines each. Nothing here writes except the switch itself.
 */

import { careViewOf, leadStateOf, type CarePersona, type CareWaitingItem, type ProjectCareView } from './project-care.ts'
import type { LeadGate } from './project-lead.ts'
import type { ProjectResponsibleView } from './project-responsible.ts'

/** What the host binds. */
export interface CarePorts {
  readonly projectOf: (projectId: string) => { readonly name: string; readonly workspaceId: string } | undefined
  readonly companyName: (workspaceId: string) => string
  readonly responsible: (projectId: string) => ProjectResponsibleView
  readonly autopilot: (projectId: string) => boolean
  /** Why the loop must not act now (pause, silence window, no engine), or undefined. */
  readonly gate: (projectId: string) => LeadGate | undefined
  /** A sentence when the loop stopped for today's ceiling of cards, or undefined. */
  readonly capped: (projectId: string) => string | undefined
  /** The newest reason the loop held today (written in its trail), or undefined. */
  readonly holdReason: (projectId: string) => string | undefined
  readonly personas: (projectId: string) => readonly CarePersona[]
  readonly waiting: (projectId: string) => { readonly approvals: number; readonly reviews: number; readonly questions: number; readonly items: readonly CareWaitingItem[] }
  readonly counts: (projectId: string) => { readonly done: number; readonly doing: number; readonly queued: number; readonly cap: number; readonly pulled: number }
}

/**
 * @param ports - What the host knows.
 * @param projectId - Tenant project (checked by the caller).
 * @returns The one-look view of the project, or undefined when the project does not exist.
 */
export function careOf(ports: CarePorts, projectId: string): ProjectCareView | undefined {
  const project = ports.projectOf(projectId)
  if (project === undefined) return undefined
  const counts = ports.counts(projectId)
  const autopilot = ports.autopilot(projectId)
  const gate = ports.gate(projectId)
  const capped = ports.capped(projectId)
  const holdReason = ports.holdReason(projectId)
  const lead = leadStateOf({
    autopilot, doing: counts.doing, queued: counts.queued,
    ...(gate === undefined ? {} : { gate }), ...(capped === undefined ? {} : { capped }), ...(holdReason === undefined ? {} : { holdReason }),
  })
  return careViewOf({
    projectId, projectName: project.name, companyName: ports.companyName(project.workspaceId), responsible: ports.responsible(projectId), autopilot, lead,
    personas: ports.personas(projectId), waitingForYou: ports.waiting(projectId), counts,
  })
}

/** Kind and id of the doc that holds a project's switch. */
export const AUTOPILOT_KIND = 'project_autopilot'
const AUTOPILOT_ID = 'default'

interface AutopilotDoc { readonly on: boolean; readonly by: string; readonly at: string }

/** The part of the screens KV the switch uses. */
export interface AutopilotKv {
  get<T>(projectId: string, kind: string, id: string): T | undefined
  put(projectId: string, kind: string, id: string, value: unknown): void
}

/** "Deixar a responsável tocar o quadro": per project, OFF until the owner turns it on. */
export class AutopilotBook {
  private readonly kv: AutopilotKv

  /** @param kv - The screens KV. */
  constructor(kv: AutopilotKv) {
    this.kv = kv
  }

  /** @returns Whether the responsible runs the board of this project (default: no). */
  get(projectId: string): boolean {
    return this.kv.get<AutopilotDoc>(projectId, AUTOPILOT_KIND, AUTOPILOT_ID)?.on === true
  }

  /**
   * @param on - The new value.
   * @param by - Who changed it (the owner; the Remote checks that).
   * @param at - The host's clock.
   * @returns Whether anything changed (the host writes its audit line only when it did).
   */
  set(projectId: string, on: boolean, by: string, at: string): { readonly changed: boolean } {
    if (this.get(projectId) === on) return { changed: false }
    this.kv.put(projectId, AUTOPILOT_KIND, AUTOPILOT_ID, { on, by, at } satisfies AutopilotDoc)
    return { changed: true }
  }
}
