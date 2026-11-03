import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { ILLUSTRATIONS } from '../assets/generated-imports.ts'
import { usePersonaMotion } from '../motion/index.ts'
import { Accent, Button, Card, EmptyState, UiIcon } from '../primitives/index.ts'
import type { AwaySummaryEvent, PersonaNowSnapshot } from '../team/persona-work-state.ts'
import { AwayWhileOutPanel } from './AwayWhileOutPanel.tsx'
import { OverviewNowStrip } from './OverviewNowStrip.tsx'
import styles from './OverviewView.module.css'

export interface OverviewViewProps extends PropsLocale<'persona.shell'> {
  readonly attentionItems: readonly string[]
  readonly nowRows: readonly PersonaNowSnapshot[]
  readonly awayEvents: readonly AwaySummaryEvent[]
  /** User display name for the greeting (falls back to a plain "Olá!"). */
  readonly userName?: string | undefined
  /** Navigate to another main panel (shell). */
  readonly onNavigate?: ((panel: 'channels' | 'kanban' | 'approvals') => void) | undefined
  /** Live first task (C8); falls back to locale copy when absent. */
  readonly suggestedTask?: { readonly id: string; readonly title: string } | undefined
}

const PLACEHOLDER_NAMES: ReadonlySet<string> = new Set(['você', 'voce', 'owner', 'you'])

/** Visão geral — "o que precisa de você" first, then what the team is doing now (RCD: never a blank dashboard). */
export function OverviewView({
  t, attentionItems, nowRows, awayEvents, userName, onNavigate, suggestedTask,
}: OverviewViewProps): ReactNode {
  const motion = usePersonaMotion({ preset: 'base', fromOpacity: 0, fromTranslateY: 8 })
  const teamHasActiveTask = nowRows.some(row => row.currentTask !== undefined && row.currentTask.length > 0)
  const showFirstTask = attentionItems.length === 0 && !teamHasActiveTask
  const firstTaskTitle = suggestedTask?.title ?? t('overview.suggestedTaskBody')
  // Placeholder member names ("Você", "Owner") are not names: greet without one.
  const firstName = userName?.trim().split(/\s+/u)[0] ?? ''
  const greeting = firstName.length > 0 && !PLACEHOLDER_NAMES.has(firstName.toLowerCase())
    ? t('overview.greeting', { name: firstName })
    : t('overview.greetingFallback')

  return (
    <div className={styles.view} data-persona-root="" ref={motion.ref} style={motion.style}>
      <header className={styles.header}>
        <div className={styles.headerTitles}>
          <p className={styles.eyebrow}>{t('overview.eyebrow')}</p>
          <h1 className={styles.title}>
            <span className={styles.titleInk}>
              {greeting}
              <Accent name="squiggle-2" width={220} height={16} className={styles.squiggle} />
            </span>
          </h1>
          <p className={styles.subtitle}>{t('overview.subtitle')}</p>
        </div>
        <Button variant="primary" size="l" icon={<UiIcon name="plus" size={20} strokeWidth={2.2} />} onClick={() => { onNavigate?.('channels') }}>
          {t('overview.newTask')}
        </Button>
      </header>

      <div className={styles.grid}>
        <div className={styles.mainCol}>
          <Card
            as="section"
            titleAs="h2"
            aria-labelledby="persona-attention-title"
            eyebrow={attentionItems.length > 0 ? t('overview.attentionCount', { count: String(attentionItems.length) }) : undefined}
            title={<span id="persona-attention-title">{t('overview.attentionTitle')}</span>}
            className={styles.attentionCard}
          >
            {attentionItems.length > 0 ? (
              <ul className={styles.attentionList}>
                {attentionItems.map(item => (
                  <li key={item} className={styles.attentionItem}>
                    <span className={styles.attentionIcon} aria-hidden="true">
                      <UiIcon name="clock" size={18} strokeWidth={2} />
                    </span>
                    <span className={styles.attentionText}>{item}</span>
                    <Button size="s" variant="secondary" onClick={() => { onNavigate?.('approvals') }}>
                      {t('overview.attentionAction')}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                compact
                illustration={ILLUSTRATIONS['empty-inbox']}
                title={t('overview.attentionEmptyTitle')}
                body={t('overview.attentionEmptyBody')}
              />
            )}
          </Card>

          <AwayWhileOutPanel t={t} events={awayEvents} />

          {showFirstTask && (
            <Card
              as="section"
              titleAs="h2"
              eyebrow={t('overview.suggestedTaskTitle')}
              title={firstTaskTitle}
              tone="brand"
            >
              <p className={styles.introLine}>{t('overview.teamIntroLine')}</p>
              <div className={styles.cardActions}>
                <Button
                  variant="secondary"
                  icon={<UiIcon name="arrowRight" size={18} strokeWidth={2.2} />}
                  onClick={() => { onNavigate?.('channels') }}
                >
                  {t('overview.suggestedTaskAction')}
                </Button>
              </div>
            </Card>
          )}
        </div>

        <aside className={styles.sideCol}>
          <OverviewNowStrip t={t} rows={nowRows} />
        </aside>
      </div>
    </div>
  )
}
