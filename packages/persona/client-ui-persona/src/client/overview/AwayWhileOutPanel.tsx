import { useCallback, useState, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { ILLUSTRATIONS } from '../assets/generated-imports.ts'
import { Button, Card, PawBurst, Sparkle, UiIcon } from '../primitives/index.ts'
import type { AwaySummaryEvent } from '../team/persona-work-state.ts'
import styles from './AwayWhileOutPanel.module.css'

const SESSION_KEY = 'persona.proactivity.awaySummary.dismissed'

export interface AwayWhileOutPanelProps extends PropsLocale<'persona.shell'> {
  readonly events: readonly AwaySummaryEvent[]
  readonly onOpenTask?: ((taskId: string) => void) | undefined
}

/** Peak-end summary when the app opens (PROACTIVITY §7): a timeline of deliveries, dismissible per session. */
export function AwayWhileOutPanel({ t, events, onOpenTask }: AwayWhileOutPanelProps): ReactNode {
  const [visible, setVisible] = useState(() => {
    if (events.length === 0) return false
    try {
      return sessionStorage.getItem(SESSION_KEY) !== '1'
    } catch {
      return true
    }
  })

  const dismiss = useCallback((): void => {
    try {
      sessionStorage.setItem(SESSION_KEY, '1')
    } catch {
      /* sessionStorage unavailable */
    }
    setVisible(false)
  }, [])

  if (!visible) return null

  return (
    <Card
      as="section"
      titleAs="h2"
      aria-labelledby="persona-away-title"
      tone="accent"
      title={(
        <span id="persona-away-title" className={styles.title}>
          {t('overview.awayTitle')}
          <Sparkle size={18} />
        </span>
      )}
      actions={<Button variant="ghost" size="s" onClick={dismiss}>{t('overview.awayDismiss')}</Button>}
    >
      <span className={styles.burstAnchor} aria-hidden="true"><PawBurst /></span>
      <div className={styles.layout}>
        <div className={styles.content}>
          <p className={styles.lead}>{t('overview.awayLead')}</p>
          <ol className={styles.timeline}>
            {events.map((event, index) => (
              <li key={event.id} className={styles.item} style={{ animationDelay: `${index * 80}ms` }}>
                <span className={styles.dot} aria-hidden="true" />
                <p className={styles.body}>{event.body ?? (event.bodyKey !== undefined ? t(event.bodyKey) : '')}</p>
                <Button
                  size="s"
                  variant="secondary"
                  iconEnd={<UiIcon name="arrowRight" size={16} strokeWidth={2.2} />}
                  {...(event.taskId === undefined || onOpenTask === undefined
                    ? {}
                    : {
                      onClick: () => { onOpenTask(event.taskId as string) },
                      // Sem título real da tarefa o texto é neutro: nunca o id da tarefa na tela.
                      'aria-label': event.taskLabel === undefined
                        ? t('overview.awayOpenTaskPlain')
                        : t('overview.awayOpenTask', { task: event.taskLabel }),
                    })}
                >
                  {event.taskLabel
                    ?? (event.taskLabelKey !== undefined
                      ? t(event.taskLabelKey)
                      : (event.taskId !== undefined && onOpenTask !== undefined ? t('overview.awayViewTask') : t('overview.awayDismiss')))}
                </Button>
              </li>
            ))}
          </ol>
        </div>
        {ILLUSTRATIONS['away-entregas'] !== undefined && (
          <img className={styles.art} src={ILLUSTRATIONS['away-entregas']} alt="" aria-hidden="true" />
        )}
      </div>
    </Card>
  )
}
