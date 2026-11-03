import type { ReactNode } from 'react'
import type { HostObservable, InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { PersonaLiveSnapshot } from '../remote/persona-live-store.ts'
import styles from './ProjectsPanel.module.css'

export interface ProjectsPanelInjected {
  hooks: { live: HostObservable<PersonaLiveSnapshot> }
}

export type ProjectsPanelProps = PropsLocale<'persona.shell'> & InjectFace<ProjectsPanelInjected>

/** Lista projetos do workspace (Remote `listProjects`). */
export function ProjectsPanel({ t, useLive }: ProjectsPanelProps): ReactNode {
  const live = useLive(state => state)

  return (
    <div className={styles.panel}>
      <h1 className={styles.title}>{t('sidebar.projects')}</h1>
      {!live.ready && <p className={styles.muted}>{t('overview.hostPending')}</p>}
      {live.error !== null && <p className={styles.error} role="alert">{live.error}</p>}
      <ul className={styles.list}>
        {live.projects.map(project => (
          <li key={project.id} className={styles.item}>
            <span className={styles.name}>{project.name}</span>
            <span className={styles.kind}>{project.kind}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
