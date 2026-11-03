import { useCallback, useState, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { PersonaButton } from '../primitives/index.ts'
import { usePersonaMotion } from '../motion/index.ts'
import type { AwaySummaryEvent } from '../team/persona-work-state.ts'
import styles from './AwayWhileOutPanel.module.css'

const SESSION_KEY = 'persona.proactivity.awaySummary.dismissed'

export interface AwayWhileOutPanelProps extends PropsLocale<'persona.shell'> {
  readonly events: readonly AwaySummaryEvent[]
}

/** Peak-end resumo ao abrir o app (PROACTIVITY §7). */
export function AwayWhileOutPanel({ t, events }: AwayWhileOutPanelProps): ReactNode {
  const [visible, setVisible] = useState(() => {
    if (events.length === 0) return false
    try {
      return sessionStorage.getItem(SESSION_KEY) !== '1'
    } catch {
      return true
    }
  })
  const motion = usePersonaMotion({ preset: 'base', fromOpacity: 0, fromTranslateY: 12 })

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
    <section
      className={styles.panel}
      aria-labelledby="persona-away-title"
      ref={motion.ref}
      style={motion.style}
    >
      <div className={styles.header}>
        <h2 id="persona-away-title" className={styles.title}>
          {t('overview.awayTitle')}
        </h2>
        <button type="button" className={styles.dismiss} onClick={dismiss}>
          {t('overview.awayDismiss')}
        </button>
      </div>
      <p className={styles.lead}>{t('overview.awayLead')}</p>
      <ul className={styles.list}>
        {events.map((event, index) => (
          <li
            key={event.id}
            className={styles.item}
            style={{ animationDelay: `${index * 80}ms` }}
          >
            <p className={styles.body}>{event.body ?? (event.bodyKey !== undefined ? t(event.bodyKey) : '')}</p>
            <PersonaButton variant="secondary">
              {event.taskLabel ?? (event.taskLabelKey !== undefined ? t(event.taskLabelKey) : t('overview.awayDismiss'))}
            </PersonaButton>
          </li>
        ))}
      </ul>
    </section>
  )
}
