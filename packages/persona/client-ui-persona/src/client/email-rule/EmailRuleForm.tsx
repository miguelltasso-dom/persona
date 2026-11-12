/**
 * Harvest 19b — the company inbox. One component, two surfaces: the Connections card (the full form, now in TWO blocks: "Conta" on top
 * and "O que a equipe lê" below) and the routine editor (the human phrase, with the rule form behind “Editar regra”).
 *
 * The account block (Muse, 12/11): Provedor → E-mail → Senha, the server details folded away (a chevron that turns), and “Testar conexão”
 * (secondary) with ONE state line. There is ONE “Salvar” (primary, 40 px) at the END of the card: it saves the account and the rule together
 * and, when the account changed, tests it first and saves nothing if it does not connect. A missing e-mail or password becomes the error of
 * that field, with the focus on it (“Digite o e-mail” / “Digite a senha”). The password is WRITE-ONLY: a saved one shows as “••••••” and
 * “Trocar”, never the secret back. The filter runs at the origin, before any model.
 */

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { EmailConnectionTestView, EmailConnectionView, EmailFilterView, EmailPresetView } from '@deepseek-ai/dsh-persona-host/types'
import { Button, Card, Input, Switch, UiIcon } from '../primitives/index.ts'
import { Select } from '../primitives/Select.tsx'
import { bindLocale, type LocaleDict } from '../preview/locale-bind.ts'
import { pt as defaultDict } from '../locale/email-rule/locales.ts'
import styles from './EmailRule.module.css'

/** What the person typed for the mailbox account. */
export interface EmailCredentialInput {
  readonly host: string
  readonly port: number
  readonly secure: boolean
  readonly user: string
  /** Empty = the password already saved (a test may use it; a save needs a new one). */
  readonly password: string
}

export interface EmailRuleFormProps {
  readonly dict?: LocaleDict | undefined
  readonly presets: readonly EmailPresetView[]
  readonly filter: EmailFilterView
  /** Save the rule; reject to show “Não consegui salvar a regra”. */
  readonly onSave: (filter: EmailFilterView) => Promise<void>
  /** `phrase` (routine editor) starts with the human sentence and hides the fields behind “Editar regra”. */
  readonly variant?: 'full' | 'phrase'
  /** The state of the mailbox account (never the password). With `onTest` it turns on the “Conta” block of the `full` form. */
  readonly connection?: EmailConnectionView | undefined
  /** Read-only login test (EXAMINE). Absent = no account block. */
  readonly onTest?: ((input: Partial<EmailCredentialInput>) => Promise<EmailConnectionTestView>) | undefined
  /** Save the account. Absent = “Salvar” saves only the rule (the host cannot seal the credential yet). */
  readonly onSaveCredential?: ((input: EmailCredentialInput) => Promise<void>) | undefined
}

type Busy = 'rule' | 'test' | 'save' | null
type Status =
  | { readonly kind: 'idle' }
  | { readonly kind: 'testing' }
  | { readonly kind: 'ok'; readonly text: string }
  | { readonly kind: 'error'; readonly text: string }

interface SavedAccount {
  readonly host: string
  readonly port: number
  readonly secure: boolean
  readonly user: string
}

/**
 * Inbox card. Empty lists mean any message; bulk mail is skipped by default.
 * @param props - Locale, presets, the stored rule and account, the ports and the surface.
 */
