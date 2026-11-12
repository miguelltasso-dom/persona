/** C7a — Arquivos do projeto (preview até Remote Anvil). */

import { useEffect, useState, type ReactNode } from 'react'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { Button, Card, Chip, Screen, ScreenHeader, Skeleton } from '../primitives/index.ts'
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
  readonly onRemoteRetry?: () => void
  /** The NAME of the project of the moment (Projetos place tabs): the screen says which project it shows. */
  readonly scopeProjectName?: string | null
  readonly onEmptyPrimary?: (() => void) | undefined
  /** Row actions. A missing one means no button (the host has no way to open or download a file yet). */
  readonly onOpenFile?: ((fileId: string) => void) | undefined
  readonly onDownloadFile?: ((fileId: string) => void) | undefined
}

/** File list with open/download actions (host-backed). */
export function FilesView({
  dict = defaultDict,
  files = [],
  initialState = 'ready',
  onChooseProjectRoot,
  onRemoteRetry,
  scopeProjectName = null,
  onEmptyPrimary,
  onOpenFile,
  onDownloadFile,
}: FilesViewProps): ReactNode {
  const t = (key: string) => bindLocale(dict, key)
  const [surfaceState, setSurfaceState] = useState(initialState)

  useEffect(() => {
    setSurfaceState(initialState)
  }, [initialState])

  // The tabs of the Projetos place are of the project of the moment: the eyebrow says which one, by NAME ("Trabalho · Site / produto").
  const eyebrow = scopeProjectName === null || scopeProjectName.length === 0
    ? t('header.eyebrow')
    : bindLocale(dict, 'header.eyebrowProject', { project: scopeProjectName })
  const header = (
    <ScreenHeader
      icon="arquivos"
      eyebrow={eyebrow}
      title={t('title')}
      subtitle={t('subtitle')}
    />
  )

  if (surfaceState === 'loading') {
    return (
      <Screen className={styles.shell} data-persona-surface="files" role="status" aria-busy="true">
        {header}
        <Card padding="l">
          <Skeleton height={14} width="30%" />
          <Skeleton height={48} shape="block" />
          <Skeleton height={48} shape="block" />
        </Card>
      </Screen>
    )
  }

  if (surfaceState === 'error') {
    return (
      <Screen className={styles.shell} data-persona-surface="files">
        {header}
        <PersonaSurfaceError
          dict={dict}
          titleKey="error.title"
          retryKey="error.retry"
          onRetry={() => { onRemoteRetry?.() }}
        />
      </Screen>
    )
  }

  if (surfaceState === 'needRoot') {
    return (
      <Screen className={styles.shell} data-persona-surface="files">
        {header}
        <div className={styles.emptyBlock}>
          <PersonaSurfaceEmpty
            dict={dict}
            illustrationKey="empty-inbox"
            titleKey="needRoot.title"
            hintKey="needRoot.hint"
            primaryKey="needRoot.action"
            {...(onChooseProjectRoot !== undefined ? { onPrimary: onChooseProjectRoot } : {})}
          />
        </div>
      </Screen>
    )
  }

  if (surfaceState === 'empty') {
    return (
      <Screen className={styles.shell} data-persona-surface="files">
        {header}
        <div className={styles.emptyBlock}>
          <PersonaSurfaceEmpty
            dict={dict}
            illustrationKey="empty-inbox"
            titleKey="empty.title"
            hintKey="empty.hint"
            primaryKey="empty.action"
            {...(onEmptyPrimary === undefined ? {} : { onPrimary: onEmptyPrimary })}
          />
        </div>
      </Screen>
    )
  }

  return (
    <Screen className={styles.shell} data-persona-surface="files">
      {header}
      {files.length > 0 && (
        <div className={styles.breadcrumb}>
          <Chip tone="neutral" size="s">{files[0]?.projectName ?? t('column.project')}</Chip>
        </div>
      )}
      <Card padding="none" className={styles.tableCard}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">{t('column.name')}</th>
              <th scope="col">{t('column.project')}</th>
              <th scope="col">{t('column.updated')}</th>
              <th scope="col">{t('column.size')}</th>
              {(onOpenFile !== undefined || onDownloadFile !== undefined) && (
                <th scope="col"><span className={styles.srOnly}>{t('column.actions')}</span></th>
              )}
            </tr>
          </thead>
          <tbody>
            {files.map(file => (
              <tr key={file.id}>
                <td>{file.name}</td>
                <td>{file.projectName}</td>
                <td>{file.updatedAt}</td>
                <td>{file.sizeLabel}</td>
                {(onOpenFile !== undefined || onDownloadFile !== undefined) && (
                  <td>
                    <div className={styles.rowActions}>
                      {onOpenFile !== undefined && (
                        <Button variant="ghost" size="s" onClick={() => { onOpenFile(file.id) }}>{t('action.open')}</Button>
                      )}
                      {onDownloadFile !== undefined && (
                        <Button variant="ghost" size="s" onClick={() => { onDownloadFile(file.id) }}>{t('action.download')}</Button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </Screen>
  )
}
