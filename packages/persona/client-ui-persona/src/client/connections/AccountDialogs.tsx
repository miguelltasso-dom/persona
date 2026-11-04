/**
 * W2-7 dialogs for Conexões: add another account (step by step), rename, remove.
 * Each dialog owns only its own draft; the host calls and the list come from the caller (ConnectionsView).
 * No native prompt/confirm: those block the app and cannot be read by a screen reader as part of the page.
 */
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Button, Input, Modal, Notice, UiIcon } from '../primitives/index.ts'
import type { ConnectionAccountUiRow } from '../data/adapters/connection-accounts.ts'
import { ACCOUNT_LABEL_MAX, checkAccountLabel, suggestAccountLabels } from './account-labels.ts'
import styles from './AccountDialogs.module.css'

export type AccountT = (key: string, params?: Readonly<Record<string, string | number>>) => string

function labelErrorText(
  t: AccountT,
  providerName: string,
  check: ReturnType<typeof checkAccountLabel>,
): string | undefined {
  if (check.ok) return undefined
  if (check.reason === 'empty') return t('account.label.empty')
  if (check.reason === 'tooLong') return t('account.label.tooLong', { max: ACCOUNT_LABEL_MAX })
  return t('account.label.duplicate', { provider: providerName })
}

export interface AddAccountDialogProps {
  readonly t: AccountT
  readonly providerName: string
  /** Seats of this provider, fresh from the host (the new one shows up here after step 1). */
  readonly accounts: readonly ConnectionAccountUiRow[]
  /** Save the new seat. Resolves false when the host refused. */
  readonly onSubmitName: (label: string) => Promise<boolean>
  /** "Já fiz login": probe again; the answer arrives in `accounts`. */
  readonly onRecheck?: (() => void) | undefined
  readonly checking: boolean
  /** Spoken result of the last check ("Ainda não vejo o login…"). */
  readonly recheckNote: string | null
  readonly onCopy: (text: string) => Promise<void>
  readonly onClose: () => void
}

/** Add another account of the same provider: name → sign in on its own folder → ready. */
export function AddAccountDialog({
  t,
  providerName,
  accounts,
  onSubmitName,
  onRecheck,
  checking,
  recheckNote,
  onCopy,
  onClose,
}: AddAccountDialogProps): ReactNode {
  const [label, setLabel] = useState('')
  const [savedLabel, setSavedLabel] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [touched, setTouched] = useState(false)
  const [failed, setFailed] = useState(false)
  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (copiedTimer.current !== null) clearTimeout(copiedTimer.current) }, [])

  const taken = accounts.map(row => row.accountLabel)
  const check = checkAccountLabel(label, taken)
  const nameError = touched ? labelErrorText(t, providerName, check) : undefined
  const suggestions = suggestAccountLabels(taken)

  const seat = savedLabel === null ? undefined : accounts.find(row => row.accountLabel === savedLabel)
  const ready = seat !== undefined && seat.status === 'ready' && seat.errorCode === undefined
  const step = savedLabel === null ? 1 : ready ? 3 : 2
  const command = seat?.loginCommand

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    setTouched(true)
    if (!check.ok || busy) return
    setBusy(true)
    setFailed(false)
    void onSubmitName(check.label).then((ok) => {
      if (ok) setSavedLabel(check.label)
      else setFailed(true)
    }).catch(() => { setFailed(true) }).finally(() => { setBusy(false) })
  }

  const copy = (): void => {
    if (command === undefined) return
    void onCopy(command).then(() => {
      setCopied(true)
      if (copiedTimer.current !== null) clearTimeout(copiedTimer.current)
      copiedTimer.current = setTimeout(() => { setCopied(false) }, 2000)
    })
  }

  const eyebrow = t('account.add.eyebrow', { step, total: 3 })
  const shownLabel = savedLabel ?? label.trim()

  let body: ReactNode
  let footer: ReactNode
  if (step === 1) {
    body = (
      <form id="persona-add-account-form" className={styles.form} onSubmit={submit} noValidate>
        <Input
          label={t('account.add.nameLabel')}
          hint={t('account.add.nameHint')}
          value={label}
          maxLength={ACCOUNT_LABEL_MAX + 8}
          autoComplete="off"
          autoFocus
          onChange={(event) => { setLabel(event.target.value); setFailed(false) }}
          onBlur={() => { setTouched(true) }}
          {...(nameError === undefined ? {} : { error: nameError })}
        />
        {suggestions.length > 0 && (
          <div className={styles.suggestions} role="group" aria-label={t('account.add.suggestions')}>
            {suggestions.map(name => (
              <button
                key={name}
                type="button"
                className={styles.suggestion}
                onClick={() => { setLabel(name); setTouched(true); setFailed(false) }}
              >
                {name}
              </button>
            ))}
          </div>
        )}
        {failed && <p className={styles.failure} role="alert">{t('account.add.error')}</p>}
      </form>
    )
    footer = (
      <>
        <Button variant="ghost" onClick={onClose}>{t('account.cancel')}</Button>
        <Button variant="primary" type="submit" form="persona-add-account-form" loading={busy}>
          {busy ? t('account.add.saving') : t('account.add.continue')}
        </Button>
      </>
    )
  } else if (step === 2) {
    body = (
      <div className={styles.steps}>
        <p className={styles.lead}>{t('account.add.loginTitle', { label: shownLabel })}</p>
        <ol className={styles.stepList}>
          <li>{t('account.add.loginStep1')}</li>
          {command === undefined ? null : (
            <li>
              {t('account.add.loginStep2', { label: shownLabel })}
              <div className={styles.commandRow}>
                <code className={styles.command} tabIndex={0}>{command}</code>
                <Button
                  size="s"
                  variant="secondary"
                  icon={<UiIcon name={copied ? 'check' : 'copy'} size={16} />}
                  onClick={copy}
                >
                  {copied ? t('account.add.copied') : t('account.add.copy')}
                </Button>
              </div>
              <span className={styles.stepNote}>{t('account.add.isolatedNote')}</span>
            </li>
          )}
          {command === undefined ? null : <li>{t('account.add.loginStep3')}</li>}
        </ol>
        {command === undefined && <Notice tone="warning">{t('account.add.noCommand', { label: shownLabel })}</Notice>}
        {recheckNote !== null && <p className={styles.recheck} role="status">{recheckNote}</p>}
        <p className={styles.later}>{t('account.add.laterHint')}</p>
      </div>
    )
    footer = (
      <>
        <Button variant="ghost" onClick={onClose}>{t('account.add.later')}</Button>
        {command !== undefined && onRecheck !== undefined && (
          <Button variant="primary" loading={checking} disabled={checking} onClick={onRecheck}>
            {checking ? t('action.checking') : t('action.alreadyLoggedIn')}
          </Button>
        )}
      </>
    )
  } else {
    body = (
      <div className={styles.done}>
        <span className={styles.doneSeal} aria-hidden="true"><UiIcon name="check" size={28} strokeWidth={2.6} /></span>
        <p className={styles.lead} role="status">{t('account.add.doneTitle', { provider: providerName, label: shownLabel })}</p>
        <p className={styles.stepNote}>{t('account.add.doneBody')}</p>
      </div>
    )
    footer = <Button variant="primary" onClick={onClose}>{t('account.add.done')}</Button>
  }

  return (
    <Modal
      open
      size="m"
      eyebrow={eyebrow}
      title={t('account.add.title', { provider: providerName })}
      closeLabel={t('account.close')}
      onClose={onClose}
      footer={footer}
    >
      {body}
    </Modal>
  )
}

