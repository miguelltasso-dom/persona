/** C7a — Arquivos do projeto (preview até Remote Anvil). */

import { useState, type ReactNode } from 'react'
import { usePersonaMotion } from '../theme/usePersonaMotion.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { PersonaSurfaceEmpty, PersonaSurfaceError } from '../kanban/PersonaSurface.tsx'
import styles from './Files.module.css'
import type { FileEntry } from './mock-data.ts'
import { pt as defaultDict } from '../locale/files/locales.ts'

export type FilesSurfaceState = 'loading' | 'error' | 'empty' | 'ready' | 'needRoot'

export interface FilesViewProps {
  readonly dict?: LocaleDict
  readonly files?: readonly FileEntry[]
  readonly initialState?: FilesSurfaceState
  readonly onChooseProjectRoot?: () => void
}

/** File list with open/download actions (host-backed). */
export function FilesView({
  dict = defaultDict,
  files = [],
  initialState = 'ready',
  onChooseProjectRoot,
}: FilesViewProps): ReactNode {
  const t = (key: string) => bindLocale(dict, key)
  const motion = usePersonaMotion({ preset: 'base', fromOpacity: 0, fromTranslateY: 6 })
  const [surfaceState, setSurfaceState] = useState(initialState)

  if (surfaceState === 'loading') {
    return (
      <div className={styles.shell} role="status" aria-busy="true">
        <p>{t('loading')}</p>
        <div className={styles.skeletonRow} />
        <div className={styles.skeletonRow} />
      </div>
    )
  }

  if (surfaceState === 'error') {
    return (
      <PersonaSurfaceError
        dict={dict}
        titleKey="error.title"
        retryKey="error.retry"
        onRetry={() => { setSurfaceState('ready') }}
      />
    )
  }

  if (surfaceState === 'needRoot') {
    return (
      <PersonaSurfaceEmpty
        dict={dict}
        illustrationLabelKey="needRoot.illustration"
        titleKey="needRoot.title"
        hintKey="needRoot.hint"
        primaryKey="needRoot.action"
        {...(onChooseProjectRoot !== undefined ? { onPrimary: onChooseProjectRoot } : {})}
      />
    )
  }

  if (surfaceState === 'empty') {
    return (
      <PersonaSurfaceEmpty
        dict={dict}
        illustrationLabelKey="empty.illustration"
        titleKey="empty.title"
        hintKey="empty.hint"
        primaryKey="empty.action"
      />
    )
  }

  return (
    <div className={styles.shell} ref={motion.ref} style={motion.style}>
      <header>
        <h1 className={styles.title}>{t('title')}</h1>
        <p className={styles.subtitle}>{t('subtitle')}</p>
      </header>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">{t('column.name')}</th>
            <th scope="col">{t('column.project')}</th>
            <th scope="col">{t('column.updated')}</th>
            <th scope="col">{t('column.size')}</th>
            <th scope="col"><span className={styles.srOnly}>{t('column.actions')}</span></th>
          </tr>
        </thead>
        <tbody>
          {files.map(file => (
            <tr key={file.id}>
              <td>{file.name}</td>
              <td>{file.projectName}</td>
              <td>{file.updatedAt}</td>
              <td>{file.sizeLabel}</td>
              <td>
                <div className={styles.rowActions}>
                  <button type="button" className={styles.linkBtn}>{t('action.open')}</button>
                  <button type="button" className={styles.linkBtn}>{t('action.download')}</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
