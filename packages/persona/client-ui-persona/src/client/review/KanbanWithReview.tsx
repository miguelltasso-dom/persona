import { useState, type ReactNode } from 'react'
import type { ProjectScopeRequest } from '@deepseek-ai/dsh-persona-host/types'
import type { PersonaRemoteClient } from '../data/lumen-inject.ts'
import { GlobalKanban, type GlobalKanbanProps } from '../kanban/GlobalKanban.tsx'
import { KanbanReviewSheet } from './KanbanReviewSheet.tsx'

export interface KanbanWithReviewProps extends Omit<GlobalKanbanProps, 'onOpenReview'> {
  readonly persona: PersonaRemoteClient
  readonly scope: ProjectScopeRequest | null
  readonly onMutate: () => void
}

/** Global kanban plus Revisar overlay wired to host review RPCs. */
export function KanbanWithReview({
  persona,
  scope,
  onMutate,
  ...kanbanProps
}: KanbanWithReviewProps): ReactNode {
  const [reviewTarget, setReviewTarget] = useState<{ id: string; title: string } | null>(null)

  return (
    <>
      <GlobalKanban
        {...kanbanProps}
        onOpenReview={(card) => { setReviewTarget({ id: card.id, title: card.title }) }}
      />
      {reviewTarget !== null && scope !== null && (
        <KanbanReviewSheet
          persona={persona}
          scope={scope}
          ticketId={reviewTarget.id}
          taskTitle={reviewTarget.title}
          onClose={() => { setReviewTarget(null) }}
          onMutate={onMutate}
        />
      )}
    </>
  )
}
