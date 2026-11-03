/** Kanban view models (preview / host projection). */

export type KanbanColumnId = 'todo' | 'in_progress' | 'in_review' | 'blocked' | 'done'

export type KanbanSurfaceState = 'loading' | 'error' | 'empty' | 'ready'

export interface KanbanPersonaRef {
  readonly id: string
  readonly name: string
  readonly initials: string
}

export interface PersonaCarryAnimation {
  readonly persona: KanbanPersonaRef
  readonly fromColumn: KanbanColumnId
  readonly toColumn: KanbanColumnId
}

export interface KanbanCardModel {
  readonly id: string
  readonly title: string
  readonly projectId: string
  readonly projectName: string
  readonly teamId: string
  readonly teamName: string
  readonly column: KanbanColumnId
  readonly assignee?: KanbanPersonaRef
  readonly waitingEvent: boolean
  readonly blocked: boolean
  readonly reviewApproved: boolean
  readonly outcome?: 'completed' | 'merged' | 'closed'
  readonly carry?: PersonaCarryAnimation
}

export interface KanbanFilterOptions {
  readonly teams: ReadonlyArray<{ id: string; name: string }>
  readonly projects: ReadonlyArray<{ id: string; name: string }>
  readonly personas: ReadonlyArray<KanbanPersonaRef>
}

export interface KanbanFilters {
  teamId: string | 'all'
  projectId: string | 'all'
  personaId: string | 'all'
  column: KanbanColumnId | 'all'
}

export const KANBAN_COLUMN_ORDER: readonly KanbanColumnId[] = [
  'todo',
  'in_progress',
  'in_review',
  'blocked',
  'done',
] as const
