import type { ReactNode } from 'react'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { Chip } from '../primitives/index.ts'
import styles from './ProjectWorkspaceScopeChip.module.css'

export interface ProjectWorkspaceScopeChipProps {
  readonly dict: LocaleDict
  readonly projectId: string | null | undefined
}

/** PB-5 hint when a data panel is scoped to the project opened from Quadros. */
export function ProjectWorkspaceScopeChip({ dict, projectId }: ProjectWorkspaceScopeChipProps): ReactNode {
  if (projectId === null || projectId === undefined || projectId.length === 0) return null
  const label = bindLocale(dict, 'scope.project', { project: projectId })
  return (
    <p className={styles.wrap}>
      <Chip tone="brand" size="s">{label}</Chip>
    </p>
  )
}
