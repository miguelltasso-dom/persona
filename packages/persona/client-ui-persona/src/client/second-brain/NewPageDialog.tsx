/** Segundo cérebro › Nova página: a title and a type, then the page opens to be written. */

import { useState, type ReactNode } from 'react'
import type { BrainKindView } from '@deepseek-ai/dsh-persona-host/types'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { Button, Input, Modal } from '../primitives/index.ts'
import { BRAIN_KINDS, brainKindLabel } from './brain-ui-adapters.ts'
import styles from './SecondBrain.module.css'

export interface NewPageDialogProps {
  readonly dict: LocaleDict
  readonly onClose: () => void
  /** Creates the page. A rejection is shown as a sentence and the dialog stays open. */
  readonly onCreate: (title: string, kind: BrainKindView) => Promise<void>
  /** The type the dialog opens on (the "+ Tipo" chip of the Resumo); absent = Processo. */
  readonly initialKind?: BrainKindView | undefined
}

export function NewPageDialog({ dict, onClose, onCreate, initialKind = 'process' }: NewPageDialogProps): ReactNode {
  const t = (key: string) => bindLocale(dict, key)
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<BrainKindView>(initialKind)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const create = (): void => {
    if (title.trim() === '') return
    setBusy(true)
    setFailed(false)
    void onCreate(title.trim(), kind)
      .catch(() => { setFailed(true) })
      .finally(() => { setBusy(false) })
  }
  return (
    <Modal
      open
      size="m"
      title={t('newPage.title')}
      description={t('newPage.body')}
      closeLabel={t('newPage.cancel')}
      onClose={onClose}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>{t('newPage.cancel')}</Button>
          <Button variant="primary" loading={busy} disabled={title.trim() === ''} onClick={create}>{t('newPage.create')}</Button>
        </>
      )}
    >
      <form className={styles.newPageForm} onSubmit={(event) => { event.preventDefault(); create() }}>
        <Input label={t('newPage.titleLabel')} value={title} maxLength={120} autoFocus onChange={(event) => { setTitle(event.target.value) }} />
        <label className={styles.newPageField}>
          <span>{t('newPage.kindLabel')}</span>
          <select className={styles.newPageSelect} value={kind} onChange={(event) => { setKind(event.target.value as BrainKindView) }}>
            {BRAIN_KINDS.map(row => <option key={row} value={row}>{brainKindLabel(dict, row)}</option>)}
          </select>
        </label>
        {failed && <p className={styles.newPageFailed} role="alert">{t('newPage.failed')}</p>}
      </form>
    </Modal>
  )
}
