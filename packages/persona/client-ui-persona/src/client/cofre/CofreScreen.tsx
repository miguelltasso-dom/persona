/**
 * Item 15 (colheita) — Configurações › Cofre (Muse, 12/11): the company card, the logins and the keys, with a 440 px side panel
 * to add or edit one. Pure presentation: the connected container resolves the data and the actions; here there is no network call.
 *
 * What the screen never does: show a password or a key (an entry only says "senha guardada"), pre-fill a secret when editing
 * (editing asks for it again), or draw an action it has no handler for.
 */

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Button, Card, Chip, EmptyState, IconButton, Input, MenuButton, UiIcon, type MenuItem } from '../primitives/index.ts'
import { ILLUSTRATIONS } from '../assets/generated-imports.ts'
import type { CofreKey } from '../locale/cofre/locales.ts'
import { cofreIsEmpty, shortDate, type CofreGroups, type CofreKind, type CofreRowView, type HostImportPreview, type HostImportResult } from './cofre-wire.ts'
import { CofreImportDialog } from './CofreImportDialog.tsx'
import styles from './CofreScreen.module.css'

type T = (key: CofreKey, params?: Readonly<Record<string, string | number>>) => string

/** What a Login form sends. `id` present = editing: the password is typed again. */
export interface CofreLoginInput { readonly id?: string; readonly site: string; readonly username: string; readonly password?: string; readonly title?: string }
/** What a Chave form sends. */
export interface CofreKeyInput { readonly id?: string; readonly service: string; readonly secret?: string; readonly title?: string }
/** What the company form sends. */
export interface CofreCompanyInput {
  readonly id?: string
  readonly legalName: string
  readonly document: string
  readonly email?: string
  readonly phone?: string
  readonly address?: string
}

/** What the screen draws and what it can do. */
export interface CofreScreenProps {
  readonly state: 'loading' | 'error' | 'ready'
  readonly groups: CofreGroups
  /** The Windows vault can seal a secret on this computer. `false` disables Login and Chave and says why; the company card keeps working. */
  readonly sealable: boolean
  /** A missing handler is a missing button. */
  readonly onSaveLogin?: (input: CofreLoginInput) => Promise<void>
  readonly onSaveKey?: (input: CofreKeyInput) => Promise<void>
  readonly onSaveCompany?: (input: CofreCompanyInput) => Promise<void>
  readonly onRemove?: (id: string) => Promise<void>
  /**
   * The host keeps the sealed secret when an edit arrives without one (Zinc, 12/11). Then the secret field may stay blank on edit ("Deixe em branco para manter"). Off by default: today the
   * host seals whatever it receives, so a blank would ERASE the saved password and the screen asks for it again.
   */
  readonly keepSecretOnEdit?: boolean
  /** Import logins from a Chrome/Bitwarden CSV: both handlers are needed (preview first, then the same text to commit). */
  readonly onPreviewImport?: (csv: string) => Promise<HostImportPreview>
  readonly onCommitImport?: (csv: string) => Promise<HostImportResult>
  readonly onRetry?: (() => void) | undefined
  readonly t: T
}

/** What the side panel is doing. */
interface PanelState {
  readonly kind: CofreKind
  /** Present = editing this entry. */
  readonly row?: CofreRowView
}

const ICON: Record<CofreKind, 'lock' | 'file'> = { login: 'lock', key: 'lock', company: 'file' }

/** The second line of a row. A key never repeats its name (Muse): what it is for when that says something else, otherwise when it was saved. */
function detailLine(item: CofreRowView, t: T): string {
  if (item.kind !== 'key') return item.detail
  if (item.detail !== '' && item.detail.trim().toLowerCase() !== item.title.trim().toLowerCase()) return item.detail
  const date = shortDate(item.updatedAt)
  return date === '' ? '' : t('row.keyDetail', { date })
}

function messageOf(failure: unknown, fallback: string): string {
  return failure instanceof Error && failure.message !== '' ? failure.message : fallback
}

