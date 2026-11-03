import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { poseUrl } from '../assets/asset-url.ts'
import { usePersonaMotion } from '../motion/index.ts'
import { Button, Card, Chip, EmptyState, Squiggle, UiIcon } from '../primitives/index.ts'
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
}

/** Visão geral — "o que precisa de você" first, then what the team is doing now (RCD: never a blank dashboard). */
export function OverviewView({ t, attentionItems, nowRows, awayEvents, userName, onNavigate }: OverviewViewProps): ReactNode {
  const motion = usePersonaMotion({ preset: 'base', fromOpacity: 0, fromTranslateY: 8 })
  const greeting = userName !== undefined && userName.trim().length > 0
    ? t('overview.greeting', { name: userName.trim().split(/\s+/u)[0] ?? userName })
    : t('overview.greetingFallback')
  const restingPose = poseUrl('atlas', 'disponivel')

  return (
    <div className={styles.view} data-persona-root="" ref={motion.ref} style={motion.style}>
      <header className={styles.header}>
        <div className={styles.headerTitles}>
          <p className={styles.eyebrow}>{t('overview.eyebrow')}</p>
          <h1 className={styles.title}>
            <span className={styles.titleInk}>
              {greeting}
              <Squiggle className={styles.squiggle} />
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
                illustration={restingPose}
                title={t('overview.attentionEmptyTitle')}
                body={t('overview.attentionEmptyBody')}
              />
            )}
          </Card>

          <AwayWhileOutPanel t={t} events={awayEvents} />

          <Card as="section" titleAs="h2" eyebrow={t('overview.suggestedTaskTitle')} title={t('overview.suggestedTaskBody')} tone="brand">
            <p className={styles.introLine}>{t('overview.teamIntroLine')}</p>
            <div className={styles.cardActions}>
              <Button
                variant="secondary"
                icon={<UiIcon name="arrowRight" size={18} strokeWidth={2.2} />}
                onClick={() => { onNavigate?.('channels') }}
              >
                {t('overview.suggestedTaskAction')}
              </Button>
              <Chip tone="neutral" icon={<UiIcon name="sparkle" size={14} strokeWidth={2} />}>{t('overview.teamIntroTitle')}</Chip>
            </div>
          </Card>
        </div>

        <aside className={styles.sideCol}>
          <OverviewNowStrip t={t} rows={nowRows} />
        </aside>
      </div>
    </div>
  )
}
