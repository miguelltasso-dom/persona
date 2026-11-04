/**
 * useKanbanCarry (Muse, UX-GUIDE §3 "Kanban"): when a PERSONA moves a card (the column changed between two
 * snapshots and the human did not drag it), the card gets `carry` for a short beat so its mini-avatar rides the
 * FLIP to the new column. Human moves (drag/menu) call `markLocalMove` first and never get a carrier.
 *
 * Call it BEFORE `useKanbanFlip` in the same component and pass `isCarried` to it: layout effects run in
 * declaration order, so the FLIP of the very commit that moved the card already knows to use the 360 ms beat.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { KanbanCardModel } from './types.ts'

/** Carrier stays visible a bit past the 360 ms FLIP so the hop-off reads. */
export const KANBAN_CARRY_MS = 900

interface CarryCard {
  readonly id: string
  readonly column: KanbanCardModel['column']
  readonly assignee?: KanbanCardModel['assignee']
  readonly carry?: KanbanCardModel['carry']
}

/**
 * Pure step (exported for tests): which card ids changed column since `previous`, were not moved locally,
 * and have someone to carry them.
 */
export function detectPersonaMoves(
  previous: ReadonlyMap<string, string>,
  cards: readonly { readonly id: string; readonly columnKey: string; readonly hasAssignee: boolean }[],
  localMoves: ReadonlySet<string>,
): Set<string> {
  const moved = new Set<string>()
  for (const card of cards) {
    const from = previous.get(card.id)
    if (from === undefined || from === card.columnKey) continue
    if (localMoves.has(card.id) || !card.hasAssignee) continue
    moved.add(card.id)
  }
  return moved
}

export interface KanbanCarry<T> {
  readonly cards: readonly T[]
  /** Call from the human drag/menu handler before the move is applied. */
  readonly markLocalMove: (cardId: string) => void
  /** For `useKanbanFlip`: true while the card is being carried by its persona. */
  readonly isCarried: (cardId: string) => boolean
}

export function useKanbanCarry<T extends CarryCard>(
  cards: readonly T[],
  columnKeyOf: (card: T) => string = card => card.column,
): KanbanCarry<T> {
  const previous = useRef<Map<string, { readonly key: string; readonly column: T['column'] }> | null>(null)
  const localMoves = useRef(new Set<string>())
  const carried = useRef(new Map<string, T['column']>())
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const [version, setVersion] = useState(0)

  const markLocalMove = useCallback((cardId: string) => { localMoves.current.add(cardId) }, [])
  const isCarried = useCallback((cardId: string) => carried.current.has(cardId), [])

  const signature = cards.map(card => `${card.id}:${columnKeyOf(card)}`).join('|')

  useLayoutEffect(() => {
    const prior = previous.current
    previous.current = new Map(cards.map(card => [card.id, { key: columnKeyOf(card), column: card.column }] as const))
    if (prior === null) return // first paint: nothing "moved"
    const moved = detectPersonaMoves(
      new Map([...prior].map(([id, entry]) => [id, entry.key] as const)),
      cards.map(card => ({ id: card.id, columnKey: columnKeyOf(card), hasAssignee: card.assignee !== undefined })),
      localMoves.current,
    )
    for (const card of cards) {
      if (prior.get(card.id)?.key !== columnKeyOf(card)) localMoves.current.delete(card.id)
    }
    if (moved.size === 0) return
    for (const id of moved) {
      carried.current.set(id, prior.get(id)!.column)
      const pending = timers.current.get(id)
      if (pending !== undefined) clearTimeout(pending)
      timers.current.set(id, setTimeout(() => {
        carried.current.delete(id)
        timers.current.delete(id)
        setVersion(v => v + 1)
      }, KANBAN_CARRY_MS))
    }
    setVersion(v => v + 1)
    // signature captures every column change; cards/columnKeyOf identity alone must not retrigger
  }, [signature])

  useEffect(() => () => {
    for (const timer of timers.current.values()) clearTimeout(timer)
    timers.current.clear()
  }, [])

  const withCarry = useMemo(() => {
    if (carried.current.size === 0) return cards
    return cards.map((card) => {
      const from = carried.current.get(card.id)
      if (from === undefined || card.assignee === undefined || card.carry !== undefined) return card
      return { ...card, carry: { persona: card.assignee, fromColumn: from, toColumn: card.column } }
    })
    // version bumps when the carried set changes (it lives in a ref so the FLIP can read it synchronously)
  }, [cards, version])

  return { cards: withCarry, markLocalMove, isCarried }
}
