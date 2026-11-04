import type { ReactNode } from 'react'
import type { HostObservable, InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { PersonaLiveSnapshot } from '../remote/persona-live-store.ts'
import { ProjectsView } from './ProjectsView.tsx'

export interface ProjectsPanelInjected {
  hooks: { live: HostObservable<PersonaLiveSnapshot> }
  openProjectBoard(projectId: string): void
}

export type ProjectsPanelProps = PropsLocale<'persona.shell'> & InjectFace<ProjectsPanelInjected>

/** Lista projetos do workspace (Remote `listProjects`). */
export function ProjectsPanel({ t, useLive, openProjectBoard }: ProjectsPanelProps): ReactNode {
  const live = useLive(state => state)
  // Presentation in ProjectsView (Muse); data mapping here (Prism).
  return (
    <ProjectsView
      t={t}
      loading={!live.ready}
      error={live.error}
      projects={live.projects}
      onOpen={(projectId) => { openProjectBoard(projectId) }}
    />
  )
}
