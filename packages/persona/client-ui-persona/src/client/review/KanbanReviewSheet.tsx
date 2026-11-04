/** Loads Revisar from host Remote and overlays the kanban. */
import { useCallback, useState, type ReactNode } from 'react'
import type { ProjectScopeRequest } from '@deepseek-ai/dsh-persona-host/types'
import type { PersonaRemoteClient } from '../data/lumen-inject.ts'
import { personaReviewRemote } from '../data/persona-review-remote.ts'
import { reviewBlockedFromAccept, reviewSummaryFromHost } from '../data/adapters/review.ts'
import { unwrapRemote } from '../data/remote-call.ts'
import { usePersonaRemoteLoad } from '../data/use-persona-remote-load.ts'
import { ReviewDeliveryPanel } from './ReviewDeliveryPanel.tsx'
import styles from './KanbanReviewSheet.module.css'

export interface KanbanReviewSheetProps {
  readonly persona: PersonaRemoteClient
  readonly scope: ProjectScopeRequest
  readonly ticketId: string
  readonly taskTitle: string
  readonly onClose: () => void
  readonly onMutate: () => void
  /** Peak-end: stamp + paw burst before the board reloads. */
  readonly onAccepted?: (ticketId: string) => void
}

export function KanbanReviewSheet({
  persona,
  scope,
  ticketId,
  taskTitle,
  onClose,
  onMutate,
  onAccepted,
}: KanbanReviewSheetProps): ReactNode {
  const loadKey = `${scope.workspaceId}:${scope.projectId}:review:${ticketId}`
  const review = personaReviewRemote(persona)
  const load = useCallback(async () => {
    const raw = await unwrapRemote(await review.reviewSummary({
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      ticketId,
    }))
    return reviewSummaryFromHost(raw)
  }, [review, scope.projectId, scope.workspaceId, ticketId])

  const { state } = usePersonaRemoteLoad(true, loadKey, load)
  const summary = state.status === 'ready' ? state.data ?? null : null
  const [blocked, setBlocked] = useState<{ explanation: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const accept = async (): Promise<void> => {
    setBusy(true)
    try {
      const result = await unwrapRemote(await review.acceptReview({
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        ticketId,
        mode: 'ff',
      }))
      const conflict = reviewBlockedFromAccept(result)
      if (conflict !== null) {
        setBlocked(conflict)
        onMutate()
        return
      }
      onAccepted?.(ticketId)
      onMutate()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const requestChanges = async (feedback: string): Promise<void> => {
    setBusy(true)
    try {
      await unwrapRemote(await review.requestChanges({
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        ticketId,
        feedback,
      }))
      onMutate()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const discard = async (): Promise<void> => {
    setBusy(true)
    try {
      await unwrapRemote(await review.discardReview({
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        ticketId,
      }))
      onMutate()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="persona-kanban-review-title"
        onClick={(event) => { event.stopPropagation() }}
      >
        <header className={styles.sheetHeader}>
          <h2 id="persona-kanban-review-title" className={styles.sheetTitle}>{taskTitle}</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </header>
        <ReviewDeliveryPanel
          taskTitle=""
          summary={summary}
          blocked={blocked}
          initialState={
            state.status === 'loading' ? 'loading'
              : state.status === 'error' ? 'empty'
                : summary === null ? 'empty' : 'ready'
          }
          onAccept={() => { void accept() }}
          onRequestChanges={(feedback) => { void requestChanges(feedback) }}
          onDiscard={() => { void discard() }}
        />
        {busy && <p className={styles.busy} aria-live="polite">…</p>}
      </div>
    </div>
  )
}
