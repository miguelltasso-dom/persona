import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { PersonaButton, PersonaPanel, PersonaMuted } from '../primitives/index.ts'
import { usePersonaMotion } from '../motion/index.ts'
import type { AwaySummaryEvent, PersonaNowSnapshot } from '../team/persona-work-state.ts'
import { AwayWhileOutPanel } from './AwayWhileOutPanel.tsx'
import { OverviewNowStrip } from './OverviewNowStrip.tsx'
import styles from './OverviewView.module.css'

export interface OverviewViewProps extends PropsLocale<'persona.shell'> {
  readonly attentionItems: readonly string[]
  readonly nowRows: readonly PersonaNowSnapshot[]
  readonly awayEvents: readonly AwaySummaryEvent[]
}

/** Visão geral — proatividade visível (Agora + while away + atenção). */
export function OverviewView({ t, attentionItems, nowRows, awayEvents }: OverviewViewProps): ReactNode {
  const motion = usePersonaMotion({ preset: 'base', fromOpacity: 0, fromTranslateY: 8 })

  return (
    <div className={styles.view} ref={motion.ref} style={motion.style}>
      <AwayWhileOutPanel t={t} events={awayEvents} />
      <OverviewNowStrip t={t} rows={nowRows} />
      <section className={styles.intro} aria-labelledby="persona-team-intro-title">
        <h2 id="persona-team-intro-title" className={styles.sectionTitle}>
          {t('overview.teamIntroTitle')}
        </h2>
        <PersonaPanel>
          <p className={styles.introLine}>{t('overview.teamIntroLine')}</p>
        </PersonaPanel>
      </section>
      <section aria-labelledby="persona-suggested-task-title">
        <h2 id="persona-suggested-task-title" className={styles.sectionTitle}>
          {t('overview.suggestedTaskTitle')}
        </h2>
        <PersonaPanel>
          <p className={styles.taskBody}>{t('overview.suggestedTaskBody')}</p>
          <PersonaButton>{t('overview.suggestedTaskAction')}</PersonaButton>
        </PersonaPanel>
      </section>
      {attentionItems.length > 0 && (
        <section aria-labelledby="persona-attention-title">
          <h2 id="persona-attention-title" className={styles.sectionTitle}>
            {t('overview.attentionTitle')}
          </h2>
          <ul className={styles.attentionList}>
            {attentionItems.map(item => (
              <li key={item} className={styles.attentionItem}>
                <span className={styles.attentionIcon} aria-hidden="true" />
                <span className={styles.attentionText}>{item}</span>
                <PersonaButton variant="secondary">{t('overview.attentionAction')}</PersonaButton>
              </li>
            ))}
          </ul>
        </section>
      )}
      {attentionItems.length === 0 && (
        <PersonaMuted>{t('overview.attentionEmpty')}</PersonaMuted>
      )}
    </div>
  )
}
