/** Loads Revisar from host Remote and overlays the kanban. */
import { useCallback, useRef, useState, type ReactNode } from 'react'
import type { ProjectScopeRequest } from '@deepseek-ai/dsh-persona-host/types'
import type { PersonaRemoteClient } from '../data/lumen-inject.ts'
import { personaPortraitSrc } from '../approvals/approvals-ui-helpers.ts'
import { personaReviewRemote } from '../data/persona-review-remote.ts'
import type { ReviewFileConflictView } from '@deepseek-ai/dsh-persona-host/types'
import { reviewBlockedFromAccept, reviewConflictsFromAccept, reviewSummaryFromHost, resolveReviewConflicts } from '../data/adapters/review.ts'
import { unwrapRemote } from '../data/remote-call.ts'
import { usePersonaRemoteLoad } from '../data/use-persona-remote-load.ts'
import { ReviewDeliveryPanel } from './ReviewDeliveryPanel.tsx'
import type { ReviewedBySealReviewer } from '../teamwork/ReviewedBySeal.tsx'
import { REVIEW_DEV_SUMMARY, REVIEW_DEV_TICKET_ID, reviewDevAccept, reviewDevSampleEnabled } from './review-dev-sample.ts'
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
  /** "Desfazer" on the success moment: puts the earlier versions back (needs the restore point the host gave). */
  readonly onUndoApplied?: ((restorePointId: string) => void) | undefined
  /** TEAM-8: o selo "Revisado por {R}" no cabeçalho do Revisar mudanças quando um colega aprovou sem pontos em aberto. */
  readonly reviewedBy?: ReviewedBySealReviewer | undefined
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
  onUndoApplied,
  reviewedBy,
}: KanbanReviewSheetProps): ReactNode {
  const loadKey = `${scope.workspaceId}:${scope.projectId}:review:${ticketId}`
  const review = personaReviewRemote(persona)
  // Capture-only sample (dev seed + its own flag + its own ticket): never reaches the host, always says "Exemplo".
  const sample = ticketId === REVIEW_DEV_TICKET_ID && reviewDevSampleEnabled()
  const sampleAccepts = useRef(0)
  const load = useCallback(async () => {
    if (sample) return reviewSummaryFromHost(REVIEW_DEV_SUMMARY)
    // The host's ticket commands carry a command and a reason (it refuses a bare ticketId at the gateway).
    const raw = await unwrapRemote(await review.reviewSummary({
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      ticketId,
      command: 'reevaluate',
      reason: 'Revisar as mudanças do rascunho',
    }))
    return reviewSummaryFromHost(raw)
  }, [review, sample, scope.projectId, scope.workspaceId, ticketId])

  const { state } = usePersonaRemoteLoad(true, loadKey, load)
  const loaded = state.status === 'ready' ? state.data ?? null : null
  const [blocked, setBlocked] = useState<{ explanation: string } | null>(null)
  // Files the folder and the draft both changed, as the host reported them after Aplicar (with the exact versions).
  const [clashes, setClashes] = useState<readonly ReviewFileConflictView[]>([])
  const summary = loaded === null || clashes.length === 0
    ? loaded
    : {
      ...loaded,
      files: [
        ...loaded.files.map(file => (clashes.some(clash => clash.path === file.path) ? { ...file, conflict: true } : file)),
        // A clash on a file the summary did not list is still a clash the person must answer.
        ...clashes.filter(clash => !loaded.files.some(file => file.path === clash.path)).map(clash => ({ path: clash.path, added: 0, deleted: 0, conflict: true })),
      ],
    }
  const [phase, setPhase] = useState<ApplyPhase>({ kind: 'idle' })
  const [restorePoint, setRestorePoint] = useState<string | undefined>(undefined)

  const accept = async (choices: Readonly<Record<string, ConflictChoice>> = {}, known: readonly ReviewFileConflictView[] = clashes): Promise<void> => {
    setPhase({ kind: 'applying' })
    try {
      // Answers go back to the host as `conflicts[]` with the versions it showed; with none known yet it is a plain apply.
      const resolved = known.length === 0 ? null : resolveReviewConflicts(known, choices)
      const result = sample
        ? reviewDevAccept(sampleAccepts.current++)
        : await unwrapRemote(await review.acceptReview({
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
          ticketId,
          mode: 'ff',
          ...(resolved === null ? {} : { conflicts: resolved }),
        }))
      const reported = reviewConflictsFromAccept(result)
      if (reported.length > 0) {
        setClashes(reported)
        // The person already answered every one of these: send it straight back instead of asking twice.
        if (resolveReviewConflicts(reported, choices) !== null && resolved === null) {
          await accept(choices, reported)
          return
        }
        setBlocked(null)
        setPhase({ kind: 'idle' })
        return
      }
      const conflict = reviewBlockedFromAccept(result)
      if (conflict !== null) {
        setBlocked(conflict)
        setPhase({ kind: 'idle' })
        onMutate()
        return
      }
      onAccepted?.(ticketId)
      const restorePointId = (result as { readonly restorePointId?: unknown }).restorePointId
      const keptWay = typeof restorePointId === 'string' ? restorePointId : undefined
      onApplied?.({ ticketId, ...(keptWay === undefined ? {} : { restorePointId: keptWay }) })
      onMutate()
      // The review does not just vanish: the person sees what happened (and can undo it) before leaving.
      setRestorePoint(keptWay)
      setPhase({ kind: 'done', undoable: keptWay !== undefined, count: summary?.files.length ?? loaded?.files.length ?? 0 })
    } catch (error) {
      // Never a silent failure: the sentence is plain, the host's own words stay folded for support.
      setPhase({ kind: 'failed', detail: error instanceof Error ? error.message : String(error) })
    }
  }

  const requestChanges = async (feedback: string): Promise<void> => {
    setPhase({ kind: 'applying' })
    try {
      if (sample) { onClose(); return }
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
      if (sample) { onClose(); return }
      await unwrapRemote(await review.discardReview({
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        ticketId,
        command: 'dismiss',
        reason: 'Rascunho descartado na revisão',
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
        <div className={styles.sheetBody} data-testid="review-sheet-body">
          <ReviewDeliveryPanel
            taskTitle=""
            personaName={personaName}
            summary={summary}
            blocked={blocked}
            phase={phase}
            example={sample}
            personaAvatarSrc={personaPortraitSrc(undefined, personaName ?? '')}
            onUndoApplied={restorePoint === undefined || onUndoApplied === undefined ? undefined : () => { onUndoApplied(restorePoint); onClose() }}
            onLeave={onClose}
            initialState={
              state.status === 'loading' ? 'loading'
                : state.status === 'error' ? 'empty'
                  : summary === null ? 'empty' : 'ready'
            }
            onAccept={(choices) => { void accept(choices) }}
            onRetry={() => { void accept() }}
            onRequestChanges={(feedback) => { void requestChanges(feedback) }}
            onDiscard={() => { void discard() }}
            {...(reviewedBy === undefined ? {} : { reviewedBy })}
          />
        </div>
      </div>
    </div>
  )
}
