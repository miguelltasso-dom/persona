/** Project boards hub + flow summaries (PROJECT-BOARDS / BOARDS-SPEC). */

import type { PersonaWorkUiState } from '../team/persona-work-state.ts'

export type FlowModelId =
  | 'contratacao'
  | 'site'
  | 'software'
  | 'marketing'
  | 'atendimento'
  | 'simples'
  | 'branco'

export type StageCategory = 'todo' | 'doing' | 'review' | 'needs_you' | 'done' | 'blocked'

export interface StageCategoryCounts {
  readonly todo: number
  readonly doing: number
  readonly review: number
  readonly needs_you: number
  readonly done: number
  readonly blocked: number
}

export interface ActiveWorker {
  readonly name: string
  readonly state: PersonaWorkUiState
  /** The persona's portrait when the data source knows it; the card falls back to the name lookup. */
  readonly avatarSrc?: string | undefined
}

export interface ProjectBoardSummary {
  readonly id: string
  readonly name: string
  readonly flowModel: FlowModelId
  readonly counts: StageCategoryCounts
  readonly needsYouCount: number
  readonly activeWorkers: readonly ActiveWorker[]
  readonly sprintLabel?: string
}

export type BoardsFilterTab = 'all' | 'active_sprint' | 'needs_you'

export type BoardsSurfaceState = 'loading' | 'error' | 'empty' | 'ready'
