/**
 * Item 15 (colheita) — importar logins do Chrome ou do Bitwarden (Muse 12/11): escolher o arquivo, ver a PRÉVIA (sem senha:
 * o que entra, o que já está no Cofre, o que foi ignorado) e só então guardar. O texto do arquivo vive só neste componente,
 * em memória, e some quando o diálogo fecha; ele nunca é desenhado na tela.
 */

import { useRef, useState, type ReactNode } from 'react'
import { Button, Chip, Modal, UiIcon } from '../primitives/index.ts'
import type { CofreKey } from '../locale/cofre/locales.ts'
import type { HostImportPreview, HostImportResult } from './cofre-wire.ts'
import styles from './CofreImportDialog.module.css'

type T = (key: CofreKey, params?: Readonly<Record<string, string | number>>) => string

/** A password export is small; anything bigger is not a list of logins. */
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024

export interface CofreImportDialogProps {
  readonly onPreview: (csv: string) => Promise<HostImportPreview>
  readonly onCommit: (csv: string) => Promise<HostImportResult>
  /** Called with the plain result line ("12 logins guardados (3 repetidos, 1 ignorado)") after a commit. */
  readonly onDone: (line: string) => void
  readonly onClose: () => void
  readonly t: T
}

/**
 * The count in the right form ("1 login" / "12 logins").
 * @param t - Screen dictionary.
 * @param base - Key stem; `${base}.one` and `${base}.other` must exist.
 * @param count - The number.
 */
export function counted(t: T, base: 'preview.save' | 'preview.dup' | 'preview.ignored' | 'result.saved' | 'result.dup' | 'result.ignored', count: number): string {
  return t(`${base}.${count === 1 ? 'one' : 'other'}`, { count })
}

/**
 * "12 logins guardados (3 repetidos, 1 ignorado)": the saved count, then only the parts that are not zero.
 * @param t - Screen dictionary.
 * @param result - What the host did.
 */
export function resultLine(t: T, result: HostImportResult): string {
  const extras = [
    ...(result.duplicates > 0 ? [counted(t, 'result.dup', result.duplicates)] : []),
    ...(result.ignored > 0 ? [counted(t, 'result.ignored', result.ignored)] : []),
  ]
  const saved = counted(t, 'result.saved', result.imported)
  return extras.length === 0 ? saved : `${saved} (${extras.join(', ')})`
}

/** The text of a picked file (`Blob.text` where the browser has it, a FileReader elsewhere). */
function readText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => { resolve(typeof reader.result === 'string' ? reader.result : '') }
    reader.onerror = () => { reject(new Error('read-failed')) }
    reader.readAsText(file)
  })
}

type Step = 'pick' | 'reading' | 'preview' | 'saving'

