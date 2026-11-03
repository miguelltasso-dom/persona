import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { PersonaButton, PersonaPanel, PersonaMuted } from '../primitives/index.ts'
import { usePersonaMotion } from '../motion/index.ts'
import styles from './OverviewView.module.css'

export interface OverviewViewProps extends PropsLocale<'persona.shell'> {
  readonly attentionItems: readonly string[]
}

/** Visão geral — "Precisa de você" first (RCD: retention / open loops). */
export function OverviewView({ t, attentionItems }: OverviewViewProps): ReactNode {
  const motion = usePersonaMotion({ preset: 'base', fromOpacity: 0, fromTranslateY: 8 })

  return (
    <div className={styles.view} ref={motion.ref} style={motion.style}>
      <section aria-labelledby="persona-attention-title">
        <h1 id="persona-attention-title" className={styles.sectionTitle}>
          {t('overview.attentionTitle')}
        </h1>
        {attentionItems.length === 0 ? (
          <PersonaPanel>
            <p className={styles.empty}>{t('overview.attentionEmpty')}</p>
          </PersonaPanel>
        ) : (
          <ul className={styles.attentionList}>
            {attentionItems.map(item => (
              <li key={item} className={styles.attentionItem}>
                <span className={styles.attentionIcon} aria-hidden="true" />
                <span>{item}</span>
                <PersonaButton variant="secondary">{t('overview.attentionTitle')}</PersonaButton>
              </li>
            ))}
          </ul>
        )}
      </section>
      <PersonaMuted>{t('sidebar.overview')}</PersonaMuted>
    </div>
  )
}