export interface RenameAccountDialogProps {
  readonly t: AccountT
  readonly providerName: string
  readonly currentLabel: string
  /** Other seats of this provider. */
  readonly otherLabels: readonly string[]
  readonly onSubmit: (label: string) => Promise<boolean>
  readonly onClose: () => void
}

/** Rename a seat. The new name must be unique for the provider. */
export function RenameAccountDialog({ t, providerName, currentLabel, otherLabels, onSubmit, onClose }: RenameAccountDialogProps): ReactNode {
  const [label, setLabel] = useState(currentLabel)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [touched, setTouched] = useState(false)
  const check = checkAccountLabel(label, otherLabels, currentLabel)
  const error = touched ? labelErrorText(t, providerName, check) : undefined

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    setTouched(true)
    if (!check.ok || busy) return
    if (check.label === currentLabel) { onClose(); return }
    setBusy(true)
    setFailed(false)
    void onSubmit(check.label).then((ok) => {
      if (ok) onClose()
      else setFailed(true)
    }).catch(() => { setFailed(true) }).finally(() => { setBusy(false) })
  }

  return (
    <Modal
      open
      size="m"
      title={t('account.rename.title', { provider: providerName })}
      closeLabel={t('account.close')}
      onClose={onClose}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>{t('account.cancel')}</Button>
          <Button variant="primary" type="submit" form="persona-rename-account-form" loading={busy}>
            {busy ? t('account.rename.saving') : t('account.rename.save')}
          </Button>
        </>
      )}
    >
      <form id="persona-rename-account-form" className={styles.form} onSubmit={submit} noValidate>
        <Input
          label={t('account.add.nameLabel')}
          value={label}
          maxLength={ACCOUNT_LABEL_MAX + 8}
          autoComplete="off"
          autoFocus
          onChange={(event) => { setLabel(event.target.value); setFailed(false) }}
          onBlur={() => { setTouched(true) }}
          {...(error === undefined ? {} : { error })}
        />
        {failed && <p className={styles.failure} role="alert">{t('account.rename.error')}</p>}
      </form>
    </Modal>
  )
}

export interface RemoveAccountDialogProps {
  readonly t: AccountT
  readonly providerName: string
  readonly label: string
  readonly usedRecently: boolean
  readonly isLastOfProvider: boolean
  readonly onConfirm: () => Promise<boolean>
  readonly onClose: () => void
}

/** Confirm removing a seat, with the honest consequence in one or two sentences. */
export function RemoveAccountDialog({ t, providerName, label, usedRecently, isLastOfProvider, onConfirm, onClose }: RemoveAccountDialogProps): ReactNode {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const confirm = (): void => {
    if (busy) return
    setBusy(true)
    setFailed(false)
    void onConfirm().then((ok) => {
      if (ok) onClose()
      else setFailed(true)
    }).catch(() => { setFailed(true) }).finally(() => { setBusy(false) })
  }
  return (
    <Modal
      open
      size="m"
      title={t('account.remove.title', { provider: providerName, label })}
      closeLabel={t('account.close')}
      onClose={onClose}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>{t('account.cancel')}</Button>
          <Button variant="danger" loading={busy} onClick={confirm}>
            {busy ? t('account.remove.removing') : t('account.remove.confirm')}
          </Button>
        </>
      )}
    >
      <div className={styles.steps}>
        <p className={styles.lead}>{t('account.remove.body')}</p>
        {usedRecently && <p className={styles.stepNote}>{t('account.remove.inUse')}</p>}
        {isLastOfProvider && <Notice tone="warning">{t('account.remove.last', { provider: providerName })}</Notice>}
        {failed && <p className={styles.failure} role="alert">{t('account.remove.error')}</p>}
      </div>
    </Modal>
  )
}
