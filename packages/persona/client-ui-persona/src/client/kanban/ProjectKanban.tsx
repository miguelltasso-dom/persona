/** C6a — Kanban por projeto (projeção dos estágios de Ticket). */

import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { Screen, ScreenHeader } from '../primitives/index.ts'
import { usePersonaMotion } from '../theme/usePersonaMotion.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { KanbanBoard } from './KanbanBoard.tsx'
import styles from './Kanban.module.css'
import { MOCK_PROJECT_KANBAN_CARDS } from './mock-data.ts'
import { pt as defaultDict } from '../locale/kanban/locales.ts'
import type { KanbanCardModel, KanbanColumnId, KanbanSurfaceState } from './types.ts'

export interface ProjectKanbanProps {
  readonly dict?: LocaleDict
  readonly projectName?: string
  readonly initialCards?: readonly KanbanCardModel[]
  readonly initialState?: KanbanSurfaceState
}

function columnLabelsFromDict(dict: LocaleDict): Record<KanbanColumnId, string> {
  const t = (key: string) => bindLocale(dict, key)
  return {
    todo: t('column.todo'),
    in_progress: t('column.inProgress'),
    in_review: t('column.inReview'),
    blocked: t('column.blocked'),
    done: t('column.done'),
  }
}

/** Project-scoped board with local drag until host RPC exists. */
export function ProjectKanban({
  dict = defaultDict,
  projectName = 'Site da agência',
  initialCards = MOCK_PROJECT_KANBAN_CARDS,
  initialState = 'ready',
}: ProjectKanbanProps): ReactNode {
  const t = (key: string) => bindLocale(dict, key)
  const motion = usePersonaMotion({ preset: 'fast', fromOpacity: 0, fromTranslateY: 8 })
  const [surfaceState, setSurfaceState] = useState<KanbanSurfaceState>(initialState)
  const [cards, setCards] = useState<readonly KanbanCardModel[]>(() =>
    initialCards.filter(c => c.projectName === projectName || c.projectId === 'proj-site'))

  const labels = useMemo(() => columnLabelsFromDict(dict), [dict])

  const onMoveCard = useCallback((cardId: string, toColumn: KanbanColumnId) => {
    setCards(prev => prev.map((card) => {
      if (card.id !== cardId) return card
      const reviewApproved = toColumn === 'done' ? card.column === 'in_review' || card.reviewApproved : card.reviewApproved
      const { carry: _dropCarry, ...rest } = card
      return {
        ...rest,
        column: toColumn,
        reviewApproved,
        blocked: toColumn === 'blocked',
        waitingEvent: toColumn === 'in_progress' ? card.waitingEvent : false,
      }
    }))
  }, [])

  return (
    <Screen width="full" className={styles.boardShell} data-persona-kanban="project">
      <div className={styles.motionWrap} ref={motion.ref} style={motion.style}>
        <ScreenHeader
          icon="kanban"
          eyebrow={t('header.eyebrow')}
          title={t('title.project')}
          subtitle={`${t('subtitle.project')} · ${projectName}`}
        />
        <KanbanBoard
          dict={dict}
          cards={cards}
          surfaceState={surfaceState}
          showProjectOnCard={false}
          columnLabels={labels}
          onMoveCard={onMoveCard}
          onRetry={() => { setSurfaceState('ready') }}
          onEmptyPrimary={() => { setSurfaceState('ready') }}
        />
      </div>
    </Screen>
  )
}
