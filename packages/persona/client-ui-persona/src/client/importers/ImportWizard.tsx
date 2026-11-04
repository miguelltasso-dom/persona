/** Importação avançada (exportação de outra ferramenta) pelo host: prévia → confirmar → desfazer. Sem host, sem botão. */
import { useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import type { ImportBatchView, ImportFileView, ImportPreviewView } from '@deepseek-ai/dsh-persona-host/types'
import { Button, Card, Notice, Screen, ScreenHeader, UiIcon } from '../primitives/index.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import styles from './ImportWizard.module.css'
import { PersonaSurfaceEmpty, PersonaSurfaceLoading } from '../kanban/PersonaSurface.tsx'
import { pt as defaultDict } from '../locale/importers/locales.ts'

export type ImportersSurfaceState = 'loading' | 'error' | 'empty' | 'ready'
type ImportStep = 'file' | 'map' | 'preview' | 'privacy' | 'confirm' | 'progress'

const STEP_ORDER: readonly ImportStep[] = ['file', 'map', 'preview', 'privacy', 'confirm', 'progress']

/** O que o host sabe fazer (`previewImport` / `confirmImport` / `rollbackImport`). */
export interface ImportWizardImporter {
  preview(files: readonly ImportFileView[]): Promise<ImportPreviewView>
  confirm(batchId: string, files: readonly ImportFileView[]): Promise<ImportBatchView>
  rollback(batchId: string): Promise<ImportBatchView>
}

export interface ImportWizardProps {
  readonly dict?: LocaleDict
  readonly initialState?: ImportersSurfaceState
  /** Sem `importer` (sem host) o assistente só explica: nenhum botão sem ação. */
  readonly importer?: ImportWizardImporter | undefined
}

function readText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => { resolve(typeof reader.result === 'string' ? reader.result : '') }
    reader.onerror = () => { reject(reader.error ?? new Error('read-failed')) }
    reader.readAsText(file)
  })
}

export function ImportWizard({ dict = defaultDict, initialState = 'ready', importer }: ImportWizardProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const [step, setStep] = useState<ImportStep>('file')
  const [files, setFiles] = useState<readonly ImportFileView[]>([])
  const [preview, setPreview] = useState<ImportPreviewView | null>(null)
  const [batch, setBatch] = useState<ImportBatchView | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<'preview' | 'confirm' | 'rollback' | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const header = (
    <ScreenHeader
      icon="arquivos"
      eyebrow={t('header.eyebrow')}
      title={t('title')}
      subtitle={t('subtitle')}
    />
  )

  if (initialState === 'loading') {
    return (
      <Screen className={styles.shell} data-persona-surface="importers">
        {header}
        <PersonaSurfaceLoading dict={dict} messageKey="loading" skeletonColumns={1} />
      </Screen>
    )
  }
  if (initialState === 'empty') {
    return (
      <Screen className={styles.shell} data-persona-surface="importers">
        {header}
        <PersonaSurfaceEmpty
          dict={dict}
          illustrationKey="empty-vault"
          titleKey="empty.title"
          hintKey="empty.hint"
          primaryKey="empty.action"
          onPrimary={() => { setStep('file') }}
        />
      </Screen>
    )
  }

  const stepIndex = STEP_ORDER.indexOf(step)
  const canAdvance = step === 'file' ? preview !== null : step === 'preview' ? (preview?.accepted ?? 0) > 0 : true

  const onPicked = (event: ChangeEvent<HTMLInputElement>): void => {
    const picked = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (importer === undefined || picked.length === 0) return
    setBusy(true)
    setError(null)
    void (async () => {
      try {
        const read: ImportFileView[] = []
        for (const file of picked) read.push({ name: file.name, text: await readText(file) })
        const result = await importer.preview(read)
        setFiles(read)
        setPreview(result)
        setStep('preview')
      } catch {
        setError('preview')
      } finally {
        setBusy(false)
      }
    })()
  }

  const confirm = (): void => {
    if (importer === undefined || preview === null) return
    setBusy(true)
    setError(null)
    setStep('progress')
    void importer.confirm(crypto.randomUUID(), files).then(
      (result) => { setBatch(result) },
      () => { setError('confirm') },
    ).finally(() => { setBusy(false) })
  }

  const rollback = (): void => {
    if (importer === undefined || batch === null) return
    setBusy(true)
    setError(null)
    void importer.rollback(batch.id).then(
      (result) => { setBatch(result) },
      () => { setError('rollback') },
    ).finally(() => { setBusy(false) })
  }

  return (
    <Screen className={styles.shell} data-persona-surface="importers">
      {header}
      <ol className={styles.stepper} aria-label={t('progressLabel')}>
        {STEP_ORDER.map((key, index) => {
          const number = index + 1
          const status = number < stepIndex + 1 ? 'done' : number === stepIndex + 1 ? 'current' : 'todo'
          return (
            <li key={key} className={styles.stepItem} data-status={status} aria-current={status === 'current' ? 'step' : undefined}>
              <span className={styles.stepDot} aria-hidden="true">
                {status === 'done' ? <UiIcon name="check" size={14} strokeWidth={2.8} /> : number}
              </span>
              <span className={styles.stepName}>{t(`step.${key}`)}</span>
            </li>
          )
        })}
      </ol>
      <Card padding="l" className={styles.stepCard}>
        <p className={styles.stepLabel}>{t(`step.${step}`)}</p>
        {step === 'file' && (importer === undefined ? (
          <Notice tone="info">{t('importer.unavailable')}</Notice>
        ) : (
          <>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".json,.txt,.md,.csv,.html"
              className="persona-sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={onPicked}
            />
            <Button
              variant="secondary"
              icon={<UiIcon name="attach" size={18} strokeWidth={2.2} />}
              disabled={busy}
              onClick={() => { inputRef.current?.click() }}
            >
              {t('action.chooseFile')}
            </Button>
          </>
        ))}
        {step === 'preview' && preview !== null && (
          <p role="status">
            {preview.accepted > 0
              ? t('preview.summary', { accepted: preview.accepted, rejected: preview.rejected })
              : t('preview.empty')}
          </p>
        )}
        {step === 'progress' && (
          <p role="status">
            {busy
              ? t('progress.running')
              : batch === null
                ? ''
                : batch.rolledBack ? t('progress.rolledBack') : t('progress.done', { count: batch.applied })}
          </p>
        )}
        {error !== null && <Notice tone="warning">{t(`error.${error}`)}</Notice>}
        <div className={styles.actions}>
          {stepIndex > 0 && !(step === 'progress' && batch !== null) && (
            <Button variant="secondary" disabled={busy} onClick={() => { setStep(STEP_ORDER[stepIndex - 1] ?? step) }}>
              {t('action.back')}
            </Button>
          )}
          {step !== 'progress' && step !== 'confirm' && (
            <Button variant="primary" disabled={!canAdvance} onClick={() => { setStep(STEP_ORDER[stepIndex + 1] ?? step) }}>
              {t('action.next')}
            </Button>
          )}
          {step === 'confirm' && importer !== undefined && (
            <Button variant="primary" disabled={busy} onClick={confirm}>
              {t('action.confirmImport')}
            </Button>
          )}
          {step === 'progress' && !busy && batch !== null && !batch.rolledBack && importer !== undefined && (
            <Button variant="secondary" onClick={rollback}>{t('action.rollback')}</Button>
          )}
        </div>
      </Card>
    </Screen>
  )
}
