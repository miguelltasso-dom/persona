import { useId, useRef, useState, type ReactNode } from 'react'
import { personaPortraitSrc } from '../approvals/approvals-ui-helpers.ts'
import { Avatar, Button, Card, CategoryBar, Chip, FlowIcon, IconButton, UiIcon } from '../primitives/index.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { workStateOverlay } from '../team/persona-work-state.ts'
import { hubCategoryBarProps } from './board-locale.ts'
import { flowModelLabel } from './flow-models.ts'
import styles from './Boards.module.css'
import type { ProjectBoardSummary } from './types.ts'

export interface ProjectBoardCardProps {
  readonly dict: LocaleDict
  readonly summary: ProjectBoardSummary
  readonly onOpen: (projectId: string) => void
  /** "Criar a primeira tarefa" on an empty board. Without it the button opens the board. */
  readonly onCreateFirstTask?: ((projectId: string) => void) | undefined
}

/** Single project tile on the Quadros grid. */
export function ProjectBoardCard({ dict, summary, onOpen, onCreateFirstTask }: ProjectBoardCardProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const menuId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const workers = summary.activeWorkers.slice(0, 4)
  const extraWorkers = summary.activeWorkers.length - workers.length
  const names = workers.map(worker => worker.name).join(', ')
  const workingNowLabel = workers.length === 0
    ? undefined
    : t(summary.activeWorkers.length === 1 ? 'boards.workingNow.one' : 'boards.workingNow.many', {
      names: `${names}${extraWorkers > 0 ? ` +${extraWorkers}` : ''}`,
    })
  // Visible words for the bar ("3 de 8 prontas"): colour and length are never the only cue.
  const total = Object.values(summary.counts).reduce((sum, count) => sum + count, 0)
  const progressText = t(total === 1 ? 'boards.progress.one' : 'boards.progress', { done: summary.counts.done, total })

  return (
    <Card
      as="article"
      padding="m"
      interactive
      className={styles.projectCard}
      onClick={() => { onOpen(summary.id) }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen(summary.id)
        }
      }}
      tabIndex={0}
      aria-label={t('boards.openProject', { name: summary.name })}
    >
      <div className={styles.projectCardTop}>
        <span className={styles.flowSeal} aria-hidden="true">
          <FlowIcon model={summary.flowModel} size={40} />
        </span>
        <h2 className={styles.projectName}>{summary.name}</h2>
        <div
          className={styles.cardMenuWrap}
          onClick={(event) => { event.stopPropagation() }}
          onKeyDown={(event) => { event.stopPropagation() }}
        >
          <IconButton
            ref={triggerRef}
            size="s"
            label={t('boards.projectMenu')}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-controls={menuOpen ? menuId : undefined}
            icon={<UiIcon name="more" size={18} />}
            onClick={() => { setMenuOpen(open => !open) }}
          />
          {menuOpen && (
            <div id={menuId} role="menu" className={styles.cardMenu}>
              <button type="button" role="menuitem" className={styles.cardMenuItem} onClick={() => { setMenuOpen(false); onOpen(summary.id) }}>
                {t('boards.menu.open')}
              </button>
              <button type="button" role="menuitem" className={styles.cardMenuItem} onClick={() => { setMenuOpen(false) }}>
                {t('boards.menu.editFlow')}
              </button>
              <button type="button" role="menuitem" className={styles.cardMenuItem} onClick={() => { setMenuOpen(false) }}>
                {t('boards.menu.settings')}
              </button>
            </div>
          )}
        </div>
      </div>
      <div className={styles.projectChips}>
        <Chip tone="neutral" size="s">{flowModelLabel(dict, summary.flowModel)}</Chip>
        {summary.sprintLabel !== undefined && (
          <Chip tone="brand" size="s">{summary.sprintLabel}</Chip>
        )}
      </div>
      {total === 0 ? (
        <div
          className={styles.emptyBoard}
          onClick={(event) => { event.stopPropagation() }}
          onKeyDown={(event) => { event.stopPropagation() }}
        >
          <p className={styles.emptyBoardText}>{t('boards.emptyBoard')}</p>
          <Button
            variant="secondary"
            size="s"
            icon={<UiIcon name="plus" size={16} strokeWidth={2.2} />}
            onClick={() => { (onCreateFirstTask ?? onOpen)(summary.id) }}
          >
            {t('boards.createFirstTask')}
          </Button>
        </div>
      ) : (
        <div className={styles.progressBlock}>
          <p className={styles.progressText}>{progressText}</p>
          <CategoryBar {...hubCategoryBarProps(dict, summary.counts)} progress={{ done: summary.counts.done, total, text: progressText }} />
        </div>
      )}
      <div className={styles.projectFooter}>
        {workingNowLabel !== undefined && (
          <div className={styles.workingNow}>
            <span className={styles.workerStack} aria-hidden="true">
              {workers.map((worker, index) => {
                const portrait = worker.avatarSrc ?? personaPortraitSrc(undefined, worker.name)
                return (
                  <span key={worker.name} className={styles.workerAvatar} style={{ zIndex: workers.length - index }}>
                    <Avatar name={worker.name} size={24} shape="portrait" decorative {...(portrait === undefined ? {} : { src: portrait })} />
                    <span className={styles.workerBadge} data-overlay={workStateOverlay(worker.state)} />
                  </span>
                )
              })}
            </span>
            <span className={styles.workingNowText}>{workingNowLabel}</span>
          </div>
        )}
        {summary.needsYouCount > 0 && (
          <Chip tone="accent" size="s">
            {t('boards.needsYouChip', { count: summary.needsYouCount })}
          </Chip>
        )}
      </div>
    </Card>
  )
}
