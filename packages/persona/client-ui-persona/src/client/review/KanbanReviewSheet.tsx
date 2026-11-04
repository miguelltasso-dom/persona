/** Loads Revisar from host Remote and overlays the kanban. */
import { useCallback, useState, type ReactNode } from 'react'
import type { ProjectScopeRequest } from '@deepseek-ai/dsh-persona-host/types'
import type { PersonaRemoteClient } from '../data/lumen-inject.ts'
import { personaReviewRemote } from '../data/persona-review-remote.ts'
import { reviewBlockedFromAccept, reviewSummaryFromHost } from '../data/adapters/review.ts'
import { unwrapRemote } from '../data/remote-call.ts'
import { usePersonaRemoteLoad } from '../data/use-persona-remote-load.ts'
import { ReviewDeliveryPanel } from './ReviewDeliveryPanel.tsx'
import type { ApplyPhase, ConflictChoice } from './simple/draft-types.ts'
import styles from './KanbanReviewSheet.module.css'

export interface KanbanReviewSheetProps {
  readonly persona: PersonaRemoteClient
  readonly scope: ProjectScopeRequest
  readonly ticketId: string
  readonly taskTitle: string
  /** Who made the draft ("Bia"); "A persona" when unknown. */
  readonly personaName?: string | undefined
  readonly onClose: () => void
  readonly onMutate: () => void
  /** Peak-end: stamp + paw burst before the board reloads. */
  readonly onAccepted?: (ticketId: string) => void
  /** After a successful apply: the way back (`restorePointId`) when the host gave one — the board shows the toast. */
  readonly onApplied?: ((info: { readonly ticketId: string; readonly restorePointId?: string | undefined }) => void) | undefined
}

export function KanbanReviewSheet({
  persona,
  scope,
  ticketId,
  taskTitle,
  personaName,
  onClose,
  onMutate,
  onAccepted,
  onApplied,
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
  const [phase, setPhase] = useState<ApplyPhase>({ kind: 'idle' })

  const accept = async (choices: Readonly<Record<string, ConflictChoice>> = {}): Promise<void> => {
    setPhase({ kind: 'applying' })
    try {
      const result = await unwrapRemote(await review.acceptReview({
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        ticketId,
        mode: 'ff',
        ...(Object.keys(choices).length === 0 ? {} : { choices }),
      }))
      const conflict = reviewBlockedFromAccept(result)
      if (conflict !== null) {
        setBlocked(conflict)
        setPhase({ kind: 'idle' })
        onMutate()
        return
      }
      onAccepted?.(ticketId)
      const restorePointId = (result as { readonly restorePointId?: unknown }).restorePointId
      onApplied?.({ ticketId, ...(typeof restorePointId === 'string' ? { restorePointId } : {}) })
      onMutate()
      onClose()
    } catch (error) {
      // Never a silent failure: the sentence is plain, the host's own words stay folded for support.
      setPhase({ kind: 'failed', detail: error instanceof Error ? error.message : String(error) })
    }
  }

  const requestChanges = async (feedback: string): Promise<void> => {
    setPhase({ kind: 'applying' })
    try {
      await unwrapRemote(await review.requestChanges({
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        ticketId,
        feedback,
      }))
      onMutate()
      onClose()
    } catch (error) {
      setPhase({ kind: 'failed', detail: error instanceof Error ? error.message : String(error) })
    }
  }

  const discard = async (): Promise<void> => {
    setPhase({ kind: 'applying' })
    try {
      await unwrapRemote(await review.discardReview({
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        ticketId,
      }))
      onMutate()
      onClose()
    } catch (error) {
      setPhase({ kind: 'failed', detail: error instanceof Error ? error.message : String(error) })
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
          personaName={personaName}
          summary={summary}
          blocked={blocked}
          phase={phase}
          initialState={
            state.status === 'loading' ? 'loading'
              : state.status === 'error' ? 'empty'
                : summary === null ? 'empty' : 'ready'
          }
          onAccept={(choices) => { void accept(choices) }}
          onRetry={() => { void accept() }}
          onRequestChanges={(feedback) => { void requestChanges(feedback) }}
          onDiscard={() => { void discard() }}
        />
      </div>
    </div>
  )
}
