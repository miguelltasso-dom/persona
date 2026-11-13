/**
 * Marco Dogfood M6 (host): "quem está cuidando de quê" — ONE look per project: the responsible, what each persona is doing now, what waits for the owner, the board's pace and the state of the responsible's loop with the reason
 * in a sentence. Read-only and assembled from what the host already knows (`overviewNow`, the approvals, the responsible book, the loop's trail); nothing new is stored. Plain on the wire (no template literals).
 */

import type { LeadGate } from './project-lead.ts'
import type { ProjectResponsibleView } from './project-responsible.ts'

/** The most "waits for you" items one view lists (the counts stay whole). */
export const CARE_ITEMS_MAX = 5

/** What the loop is doing, in a closed vocabulary the screen maps to its words. */
export type LeadState = 'working' | 'resting' | 'paused' | 'holding' | 'capped'

export interface CarePersona {
  readonly id: string
  readonly name: string
  readonly title: string
  readonly state: 'working' | 'resting' | 'stuck' | 'waiting'
  readonly sentence?: string
  readonly currentTask?: string
  readonly queueCount: number
  readonly paused?: boolean
}

export interface CareWaitingItem {
  readonly kind: 'approval' | 'question' | 'review'
  readonly taskId?: string
  readonly title: string
}

export interface CareInputs {
  readonly projectId: string
  readonly projectName: string
  readonly companyName: string
  readonly responsible: ProjectResponsibleView
  readonly autopilot: boolean
  readonly lead: { readonly state: LeadState; readonly note?: string }
  readonly personas: readonly CarePersona[]
  readonly waitingForYou: { readonly approvals: number; readonly reviews: number; readonly questions: number; readonly items: readonly CareWaitingItem[] }
  /** done = cards finished TODAY; cap = cards the loop may pull per day; pulled = how many it already pulled today. */
  readonly counts: { readonly done: number; readonly doing: number; readonly queued: number; readonly cap: number; readonly pulled: number }
}

export type ProjectCareView = CareInputs

const HOLD_WORDS: Readonly<Partial<Record<LeadGate, string>>> = {
  quiet: 'Janela de silêncio: o quadro espera até ela acabar.',
  'no-engine': 'Sem motor de IA conectado: o quadro espera.',
  'no-responsible': 'Este projeto ainda não tem time: nada a tocar.',
}

/**
 * The loop's state and the reason, in order: off beats everything; a paused team; a gate (silence, no engine, no team); a cap; a hold the loop wrote today; then working (something is moving) or resting.
 * @param facts - What the host knows about the project's loop.
 */
export function leadStateOf(facts: {
  readonly autopilot: boolean
  readonly gate?: LeadGate
  readonly capped?: string
  readonly holdReason?: string
  readonly doing: number
  readonly queued: number
}): { readonly state: LeadState; readonly note?: string } {
  if (!facts.autopilot) return { state: 'resting', note: 'A responsável não está tocando o quadro: o piloto automático está desligado.' }
  if (facts.gate === 'paused') return { state: 'paused', note: 'A equipe está pausada.' }
  if (facts.gate !== undefined) return { state: 'holding', note: HOLD_WORDS[facts.gate] ?? 'O quadro espera.' }
  if (facts.capped !== undefined) return { state: 'capped', note: facts.capped }
  if (facts.holdReason !== undefined) return { state: 'holding', note: facts.holdReason }
  if (facts.doing > 0 || facts.queued > 0) return { state: 'working' }
  return { state: 'resting', note: 'Nada na fila.' }
}

/**
 * @param inputs - The facts of one project.
 * @returns The view (the waiting list is cut to {@link CARE_ITEMS_MAX}, in the order the host gave it; the counts stay whole).
 */
export function careViewOf(inputs: CareInputs): ProjectCareView {
  return { ...inputs, waitingForYou: { ...inputs.waitingForYou, items: inputs.waitingForYou.items.slice(0, CARE_ITEMS_MAX) } }
}