export function EmailRuleForm({
  dict = defaultDict,
  presets,
  filter,
  onSave,
  variant = 'full',
  connection,
  onTest,
  onSaveCredential,
}: EmailRuleFormProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const showAccount = variant === 'full' && connection !== undefined && onTest !== undefined
  const [to, setTo] = useState(filter.to.join(', '))
  const [from, setFrom] = useState(filter.from.join(', '))
  const [subject, setSubject] = useState(filter.subject.join(', '))
  const [preset, setPreset] = useState(filter.preset ?? '')
  const [skipBulk, setSkipBulk] = useState(filter.skipBulk)
  const [editing, setEditing] = useState(variant === 'full')
  const [busy, setBusy] = useState<Busy>(null)
  const [note, setNote] = useState<{ readonly tone: 'ok' | 'error'; readonly text: string } | null>(null)
  const startPreset = presets.find(item => item.id === (filter.preset ?? ''))
  const [host, setHost] = useState(connection?.host ?? startPreset?.host ?? '')
  const [port, setPort] = useState(String(connection?.port ?? startPreset?.port ?? 993))
  const [secure, setSecure] = useState(connection?.secure ?? startPreset?.secure ?? true)
  const [user, setUser] = useState(connection?.user ?? '')
  const [password, setPassword] = useState('')
  const [changing, setChanging] = useState(connection?.connected !== true)
  const [stored, setStored] = useState(false)
  const [savedAccount, setSavedAccount] = useState<SavedAccount | null>(
    connection?.connected === true ? { host: connection.host ?? '', port: connection.port ?? 993, secure: connection.secure ?? true, user: connection.user ?? '' } : null,
  )
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [fieldError, setFieldError] = useState<{ readonly user?: string | undefined; readonly password?: string | undefined }>({})
  const [focusField, setFocusField] = useState<'user' | 'password' | null>(null)
  const userRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const presetId = useId()
  const selected = presets.find(item => item.id === preset)
  const toList = splitList(to)
  const subjectList = splitList(subject)
  const phrase = toList.length === 0 && subjectList.length === 0
    ? t('trigger.any')
    : t('trigger.phrase', {
      to: toList.length === 0 ? t('any') : toList.join(', '),
      subject: subjectList.length === 0 ? t('any') : subjectList.join(', '),
    })
  const portNumber = Number.parseInt(port, 10)
  const credential: EmailCredentialInput = {
    host: host.trim(),
    port: Number.isInteger(portNumber) && portNumber > 0 ? portNumber : 993,
    secure,
    user: user.trim(),
    password,
  }
  /** The host holds a password for this account (it said so, or this very form just saved it): the screen shows dots and “Trocar”. */
  const hasPassword = connection?.connected === true || stored
  const savedPassword = hasPassword && !changing
  const accountChanged = savedAccount === null
    || credential.user !== savedAccount.user || credential.host !== savedAccount.host
    || credential.port !== savedAccount.port || credential.secure !== savedAccount.secure
  /** “Salvar” has an account to save: nothing is saved yet, the person is changing it, or something in it differs from what is saved. */
  const needsAccount = showAccount && onSaveCredential !== undefined && (!hasPassword || changing || password !== '' || accountChanged)

  useEffect(() => {
    if (focusField === null) return
    const target = focusField === 'user' ? userRef.current : passwordRef.current
    target?.focus()
    setFocusField(null)
  }, [focusField, changing])

  const pickPreset = (id: string): void => {
    setPreset(id)
    const next = presets.find(item => item.id === id)
    if (next === undefined) return
    setHost(next.host)
    setPort(String(next.port))
    setSecure(next.secure)
  }

  const cancel = (): void => {
    setTo(filter.to.join(', '))
    setFrom(filter.from.join(', '))
    setSubject(filter.subject.join(', '))
    setPreset(filter.preset ?? '')
    setSkipBulk(filter.skipBulk)
    setNote(null)
    setEditing(false)
  }

  const errorText = (code: EmailConnectionTestView['error']): string => {
    const label = selected?.label
    if (code === 'network') return label === undefined ? t('cred.error.network.nameless') : t('cred.error.network', { provider: label })
    return t(`cred.error.${code ?? 'unknown'}`)
  }

  const test = async (): Promise<boolean> => {
    if (onTest === undefined) return false
    setBusy('test')
    setStatus({ kind: 'testing' })
    try {
      const result = await onTest(credential)
      if (result.ok) {
        const count = result.messages ?? 0
        setStatus({ kind: 'ok', text: count === 1 ? t('cred.testOk.one') : t('cred.testOk', { count }) })
        return true
      }
      setStatus({ kind: 'error', text: errorText(result.error) })
      return false
    } catch {
      setStatus({ kind: 'error', text: errorText('network') })
      return false
    } finally {
      setBusy(null)
    }
  }

  const rule = (): EmailFilterView => ({
    to: toList,
    from: splitList(from),
    subject: subjectList,
    skipBulk,
    ...(preset === '' ? {} : { preset }),
  })

  /** The rule alone (the routine editor and the form without the account block). */
  const saveRule = async (): Promise<void> => {
    setBusy('rule')
    setNote(null)
    try {
      await onSave(rule())
      setNote({ tone: 'ok', text: t('saved') })
      if (variant === 'phrase') setEditing(false)
    } catch {
      setNote({ tone: 'error', text: t('failed') })
    } finally {
      setBusy(null)
    }
  }

  /** Muse: ONE “Salvar” for the whole card. A missing field is that field's error; a changed account is tested first and saves nothing if it fails. */
  const saveAll = async (): Promise<void> => {
    setNote(null)
    if (needsAccount) {
      if (credential.user === '') {
        setFieldError({ user: t('cred.error.noEmail') })
        setFocusField('user')
        return
      }
      if (password === '') {
        setChanging(true)
        setFieldError({ password: t('cred.error.noPassword') })
        setFocusField('password')
        return
      }
    }
    setFieldError({})
    setBusy('save')
    try {
      if (needsAccount) {
        if (!(await test())) return
        try {
          await onSaveCredential(credential)
        } catch {
          setStatus({ kind: 'error', text: t('cred.failed') })
          return
        }
        setStored(true)
        setSavedAccount({ host: credential.host, port: credential.port, secure: credential.secure, user: credential.user })
        setChanging(false)
        setPassword('')
        setStatus({ kind: 'ok', text: t('cred.savedOk') })
      }
      await onSave(rule())
      setNote({ tone: 'ok', text: t('saved.all') })
    } catch {
      setNote({ tone: 'error', text: t('failed') })
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card
      padding="m"
      as="section"
      title={t('title')}
      className={styles.card}
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return
        const target = event.target
        if (target instanceof HTMLSelectElement || (target instanceof HTMLInputElement && target.type !== 'checkbox')) event.preventDefault()
      }}
    >
      <p className={styles.hint}>{t('hint')}</p>
      {variant === 'phrase' && !editing && (
        <div className={styles.phraseRow}>
          <div>
            <p className={styles.phrase}>{phrase}</p>
            <p className={styles.hint}>{t('trigger.hint')}</p>
          </div>
          <Button size="s" variant="secondary" onClick={() => { setEditing(true) }}>{t('edit')}</Button>
        </div>
      )}
      {showAccount && (
        <section className={styles.block} aria-labelledby={`${presetId}-account`}>
          <h3 className={styles.blockTitle} id={`${presetId}-account`}>{t('cred.legend')}</h3>
          <div className={styles.form}>
            <div className={styles.row}>
              <label htmlFor={presetId} className={styles.label}>{t('preset.label')}</label>
              <div className={styles.selectWrap}>
                <Select id={presetId} className={styles.providerSelect} value={preset} onChange={(event) => { pickPreset(event.target.value) }}>
                  <option value="">{t('preset.choose')}</option>
                  {presets.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
                </Select>
                <UiIcon name="chevronDown" size={16} className={styles.selectIcon} />
              </div>
            </div>
            <Input
              ref={userRef}
              label={t('cred.email')}
              value={user}
              autoComplete="username"
              {...(fieldError.user === undefined ? {} : { error: fieldError.user })}
              onChange={(event) => { setUser(event.target.value); setFieldError(current => ({ ...current, user: undefined })) }}
            />
            {savedPassword
              ? (
                <div className={styles.savedPassword}>
                  <span className={styles.label}>{t('cred.password')}</span>
                  <span className={styles.dots} aria-label={t('cred.password')}>••••••</span>
                  <Button size="s" variant="secondary" onClick={() => { setChanging(true) }}>{t('cred.change')}</Button>
                </div>
              )
              : (
                <Input
                  ref={passwordRef}
                  label={t('cred.password')}
                  type="password"
                  value={password}
                  autoComplete="current-password"
                  {...(fieldError.password === undefined ? (hasPassword ? { hint: t('cred.keep') } : {}) : { error: fieldError.password })}
                  onChange={(event) => { setPassword(event.target.value); setFieldError(current => ({ ...current, password: undefined })) }}
                />
              )}
            <details className={styles.serverDetails}>
              <summary className={styles.policySummary}>
                <UiIcon name="chevronRight" size={14} strokeWidth={2.4} className={styles.summaryIcon} />
                <span>{t('cred.serverDetails')}</span>
              </summary>
              <div className={styles.form}>
                <Input label={t('cred.server')} value={host} onChange={(event) => { setHost(event.target.value) }} />
                <Input label={t('cred.port')} value={port} inputMode="numeric" onChange={(event) => { setPort(event.target.value) }} />
                <div className={styles.check}>
                  <Switch checked={secure} onChange={setSecure} labelledBy={`${presetId}-secure`} />
                  <span id={`${presetId}-secure`}>{t('cred.secure')}</span>
                </div>
              </div>
            </details>
            <div className={styles.actions}>
              <Button size="m" variant="secondary" loading={busy === 'test'} onClick={() => { void test() }}>
                {busy === 'test' ? t('cred.testing') : t('cred.test')}
              </Button>
            </div>
            <p className={`${styles.status} ${status.kind === 'error' ? styles.error : status.kind === 'ok' ? styles.ok : ''}`} role="status" aria-live="polite">
              {(status.kind === 'ok' || status.kind === 'error') && <UiIcon name={status.kind === 'ok' ? 'check' : 'alert'} size={16} />}
              {status.kind === 'testing'
                ? t('cred.testing')
                : status.kind === 'idle'
                  ? (hasPassword ? '' : t('cred.notConnected'))
                  : status.text}
            </p>
          </div>
        </section>
      )}
      {editing && (
        <>
          {showAccount && <hr className={styles.divider} />}
          <section className={styles.block} aria-labelledby={showAccount ? `${presetId}-read` : undefined}>
            {showAccount && <h3 className={styles.blockTitle} id={`${presetId}-read`}>{t('read.legend')}</h3>}
            <div className={styles.form}>
              {!showAccount && (
                <div className={styles.row}>
                  <label htmlFor={presetId} className={styles.label}>{t('preset.label')}</label>
                  <Select id={presetId} value={preset} onChange={(event) => { setPreset(event.target.value) }}>
                    <option value="">{t('preset.choose')}</option>
                    {presets.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </Select>
                  {selected !== undefined && (
                    <p className={styles.hint}>{t('preset.server', { host: selected.host, port: selected.port })}</p>
                  )}
                </div>
              )}
              <Input label={t('to.label')} hint={t('to.hint')} value={to} onChange={(event) => { setTo(event.target.value) }} />
              <Input label={t('from.label')} hint={t('from.hint')} value={from} onChange={(event) => { setFrom(event.target.value) }} />
              <Input label={t('subject.label')} hint={t('subject.hint')} value={subject} onChange={(event) => { setSubject(event.target.value) }} />
              <div className={styles.check}>
                <Switch checked={skipBulk} onChange={setSkipBulk} labelledBy={`${presetId}-skipbulk`} />
                <span id={`${presetId}-skipbulk`}>{t('skipBulk')}</span>
              </div>
            </div>
          </section>
          <div className={styles.actions}>
            {showAccount
              ? <Button size="m" variant="primary" loading={busy === 'save'} onClick={() => { void saveAll() }}>{t('cred.save')}</Button>
              : <Button size="s" variant="primary" loading={busy === 'rule'} onClick={() => { void saveRule() }}>{t('save')}</Button>}
            {variant === 'phrase' && (
              <Button size="s" variant="ghost" onClick={cancel}>{t('cancel')}</Button>
            )}
          </div>
        </>
      )}
      {note !== null && (
        <p className={note.tone === 'ok' ? styles.ok : styles.error} aria-live="polite">{note.text}</p>
      )}
    </Card>
  )
}

function splitList(value: string): string[] {
  return value.split(',').map(item => item.trim()).filter(item => item !== '')
}