export function CofreScreen(props: CofreScreenProps): ReactNode {
  const { t, groups, sealable } = props
  const [panel, setPanel] = useState<PanelState | undefined>(undefined)
  const [removing, setRemoving] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [importing, setImporting] = useState(false)
  const [notice, setNotice] = useState<string | undefined>(undefined)
  const returnFocus = useRef<HTMLElement | null>(null)

  const open = (next: PanelState): void => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setRemoving(undefined)
    setError(undefined)
    setPanel(next)
  }
  const close = (): void => {
    setPanel(undefined)
    returnFocus.current?.focus()
  }

  const remove = async (id: string): Promise<void> => {
    const act = props.onRemove
    if (act === undefined) return
    setBusy(true)
    setError(undefined)
    try {
      await act(id)
      setRemoving(undefined)
    } catch (failure) {
      setError(messageOf(failure, t('error.removeFailed')))
    } finally {
      setBusy(false)
    }
  }

  const addItems: MenuItem[] = [
    ...(props.onSaveLogin === undefined ? [] : [{ id: 'login', label: t('action.addLogin'), disabled: !sealable, onSelect: () => { open({ kind: 'login' }) } }]),
    ...(props.onSaveKey === undefined ? [] : [{ id: 'key', label: t('action.addKey'), disabled: !sealable, onSelect: () => { open({ kind: 'key' }) } }]),
    ...(props.onSaveCompany === undefined || groups.company !== undefined ? [] : [{ id: 'company', label: t('action.addCompany'), onSelect: () => { open({ kind: 'company' }) } }]),
  ]
  // The empty Cofre has exactly one action (the menu inside the invitation); the header carries it from the first entry on.
  const emptyCofre = props.state === 'ready' && cofreIsEmpty(groups)
  const addMenu = addItems.length === 0 ? null : <MenuButton label={t('action.add')} text={t('action.add')} items={addItems} variant="secondary" />
  const importOpen = (): void => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setNotice(undefined)
    setImporting(true)
  }
  // Importing logins seals a password for each one: it needs the Windows vault, like a Login does.
  const importButton = props.onPreviewImport === undefined || props.onCommitImport === undefined
    ? null
    : <Button variant={emptyCofre ? 'ghost' : 'secondary'} disabled={!sealable} onClick={importOpen}>{t('action.import')}</Button>
  const headerActions = emptyCofre || (addMenu === null && importButton === null) ? undefined : <>{addMenu}{importButton}</>

  const row = (item: CofreRowView): ReactNode => (
    <li key={item.id} className={styles.row} data-kind={item.kind}>
      <span className={styles.rowIcon} aria-hidden="true"><UiIcon name={ICON[item.kind]} size={20} /></span>
      <div className={styles.rowText}>
        <p className={styles.rowTitle}>{item.title}</p>
        {detailLine(item, t) !== '' && <p className={styles.rowDetail}>{detailLine(item, t)}</p>}
      </div>
      {item.kind !== 'company' && item.hasSecret && (
        <Chip size="s" tone="neutral" icon={<UiIcon name="lock" size={14} />}>{t(item.kind === 'key' ? 'badge.key' : 'badge.password')}</Chip>
      )}
      {removing === item.id ? (
        <div className={styles.confirm} role="group" aria-label={t('action.removeNamed', { title: item.title })}>
          <span className={styles.confirmText}>{t('remove.confirm', { title: item.title })}</span>
          <Button variant="danger" disabled={busy} onClick={() => { void remove(item.id) }}>{t('remove.yes')}</Button>
          <Button variant="ghost" autoFocus disabled={busy} onClick={() => { setRemoving(undefined) }}>{t('remove.no')}</Button>
        </div>
      ) : (
        <div className={styles.rowActions}>
          {editHandlerFor(props, item.kind) !== undefined && (
            <Button variant="ghost" aria-label={t('action.editNamed', { title: item.title })} disabled={busy || (item.kind !== 'company' && !sealable)} onClick={() => { open({ kind: item.kind, row: item }) }}>{t('action.edit')}</Button>
          )}
          {props.onRemove !== undefined && (
            <Button variant="ghost" aria-label={t('action.removeNamed', { title: item.title })} disabled={busy} onClick={() => { setError(undefined); setRemoving(item.id) }}>{t('action.remove')}</Button>
          )}
        </div>
      )}
    </li>
  )

  const group = (title: string, children: ReactNode): ReactNode => (
    <section className={styles.group}>
      <h4 className={styles.groupTitle}>{title}</h4>
      {children}
    </section>
  )

  return (
    <div className={styles.layout}>
      <Card as="section" eyebrow={t('card.eyebrow')} title={t('card.title')} className={styles.card} {...(headerActions === undefined ? {} : { actions: headerActions })}>
        <p className={styles.subtitle}>{t('card.subtitle')}</p>
        {notice !== undefined && (
          <p className={styles.notice} role="status">
            <UiIcon name="check" size={16} />
            <span className={styles.noticeText}>{notice}</span>
            <IconButton label={t('notice.dismiss')} size="s" icon={<UiIcon name="close" size={16} />} onClick={() => { setNotice(undefined) }} />
          </p>
        )}
        {!sealable && (
          <p className={styles.warning} role="status">
            <UiIcon name="alert" size={16} />
            {t('unavailable')}
          </p>
        )}
        {props.state === 'loading' && <div className={styles.loading} aria-busy="true" aria-label={t('loading')} />}
        {props.state === 'error' && (
          <div className={styles.errorBlock} role="alert">
            <p>{t('error.load')}</p>
            {props.onRetry !== undefined && <Button variant="secondary" onClick={props.onRetry}>{t('action.retry')}</Button>}
          </div>
        )}
        {emptyCofre && (
          <EmptyState compact illustration={ILLUSTRATIONS['empty-cofre']} artSize={240} title={t('empty.title')} body={t('empty.body')} action={addMenu ?? undefined} secondaryAction={importButton ?? undefined} />
        )}
        {props.state === 'ready' && !cofreIsEmpty(groups) && (
          <>
            {group(t('group.company'), groups.company === undefined
              ? (
                <EmptyState
                  compact
                  title={t('company.empty.title')}
                  body={t('company.empty.body')}
                  action={props.onSaveCompany === undefined ? undefined : <Button variant="secondary" onClick={() => { open({ kind: 'company' }) }}>{t('action.fillCompany')}</Button>}
                />
              )
              : <ul className={styles.list}>{row(groups.company)}</ul>)}
            {group(t('group.logins'), groups.logins.length === 0 ? <p className={styles.muted}>{t('logins.empty')}</p> : <ul className={styles.list}>{groups.logins.map(row)}</ul>)}
            {group(t('group.keys'), groups.keys.length === 0 ? <p className={styles.muted}>{t('keys.empty')}</p> : <ul className={styles.list}>{groups.keys.map(row)}</ul>)}
          </>
        )}
        {error !== undefined && panel === undefined && <p className={styles.error} role="alert">{error}</p>}
      </Card>
      {panel !== undefined && <EntryPanel key={`${panel.kind}:${panel.row?.id ?? 'new'}`} panel={panel} props={props} onClose={close} />}
      {importing && props.onPreviewImport !== undefined && props.onCommitImport !== undefined && (
        <CofreImportDialog
          t={t}
          onPreview={props.onPreviewImport}
          onCommit={props.onCommitImport}
          onDone={(line) => { setNotice(line); setImporting(false); returnFocus.current?.focus() }}
          onClose={() => { setImporting(false); returnFocus.current?.focus() }}
        />
      )}
    </div>
  )
}

