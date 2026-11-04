/** C5b — "Contexto usado" drawer data (host {@link TurnContextView} projection). */

import type { ActivityItem } from '../primitives/Pooled.tsx'

export interface TurnContextActivityFoldUi {
  readonly persona: { readonly name: string; readonly avatarSrc?: string | undefined }
  readonly items: readonly ActivityItem[]
  readonly moreCount: number
}

export interface TurnContextRecordUi {
  readonly id: string
  readonly kind: string
  readonly body: string
  readonly required: boolean
  readonly restricted: boolean
  readonly title?: string | undefined
  readonly locator?: string | undefined
}

export interface TurnContextUi {
  readonly ticketId: string
  readonly title: string
  readonly triggerIds: readonly string[]
  readonly records: readonly TurnContextRecordUi[]
  /** T3 §9 — tool activity for this subject when host exposes `listTurnActivity`. */
  readonly activityFolds?: readonly TurnContextActivityFoldUi[] | undefined
}
