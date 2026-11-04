/** PB-5 — project sub-nav (Quadro · Conversa · …); shell-owned chrome. */

import type { ReactNode } from 'react'
import { Tabs } from '../primitives/index.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'

export type ProjectWorkspaceTab = 'board' | 'conversation' | 'files' | 'routines' | 'sprints'

const TAB_ORDER: readonly ProjectWorkspaceTab[] = [
  'board',
  'conversation',
  'files',
  'routines',
  'sprints',
]

export interface ProjectWorkspaceTabsProps {
  readonly dict: LocaleDict
  readonly value: ProjectWorkspaceTab
  readonly onChange: (tab: ProjectWorkspaceTab) => void
}

/** Segmented tabs for a single project workspace (board tab stays on quadro view). */
export function ProjectWorkspaceTabs({ dict, value, onChange }: ProjectWorkspaceTabsProps): ReactNode {
  const t = (key: string) => bindLocale(dict, key)
  return (
    <Tabs
      label={t('project.tabs.label')}
      idPrefix="project-workspace"
      value={value}
      onChange={(id) => { onChange(id as ProjectWorkspaceTab) }}
      items={TAB_ORDER.map(id => ({
        id,
        label: t(`project.tabs.${id}`),
      }))}
    />
  )
}