/** The save handler of a kind, or undefined when the screen was given none (then there is no Edit button). */
function editHandlerFor(props: CofreScreenProps, kind: CofreKind): unknown {
  if (kind === 'login') return props.onSaveLogin
  if (kind === 'key') return props.onSaveKey
  return props.onSaveCompany
}

interface PanelProps {
  readonly panel: PanelState
  readonly props: CofreScreenProps
  readonly onClose: () => void
}

/** The 440 px panel: one form per kind. Typed secrets live only in this component's state and die with it. */
function EntryPanel({ panel, props, onClose }: PanelProps): ReactNode {
  const { t } = props
  const editing = panel.row !== undefined
  const fields = panel.row?.fields ?? {}
  const titleId = useId()
  const firstRef = useRef<HTMLInputElement | null>(null)
  const secretRef = useRef<HTMLInputElement>(null)
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [values, setValues] = useState<Record<string, string>>(() => ({ ...fields, ...(panel.row === undefined ? {} : { title: panel.row.title }) }))
  const [secret, setSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  useEffect(() => { firstRef.current?.focus() }, [])

  const set = (key: string, value: string): void => {
    setValues(current => ({ ...current, [key]: value }))
    setFieldErrors(current => (current[key] === undefined ? current : Object.fromEntries(Object.entries(current).filter(([name]) => name !== key))))
  }
  const val = (key: string): string => values[key] ?? ''
  const required: readonly { readonly key: string; readonly label: CofreKey }[] = panel.kind === 'login'
    ? [{ key: 'site', label: 'field.site' }, { key: 'username', label: 'field.username' }]
    : panel.kind === 'key' ? [{ key: 'service', label: 'field.service' }] : [{ key: 'legalName', label: 'field.legalName' }, { key: 'document', label: 'field.document' }]

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    // A missing value is an error ON ITS FIELD, and the first one takes the focus: Save is never disabled in silence (Muse).
    const missing: Record<string, string> = {}
    for (const item of required) {
      if (val(item.key).trim() === '') missing[item.key] = t('error.required', { field: t(item.label) })
    }
    if (panel.kind !== 'company' && secret === '' && !(editing && props.keepSecretOnEdit === true)) missing.secret = t(panel.kind === 'login' ? 'error.typePassword' : 'error.typeSecret')
    if (Object.keys(missing).length > 0) {
      setFieldErrors(missing)
      setError(undefined)
      const first = [...required.map(item => item.key), 'secret'].find(key => missing[key] !== undefined)
      if (first === 'secret') secretRef.current?.focus()
      else if (first !== undefined) inputRefs.current[first]?.focus()
      return
    }
    setFieldErrors({})
    const id = panel.row?.id
    const title = val('title').trim()
    const optional = (key: string): { [k: string]: string } => (val(key).trim() === '' ? {} : { [key]: val(key).trim() })
    setBusy(true)
    setError(undefined)
    try {
      if (panel.kind === 'login' && props.onSaveLogin !== undefined) {
        await props.onSaveLogin({ ...(id === undefined ? {} : { id }), site: val('site').trim(), username: val('username').trim(), ...(secret === '' ? {} : { password: secret }), ...(title === '' ? {} : { title }) })
      } else if (panel.kind === 'key' && props.onSaveKey !== undefined) {
        await props.onSaveKey({ ...(id === undefined ? {} : { id }), service: val('service').trim(), ...(secret === '' ? {} : { secret }), ...(title === '' ? {} : { title }) })
      } else if (panel.kind === 'company' && props.onSaveCompany !== undefined) {
        await props.onSaveCompany({ ...(id === undefined ? {} : { id }), legalName: val('legalName').trim(), document: val('document').trim(), ...optional('email'), ...optional('phone'), ...optional('address') })
      }
      setSecret('')
      onClose()
    } catch (failure) {
      setError(messageOf(failure, t('error.failed')))
    } finally {
      setBusy(false)
    }
  }

  const heading: CofreKey = panel.kind === 'login' ? (editing ? 'panel.editLogin' : 'panel.newLogin') : panel.kind === 'key' ? (editing ? 'panel.editKey' : 'panel.newKey') : 'panel.company'
  const text = (key: string, label: CofreKey, extra: { readonly placeholder?: string; readonly first?: boolean; readonly type?: string; readonly hint?: string } = {}): ReactNode => (
    <Input
      key={key}
      label={t(label)}
      value={val(key)}
      onChange={(event) => { set(key, event.target.value) }}
      autoComplete="off"
      ref={(element) => { inputRefs.current[key] = element; if (extra.first === true) firstRef.current = element }}
      {...(fieldErrors[key] === undefined ? {} : { error: fieldErrors[key] })}
      {...(extra.placeholder === undefined ? {} : { placeholder: extra.placeholder })}
      {...(extra.type === undefined ? {} : { type: extra.type })}
      {...(extra.hint === undefined ? {} : { hint: extra.hint })}
    />
  )

  return (
    <aside className={styles.panel} aria-labelledby={titleId}>
      <header className={styles.panelHeader}>
        <h3 id={titleId} className={styles.panelTitle}>{t(heading)}</h3>
        <IconButton label={t('action.closePanel')} icon={<UiIcon name="close" size={18} />} onClick={onClose} />
      </header>
      <form className={styles.panelForm} onSubmit={(event) => { void submit(event) }} noValidate>
        {panel.kind === 'login' && (
          <>
            {text('site', 'field.site', { placeholder: t('field.sitePlaceholder'), first: true })}
            {text('username', 'field.username')}
            <Input
              label={t('field.password')}
              type="password"
              value={secret}
              onChange={(event) => { setSecret(event.target.value) }}
              autoComplete="new-password"
              ref={secretRef}
              {...(fieldErrors.secret === undefined ? {} : { error: fieldErrors.secret })}
              hint={<><span className={styles.hintLine}>{editing ? t(props.keepSecretOnEdit === true ? 'field.passwordHint.keep' : 'field.passwordHint.edit') : null}</span><span className={styles.hintLine}>{t('field.passwordHint.new')}</span></>}
            />
            {text('title', 'field.title')}
          </>
        )}
        {panel.kind === 'key' && (
          <>
            {text('service', 'field.service', { placeholder: t('field.servicePlaceholder'), first: true })}
            <Input
              label={t('field.secret')}
              type="password"
              value={secret}
              onChange={(event) => { setSecret(event.target.value) }}
              autoComplete="new-password"
              ref={secretRef}
              {...(fieldErrors.secret === undefined ? {} : { error: fieldErrors.secret })}
              hint={<><span className={styles.hintLine}>{editing ? t(props.keepSecretOnEdit === true ? 'field.secretHint.keep' : 'field.secretHint.edit') : null}</span><span className={styles.hintLine}>{t('field.secretHint.new')}</span></>}
            />
            {text('title', 'field.title')}
          </>
        )}
        {panel.kind === 'company' && (
          <>
            {text('legalName', 'field.legalName', { first: true })}
            {text('document', 'field.document')}
            {text('email', 'field.email', { type: 'email' })}
            {text('phone', 'field.phone', { type: 'tel' })}
            {text('address', 'field.address')}
          </>
        )}
        {error !== undefined && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.panelActions}>
          <Button type="submit" variant="primary" size="m" disabled={busy}>{t('action.save')}</Button>
          <Button type="button" variant="ghost" size="m" onClick={onClose}>{t('action.cancel')}</Button>
        </div>
      </form>
    </aside>
  )
}
