/** Kanban view models (preview / host projection). */

import type { SubjectColorIndex } from '../chat/conversation-subjects.ts'
import type { PersonaWorkUiState } from '../team/persona-work-state.ts'
import type { CardHandoffUi, HandoffNoteUi, PathStepUi, ReviewingUi } from '../teamwork/teamwork-wire.ts'
import type { TaskThreadUi } from './task-conversation.ts'

export type KanbanColumnId = 'todo' | 'in_progress' | 'in_review' | 'blocked' | 'done'

export type KanbanSurfaceState = 'loading' | 'error' | 'empty' | 'ready'

export interface KanbanPersonaRef {
  readonly id: string
  readonly name: string
  readonly initials: string
}

/** Optional typed field from the project workflow (BOARDS-SPEC §2.2). */
export interface KanbanFlowField {
  readonly label: string
  readonly value: string
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
  /** Persona work chip on the card (host or derived from column). */
  readonly assigneeState?: PersonaWorkUiState
  readonly flowFields?: readonly KanbanFlowField[]
  readonly dueLabel?: string
  readonly dependency?: boolean
  readonly dependencyCount?: number
  readonly evidence?: boolean
  readonly evidenceCount?: number
  readonly waitingEvent: boolean
  readonly blocked: boolean
  readonly reviewApproved: boolean
  readonly outcome?: 'completed' | 'merged' | 'closed'
  readonly carry?: PersonaCarryAnimation
  /** W2-3 — conversation subject linked to the task (when host exposes it). */
  readonly conversationSubject?: { readonly name: string; readonly colorIndex: SubjectColorIndex } | undefined
  /** CV-5 (host `BoardCardView.collaborators`): the personas WITH the lead — "com Bento". Absent when there are none. */
  readonly collaborators?: readonly { readonly personaId: string; readonly name: string }[] | undefined
  /** FLOW-1 (host `BoardCardView.deliveryPending`): a result waits for Aplicar/Descartar. `false` = the host knows nothing waits; absent = infer from the column. */
  readonly deliveryPending?: boolean | undefined
  /** EQUIPE REAL (D-090): "Pedido por {A}" / "Esperando {B}" — drawn only with `persona.flag.teamwork`. */
  readonly handoff?: CardHandoffUi | undefined
  /** EQUIPE REAL: the last handoff note ("Bilhete de {A}"), shown inside the work path. */
  readonly note?: HandoffNoteUi | undefined
  /** EQUIPE REAL: who wrote, handed on, delivered and reviewed this task ("Caminho do trabalho"). */
  readonly path?: readonly PathStepUi[] | undefined
  /** EQUIPE REAL: a colleague is reviewing this task now ("Revisando: {R}"). */
  readonly reviewing?: ReviewingUi | undefined
  /** IV-10: the open question of the task in one line (≤ 120 characters) and the thread it was asked in (`channel:geral`, `dm:<id>`); gone once answered. */
  readonly question?: string | undefined
  readonly questionStreamId?: string | undefined
  /** Muse (12/11): why a card in Bloqueado stopped, in one line ("Falta o login do Mercado Pago"); absent when the host sends none (the card then says only "Parado"). */
  readonly blockedReason?: string | undefined
  /** COLHEITA 18 (host `BoardCardView.thread*`): the conversation of the task — the unread badge on the card; absent when the host sends none. */
  readonly thread?: TaskThreadUi | undefined
  /** Capture-only example card (`teamwork-dev-sample.ts`): it carries the "Exemplo" chip and never reaches the host. */
  readonly sample?: true | undefined
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
