import type { ReactNode } from 'react'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { Chip } from '../primitives/index.ts'
import styles from './ProjectWorkspaceScopeChip.module.css'

export interface ProjectWorkspaceScopeChipProps {
  readonly dict: LocaleDict
  /** The NAME of the project of the moment (never its id). Null = nothing to say yet. */
  readonly projectName: string | null | undefined
}

/** Says which project a data panel (Arquivos, Canvas) shows: the tabs of the Projetos place are of the project of the moment (DESIGN-01 #10). */
export function ProjectWorkspaceScopeChip({ dict, projectName }: ProjectWorkspaceScopeChipProps): ReactNode {
  if (projectName === null || projectName === undefined || projectName.length === 0) return null
  const label = bindLocale(dict, 'scope.project', { project: projectName })
  return (
    <p className={styles.wrap}>
      <Chip tone="brand" size="s">{label}</Chip>
    </p>
  )
}
