/** Dynamic workflow columns (PROJECT-BOARDS / BOARDS-SPEC §2). */

import type { StageCategory } from '../boards/types.ts'
import type { KanbanCardModel } from './types.ts'

export interface FlowColumnModel {
  readonly id: string
  readonly name: string
  readonly category: StageCategory
  readonly wip?: number
  readonly color?: string
}

export interface FlowCardModel extends KanbanCardModel {
  readonly columnId: string
}

export interface ProjectFlowSnapshot {
  readonly projectId: string
  readonly projectName: string
  readonly template: string
  readonly columns: readonly FlowColumnModel[]
  readonly cards: readonly FlowCardModel[]
}
