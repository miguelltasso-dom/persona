/**
 * Revisar mudanças for tasks in Em revisão (ReviewDelivery contract). SW-8: the screen speaks in folders, drafts and
 * before/after — the host's patch is read into plain files (`draftFilesFromReviewSummary`) and never shown as such.
 */
import { useMemo, type ReactNode } from 'react'
import { ILLUSTRATIONS } from '../assets/generated-imports.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { EmptyState } from '../primitives/index.ts'
import { PersonaSurfaceEmpty } from '../kanban/PersonaSurface.tsx'
import type { ReviewBlockedUi, ReviewSummaryUi } from './mock-data.ts'
import { pt as defaultDict } from '../locale/review/locales.ts'
import { DraftReviewPanel } from './simple/DraftReviewPanel.tsx'
import { draftFilesFromReviewSummary } from './simple/patch-to-changes.ts'
import type { ApplyPhase, ConflictChoice } from './simple/draft-types.ts'

export type ReviewDeliverySurfaceState = 'loading' | 'empty' | 'ready'

export interface ReviewDeliveryPanelProps {
  readonly dict?: LocaleDict
  readonly taskTitle?: string
  /** Who made the draft; "A persona" when unknown. */
  readonly personaName?: string | undefined
  readonly summary?: ReviewSummaryUi | null
  readonly blocked?: ReviewBlockedUi | null
  readonly phase?: ApplyPhase
  readonly initialState?: ReviewDeliverySurfaceState
  readonly onAccept?: (choices: Readonly<Record<string, ConflictChoice>>) => void
  readonly onRequestChanges?: (feedback: string) => void
  readonly onDiscard?: () => void
  readonly onRetry?: () => void
  readonly personaAvatarSrc?: string | undefined
  readonly example?: boolean | undefined
  readonly onUndoApplied?: (() => void) | undefined
  readonly onLeave?: (() => void) | undefined
  readonly onOpenDraftFile?: (fileId: string) => void
}

/** One question per card; the amber primary is "Aplicar na pasta" only. */
export function ReviewDeliveryPanel({
  dict = defaultDict,
  taskTitle = '',
  personaName,
  summary = null,
  blocked = null,
  phase,
  initialState = 'ready',
  onAccept,
  onRequestChanges,
  onDiscard,
  onRetry,
  onOpenDraftFile,
  personaAvatarSrc,
  example,
  onUndoApplied,
  onLeave,
}: ReviewDeliveryPanelProps): ReactNode {
  const files = useMemo(() => (summary === null ? [] : draftFilesFromReviewSummary(summary)), [summary])

  if (initialState === 'loading') {
    // "Preparando as mudanças…": the persona at the squared paper (Muse SW-7 art), announced as busy.
    return (
      <div role="status" aria-busy="true" aria-live="polite">
        <EmptyState illustration={ILLUSTRATIONS['rascunho-trabalhando']} artSize={240} title={bindLocale(dict, 'loading')} />
      </div>
    )
  }
  if (initialState === 'empty' || summary === null) {
    return (
      <PersonaSurfaceEmpty
        dict={dict}
        illustrationKey="empty-inbox"
        titleKey="empty.title"
        hintKey="empty.hint"
      />
    )
  }

  return (
    <DraftReviewPanel
      dict={dict}
      taskTitle={taskTitle}
      personaName={personaName}
      files={files}
      secretsRedacted={summary.secretsRedacted}
      testsClaimed={summary.testsClaimed}
      blocked={blocked !== null}
      blockedDetail={blocked?.explanation}
      {...(phase === undefined ? {} : { phase })}
      {...(onAccept === undefined ? {} : { onApply: onAccept })}
      {...(onRequestChanges === undefined ? {} : { onRequestChanges })}
      {...(onDiscard === undefined ? {} : { onDiscard })}
      {...(onRetry === undefined ? {} : { onRetry })}
      {...(onOpenDraftFile === undefined ? {} : { onOpenDraftFile })}
      {...(personaAvatarSrc === undefined ? {} : { personaAvatarSrc })}
      {...(example === true ? { example } : {})}
      {...(onUndoApplied === undefined ? {} : { onUndoApplied })}
      {...(onLeave === undefined ? {} : { onLeave })}
    />
  )
}