export function CofreImportDialog({ onPreview, onCommit, onDone, onClose, t }: CofreImportDialogProps): ReactNode {
  const [step, setStep] = useState<Step>('pick')
  const [preview, setPreview] = useState<HostImportPreview | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  // The file text: kept in a ref, not in state, so it is never part of a render and dies with the dialog.
  const csv = useRef('')
  const fileInput = useRef<HTMLInputElement>(null)

  const pick = async (file: File | undefined): Promise<void> => {
    if (file === undefined) return
    setError(undefined)
    if (file.size > IMPORT_MAX_BYTES) { setError(t('import.tooBig')); return }
    setStep('reading')
    try {
      csv.current = await readText(file)
      const answer = await onPreview(csv.current)
      if (answer.format === 'desconhecido') {
        csv.current = ''
        setError(t('import.unknown'))
        setStep('pick')
        return
      }
      setPreview(answer)
      setStep('preview')
    } catch (failure) {
      csv.current = ''
      setError(failure instanceof Error && failure.message !== '' ? failure.message : t('import.readFailed'))
      setStep('pick')
    }
  }

  const commit = async (): Promise<void> => {
    setError(undefined)
    setStep('saving')
    try {
      const result = await onCommit(csv.current)
      csv.current = ''
      onDone(resultLine(t, result))
    } catch (failure) {
      setError(failure instanceof Error && failure.message !== '' ? failure.message : t('import.commitFailed'))
      setStep('preview')
    }
  }

  const back = (): void => {
    csv.current = ''
    setPreview(undefined)
    setError(undefined)
    setStep('pick')
  }

  const close = (): void => {
    csv.current = ''
    onClose()
  }

  const toSave = preview?.entries.length ?? 0
  const footer = step === 'preview' || step === 'saving'
    ? (
      <>
        <Button variant="ghost" disabled={step === 'saving'} onClick={back}>{t('import.back')}</Button>
        <Button variant="primary" disabled={step === 'saving' || toSave === 0} onClick={() => { void commit() }}>{t('import.commit', { count: toSave })}</Button>
      </>
    )
    : <Button variant="ghost" onClick={close}>{t('action.cancel')}</Button>

  return (
    <Modal open title={t('import.title')} eyebrow={t('import.eyebrow')} closeLabel={t('import.close')} onClose={close} size="l" footer={footer}>
      <p className={styles.warn}>
        <UiIcon name="alert" size={16} />
        {t('import.warn')}
      </p>
      {(step === 'pick' || step === 'reading') && (
        <div className={styles.pick}>
          <p className={styles.help}>{t('import.pick.help')}</p>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            className="persona-sr-only"
            aria-label={t('import.pick.button')}
            tabIndex={-1}
            onChange={(event) => { void pick(event.target.files?.[0]); event.target.value = '' }}
          />
          <Button variant="secondary" disabled={step === 'reading'} onClick={() => { fileInput.current?.click() }}>{t('import.pick.button')}</Button>
          {step === 'reading' && <p className={styles.help} role="status">{t('import.reading')}</p>}
        </div>
      )}
      {(step === 'preview' || step === 'saving') && preview !== undefined && (
        <div className={styles.preview}>
          <div className={styles.summary}>
            <Chip size="s" tone="neutral">{t(preview.format === 'bitwarden' ? 'preview.format.bitwarden' : 'preview.format.chrome')}</Chip>
            <p className={styles.summaryLine} role="status">
              {[
                counted(t, 'preview.save', preview.entries.length),
                counted(t, 'preview.dup', preview.duplicates.length),
                counted(t, 'preview.ignored', preview.ignored.length),
              ].join(' · ')}
            </p>
          </div>
          {preview.entries.length === 0 && <p className={styles.help}>{t('preview.empty')}</p>}
          {preview.entries.length > 0 && (
            <section>
              <h4 className={styles.sectionTitle}>{t('preview.section.entries')}</h4>
              <ul className={styles.rows}>
                {preview.entries.map(row => (
                  <li key={`e${String(row.line)}`} className={styles.row}>
                    <span className={styles.rowMain}>{row.title}</span>
                    <span className={styles.rowSub}>{[row.site, row.username].filter(part => part !== '').join(' · ')}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {preview.duplicates.length > 0 && (
            <section>
              <h4 className={styles.sectionTitle}>{t('preview.section.dups')}</h4>
              <ul className={styles.rows}>
                {preview.duplicates.map(row => (
                  <li key={`d${String(row.line)}`} className={styles.row}>
                    <span className={styles.rowMain}>{row.title}</span>
                    <span className={styles.rowSub}>{[row.site, row.username].filter(part => part !== '').join(' · ')} — {t(row.reason === 'no-arquivo' ? 'preview.dup.file' : 'preview.dup.cofre')}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {preview.ignored.length > 0 && (
            <section>
              <h4 className={styles.sectionTitle}>{t('preview.section.ignored')}</h4>
              <ul className={styles.rows}>
                {preview.ignored.map(row => (
                  <li key={`i${String(row.line)}`} className={styles.row}>
                    <span className={styles.rowMain}>{t('preview.line', { line: row.line })}</span>
                    <span className={styles.rowSub}>{row.reason}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
      {error !== undefined && <p className={styles.error} role="alert">{error}</p>}
    </Modal>
  )
}
