/** Client draft for sprint planning from a loaded project board. */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ProjectBoardView } from '@deepseek-ai/dsh-persona-host/types'
import type { FlowCardModel } from './flow-types.ts'
import type { SprintPlanningDraft } from './SprintPlanningView.tsx'

export interface SprintPlanningState {
  readonly sprintId: string
  readonly persisted: boolean
  readonly draft: SprintPlanningDraft
  readonly ticketIds: readonly string[]
  readonly selectedBacklogId: string | null
  readonly selectedSprintId: string | null
  readonly setDraftPatch: (patch: Partial<SprintPlanningDraft>) => void
  readonly setSelectedBacklogId: (id: string | null) => void
  readonly setSelectedSprintId: (id: string | null) => void
  readonly addSelectedToSprint: () => void
  readonly removeSelectedFromSprint: () => void
  /** Arrastar e soltar: manda a tarefa direto, sem passar pela seleção. */
  readonly moveToSprint: (ticketId: string) => void
  readonly moveToBacklog: (ticketId: string) => void
  readonly backlogCards: readonly FlowCardModel[]
  readonly sprintCards: readonly FlowCardModel[]
}

function dateInputFromIso(iso: string | undefined): string {
  if (iso === undefined || iso.length === 0) return ''
  return iso.slice(0, 10)
}

function isoFromDateInput(value: string): string | undefined {
  if (value.length === 0) return undefined
  return `${value}T12:00:00.000Z`
}

function planningSeed(board: ProjectBoardView): {
  sprintId: string
  persisted: boolean
  draft: SprintPlanningDraft
  ticketIds: string[]
} {
  const current = board.currentSprint
  const planned = current?.status === 'planejado' ? current : undefined

  if (planned !== undefined) {
    return {
      sprintId: planned.id,
      persisted: true,
      draft: {
        name: planned.name,
        objective: planned.objective,
        startsAt: dateInputFromIso(planned.startsAt),
        endsAt: dateInputFromIso(planned.endsAt),
      },
      ticketIds: [...planned.ticketIds],
    }
  }

  return {
    sprintId: `sp-${crypto.randomUUID()}`,
    persisted: false,
    draft: { name: '', objective: '', startsAt: '', endsAt: '' },
    ticketIds: [],
  }
}

function eligibleBacklogIds(board: ProjectBoardView, sprintTicketIds: readonly string[]): Set<string> {
  const active = board.currentSprint?.status === 'ativo' ? board.currentSprint : undefined
  const locked = new Set<string>(sprintTicketIds)
  if (active !== undefined) {
    for (const id of active.ticketIds) locked.add(id)
  }
  const eligible = new Set<string>()
  for (const card of board.cards) {
    if (card.category === 'done') continue
    if (locked.has(card.ticketId)) continue
    eligible.add(card.ticketId)
  }
  return eligible
}

/** Hook: backlog ↔ sprint selection for {@link SprintPlanningView}. */
export function useSprintPlanningState(
  board: ProjectBoardView | null,
  cards: readonly FlowCardModel[],
  enabled: boolean,
): SprintPlanningState | null {
  const [sprintId, setSprintId] = useState('')
  const [persisted, setPersisted] = useState(false)
  const [draft, setDraft] = useState<SprintPlanningDraft>({ name: '', objective: '', startsAt: '', endsAt: '' })
  const [ticketIds, setTicketIds] = useState<string[]>([])
  const [selectedBacklogId, setSelectedBacklogId] = useState<string | null>(null)
  const [selectedSprintId, setSelectedSprintId] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled || board === null) return
    const seed = planningSeed(board)
    setSprintId(seed.sprintId)
    setPersisted(seed.persisted)
    setDraft(seed.draft)
    setTicketIds([...seed.ticketIds])
    setSelectedBacklogId(null)
    setSelectedSprintId(null)
  }, [enabled, board, board?.projectId, board?.currentSprint?.id, board?.currentSprint?.status])

  const backlogCards = useMemo(() => {
    if (board === null || !enabled) return []
    const backlogEligible = eligibleBacklogIds(board, ticketIds)
    return cards.filter(card => backlogEligible.has(card.id))
  }, [board, cards, enabled, ticketIds])

  const sprintCards = useMemo(() => {
    if (!enabled) return []
    const sprintSet = new Set(ticketIds)
    return cards.filter(card => sprintSet.has(card.id))
  }, [cards, enabled, ticketIds])

  const setDraftPatch = useCallback((patch: Partial<SprintPlanningDraft>) => {
    setDraft(prev => ({ ...prev, ...patch }))
  }, [])

  const addSelectedToSprint = useCallback(() => {
    if (selectedBacklogId === null) return
    setTicketIds(prev => (prev.includes(selectedBacklogId) ? prev : [...prev, selectedBacklogId]))
    setSelectedBacklogId(null)
  }, [selectedBacklogId])

  const removeSelectedFromSprint = useCallback(() => {
    if (selectedSprintId === null) return
    setTicketIds(prev => prev.filter(id => id !== selectedSprintId))
    setSelectedSprintId(null)
  }, [selectedSprintId])

  const moveToSprint = useCallback((ticketId: string) => {
    setTicketIds(prev => (prev.includes(ticketId) ? prev : [...prev, ticketId]))
    setSelectedBacklogId(current => (current === ticketId ? null : current))
  }, [])

  const moveToBacklog = useCallback((ticketId: string) => {
    setTicketIds(prev => prev.filter(id => id !== ticketId))
    setSelectedSprintId(current => (current === ticketId ? null : current))
  }, [])

  if (!enabled || board === null) return null

  return {
    sprintId,
    persisted,
    draft,
    ticketIds,
    selectedBacklogId,
    selectedSprintId,
    setDraftPatch,
    setSelectedBacklogId,
    setSelectedSprintId,
    addSelectedToSprint,
    removeSelectedFromSprint,
    moveToSprint,
    moveToBacklog,
    backlogCards,
    sprintCards,
  }
}

/** Dates for create/update RPC from the planning draft. */
export function sprintDatesFromDraft(draft: SprintPlanningDraft): {
  startsAt?: string
  endsAt?: string
} {
  const startsAt = isoFromDateInput(draft.startsAt)
  const endsAt = isoFromDateInput(draft.endsAt)
  return {
    ...(startsAt === undefined ? {} : { startsAt }),
    ...(endsAt === undefined ? {} : { endsAt }),
  }
}
