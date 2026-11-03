import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { PersonaMuted } from '../primitives/index.ts'
import styles from './ProjectsPanel.module.css'

/** DMs — placeholder until stream picker lands; slot registered for navigation. */
export function DirectMessagesPanel({ t }: PropsLocale<'persona.shell'>): ReactNode {
  return (
    <div className={styles.panel}>
      <h1 className={styles.title}>{t('sidebar.directMessages')}</h1>
      <PersonaMuted>{t('dm.emptyHint')}</PersonaMuted>
    </div>
  )
}
