/**
 * D4b — Conexões (Value first, ask later: detect CLIs, native login at point of use).
 * WAVE2 — várias contas por provedor + política de troca (WAVE2-SPEC §c).
 */
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  AccountList,
  AccountPolicyPicker,
  AccountRow,
  Avatar,
  Button,
  Card,
  Notice,
  Screen,
  ScreenHeader,
  Tabs,
  type AccountPolicy,
  type AccountState,
  type MenuItem,
} from '../primitives/index.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { PersonaSurfaceEmpty, PersonaSurfaceError, PersonaSurfaceLoading } from '../kanban/PersonaSurface.tsx'
import styles from './Connections.module.css'
import type { ConnectionEntry, ConnectionResolveErrorCode, ConnectionStatus } from './mock-data.ts'
import { pt as defaultDict } from '../locale/connections/locales.ts'
import type {
  ConnectionAccountUiRow,
  ConnectionProviderGroupUi,
  ConnectionsAccountsUi,
  RunnerSwapPolicy,
  RunnerSwapPolicyScope,
} from '../data/adapters/connection-accounts.ts'
import { runnerLabel } from '../team/engine-label.ts'
import { accountPolicyToRunnerSwapPolicy, runnerSwapPolicyToAccountPolicy } from './connection-swap-policy-map.ts'
import { EngineBrandIcon } from './engine-brand-icon.tsx'
import { personaPortraitSrc } from '../approvals/approvals-ui-helpers.ts'
import { AddAccountDialog, RemoveAccountDialog, RenameAccountDialog } from './AccountDialogs.tsx'

export type ConnectionsSurfaceState = 'loading' | 'error' | 'empty' | 'ready'

function accountState(entry: Pick<ConnectionEntry, 'status' | 'errorCode'>): AccountState {
  if (entry.errorCode === 'quota_exhausted') return 'limit'
  if (entry.status === 'missing') return 'checking'
  if (entry.status === 'expired' || entry.errorCode === 'not_logged_in') return 'login'
  if (entry.status === 'ready') return 'ready'
  return 'checking'
}

function statusTextKey(entry: Pick<ConnectionEntry, 'status' | 'errorCode'>): string {
  if (entry.errorCode === 'quota_exhausted') return 'status.quota'
  return `status.${entry.status}`
}

async function copyText(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText !== undefined) {
    await navigator.clipboard.writeText(text)
    return
  }
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', 'true')
  area.style.position = 'fixed'
  area.style.left = '-9999px'
  document.body.appendChild(area)
  area.select()
  document.execCommand('copy')
  document.body.removeChild(area)
}

function entriesToAccountsUi(entries: readonly ConnectionEntry[]): ConnectionsAccountsUi {
  const byKind = new Map<string, ConnectionAccountUiRow[]>()
  for (const entry of entries) {
    const list = byKind.get(entry.kind) ?? []
    list.push({
      ...entry,
      accountLabel: entry.name,
    })
    byKind.set(entry.kind, list)
  }
  const groups: ConnectionProviderGroupUi[] = [...byKind.entries()].map(([kind, accounts]) => ({
    provider: kind as ConnectionProviderGroupUi['provider'],
    providerName: runnerLabel(kind),
    accounts,
  }))
  return {
    groups,
    swapPolicy: 'next_on_limit',
    swapPolicyScope: 'workspace',
    legacySingleSeat: true,
  }
}

function accountCount(ui: ConnectionsAccountsUi): number {
  return ui.groups.reduce((sum, g) => sum + g.accounts.length, 0)
}

/** A persona the team rule can be overridden for ("Uma persona"). */
export interface PolicyPersona {
  readonly id: string
  readonly name: string
  /** Gallery key of the portrait (`avatarRef`). */
  readonly characterId?: string | undefined
}

type AccountDialogState =
  | { readonly kind: 'add'; readonly provider: ConnectionProviderGroupUi['provider']; readonly providerName: string }
  | { readonly kind: 'rename'; readonly provider: ConnectionProviderGroupUi['provider']; readonly providerName: string; readonly id: string; readonly label: string }
  | { readonly kind: 'remove'; readonly provider: ConnectionProviderGroupUi['provider']; readonly providerName: string; readonly id: string; readonly label: string }

export interface ConnectionsViewProps {
  readonly dict?: LocaleDict
  /** @deprecated Prefer {@link accountsUi}. Kept for previews. */
  readonly entries?: readonly ConnectionEntry[]
  readonly accountsUi?: ConnectionsAccountsUi | undefined
  readonly initialState?: ConnectionsSurfaceState
  readonly onRetry?: () => void
  /** Persist a rule. `personaId` is set only for "Uma persona". Reject to show "Não consegui salvar a regra". */
  readonly onSwapPolicyChange?: ((policy: RunnerSwapPolicy, scope: RunnerSwapPolicyScope, personaId?: string) => void | Promise<void>) | undefined
  readonly swapPolicyReadOnly?: boolean | undefined
  /** Personas for the "Uma persona" scope (retrato + nome). */
  readonly personas?: readonly PolicyPersona[] | undefined
  /** Save the new seat (step 1 of the add dialog). Reject when the host refuses. */
  readonly onAddAccount?: ((provider: ConnectionProviderGroupUi['provider'], label: string) => void | Promise<void>) | undefined
  readonly onRenameAccount?: ((accountId: string, label: string) => void | Promise<void>) | undefined
  readonly onRemoveAccount?: ((accountId: string) => void | Promise<void>) | undefined
  readonly onEmptyPrimary?: (() => void) | undefined
  /** "Já fiz login": probe the tools again, live (UX-PHASE #3). The new `accountsUi` is the answer. */
  readonly onRecheck?: (() => void) | undefined
  /** "Ver guia de instalação" / "Conectar" when there is no command to copy. */
  readonly onOpenGuide?: (() => void) | undefined
  /** "Ver uso e cotas" on a seat that ran out. */
  readonly onOpenUsage?: (() => void) | undefined
}

/** CLI connection list. */
export function ConnectionsView({
  dict = defaultDict,
  entries = [],
  accountsUi,
  initialState = 'ready',
  onRetry,
  onSwapPolicyChange,
  swapPolicyReadOnly = false,
  personas = [],
  onAddAccount,
  onRenameAccount,
  onRemoveAccount,
  onEmptyPrimary,
  onRecheck,
  onOpenGuide,
  onOpenUsage,
}: ConnectionsViewProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string>>) => bindLocale(dict, key, params)
  const [surfaceState, setSurfaceState] = useState(initialState)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const policyCardId = useId()
  // "Já fiz login": which provider is being checked, and what the check found (spoken, never a silent spinner).
  const [checking, setChecking] = useState<string | null>(null)
  const [recheckNote, setRecheckNote] = useState<string | null>(null)
  const checkingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const ui = useMemo(
    () => accountsUi ?? entriesToAccountsUi(entries),
    [accountsUi, entries],
  )

  // A new answer from the host while a check is running is the result of that check.
  const lastUi = useRef(ui)
  useEffect(() => {
    if (lastUi.current === ui) return
    lastUi.current = ui
    if (checking === null) return
    const group = ui.groups.find(candidate => candidate.provider === checking)
    // Positive only when every seat of the tool answers ready; anything else (still signed out, still checking) is honest "not yet".
    const allReady = group?.accounts.every(account => accountState(account) === 'ready') === true
    const providerName = group?.providerName ?? checking
    setRecheckNote(allReady ? t('recheck.ready', { provider: providerName }) : t('recheck.still', { provider: providerName }))
    setChecking(null)
    if (checkingTimer.current !== null) { clearTimeout(checkingTimer.current); checkingTimer.current = null }
  }, [ui])
  useEffect(() => () => { if (checkingTimer.current !== null) clearTimeout(checkingTimer.current) }, [])

  const [policyDraft, setPolicyDraft] = useState<AccountPolicy>(runnerSwapPolicyToAccountPolicy(ui.swapPolicy))
  // Which tab is open. Opening "Uma persona" only changes what is shown; nothing is saved until a card is chosen.
  const [scopeDraft, setScopeDraft] = useState<RunnerSwapPolicyScope>('workspace')
  const [personaId, setPersonaId] = useState<string | null>(null)
  // Rules the person set in this session, on top of what the host reported (host may not echo them back yet).
  const [personaOverrides, setPersonaOverrides] = useState<Readonly<Record<string, RunnerSwapPolicy>>>({})
  const [policyNote, setPolicyNote] = useState<{ readonly tone: 'ok' | 'error'; readonly text: string } | null>(null)
  const [policyBusy, setPolicyBusy] = useState(false)
  const [dialog, setDialog] = useState<AccountDialogState | null>(null)

  useEffect(() => {
    setSurfaceState(initialState)
  }, [initialState])

  useEffect(() => {
    setPolicyDraft(runnerSwapPolicyToAccountPolicy(ui.swapPolicy))
  }, [ui.swapPolicy])

  const selectedPersona = scopeDraft === 'persona'
    ? (personas.find(row => row.id === personaId) ?? personas[0])
    : undefined
  const hostPersonaPolicy = (id: string): RunnerSwapPolicy | undefined =>
    personaOverrides[id] ?? ui.personaPolicies?.find(row => row.personaId === id)?.policy
  const shownPolicy: AccountPolicy = selectedPersona === undefined
    ? policyDraft
    : runnerSwapPolicyToAccountPolicy(hostPersonaPolicy(selectedPersona.id) ?? ui.swapPolicy)
  const selectedHasOwnRule = selectedPersona !== undefined && hostPersonaPolicy(selectedPersona.id) !== undefined

  const savePolicy = (next: AccountPolicy): void => {
    if (onSwapPolicyChange === undefined || policyBusy) return
    const policy = accountPolicyToRunnerSwapPolicy(next)
    const target = selectedPersona
    const previous = policyDraft
    if (target === undefined) setPolicyDraft(next)
    setPolicyBusy(true)
    setPolicyNote(null)
    // A synchronous throw from the host call is a failed save like any other.
    void Promise.resolve().then(() => (target === undefined
      ? onSwapPolicyChange(policy, 'workspace')
      : onSwapPolicyChange(policy, 'persona', target.id))).then(() => {
      if (target !== undefined) setPersonaOverrides(current => ({ ...current, [target.id]: policy }))
      setPolicyNote({ tone: 'ok', text: t('swapPolicy.saved') })
    }).catch(() => {
      if (target === undefined) setPolicyDraft(previous)
      setPolicyNote({ tone: 'error', text: t('swapPolicy.saveError') })
    }).finally(() => { setPolicyBusy(false) })
  }

  const policyCopy = useMemo(() => ({
    fixed: { title: t('accountPolicy.fixed.title'), body: t('accountPolicy.fixed.body') },
    next_on_limit: { title: t('accountPolicy.next_on_limit.title'), body: t('accountPolicy.next_on_limit.body') },
    split_balance: { title: t('accountPolicy.split_balance.title'), body: t('accountPolicy.split_balance.body') },
    ask: { title: t('accountPolicy.ask.title'), body: t('accountPolicy.ask.body') },
  }), [dict])

  const startRecheck = (provider: string, providerName: string): void => {
    if (onRecheck === undefined) return
    setRecheckNote(null)
    setChecking(provider)
    onRecheck()
    // The host answers with new data; if it never does, say so instead of spinning forever.
    if (checkingTimer.current !== null) clearTimeout(checkingTimer.current)
    // (The timer is cleared as soon as an answer arrives, so firing means: no answer.)
    checkingTimer.current = setTimeout(() => {
      checkingTimer.current = null
      setChecking(null)
      setRecheckNote(t('recheck.still', { provider: providerName }))
    }, 8000)
  }

  const dialogT = (key: string, params?: Readonly<Record<string, string | number>>): string => bindLocale(dict, key, params)
  const groupOf = (provider: string): ConnectionProviderGroupUi | undefined => ui.groups.find(row => row.provider === provider)
  const copyForDialog = async (text: string): Promise<void> => { await copyText(text) }
  const attempt = async (run: (() => void | Promise<void>) | undefined): Promise<boolean> => {
    if (run === undefined) return false
    try { await run(); return true } catch { return false }
  }

  const header = (
    <ScreenHeader
      icon="skills"
      eyebrow={t('header.eyebrow')}
      title={t('title')}
      subtitle={t('subtitle')}
    />
  )

  const totalAccounts = accountCount(ui)
  const policyDisabled = swapPolicyReadOnly || ui.legacySingleSeat || onSwapPolicyChange === undefined

  const accountRowLabels = (providerName: string, label: string) => ({
    fiveHour: t('account.quota.fiveHour'),
    week: t('account.quota.week'),
    quotaUnavailable: t('account.quota.unavailable'),
    usedBy: t('account.usedBy'),
    menu: t('account.menu', { provider: providerName, label }),
    inUse: t('account.inUseNow'),
  })

  let body: ReactNode
  if (surfaceState === 'loading') {
    body = <PersonaSurfaceLoading dict={dict} messageKey="loading" skeletonColumns={2} />
  } else if (surfaceState === 'error') {
    body = (
      <PersonaSurfaceError
        dict={dict}
        titleKey="error.title"
        retryKey="error.retry"
        onRetry={() => {
          onRetry?.()
          setSurfaceState('ready')
        }}
      />
    )
  } else if (totalAccounts === 0) {
    body = (
      <PersonaSurfaceEmpty
        dict={dict}
        illustrationKey="empty-sem-ia"
        titleKey="empty.title"
        hintKey="empty.hint"
        primaryKey="empty.action"
        {...(onEmptyPrimary === undefined ? {} : { onPrimary: onEmptyPrimary })}
      />
    )
  } else {
    body = (
      <>
        <p className={styles.note}>{t('valueFirst.note')}</p>
        <Notice tone="info">{t('wave2.termsNotice')}</Notice>

        <Card padding="l" className={styles.policyCard}>
          {ui.legacySingleSeat && (
            <Notice tone="info">{t('swapPolicy.pendingHost')}</Notice>
          )}
          <Tabs
            idPrefix={`${policyCardId}-scope`}
            label={t('swapPolicy.scopeLabel')}
            value={scopeDraft}
            onChange={(next) => { setScopeDraft(next); setPolicyNote(null) }}
            items={[
              { id: 'workspace', label: t('swapPolicy.scope.workspace') },
              { id: 'persona', label: t('swapPolicy.scope.persona') },
            ]}
          />
          {scopeDraft === 'persona' && (
            personas.length === 0 ? (
              <p className={styles.sectionHint}>{t('swapPolicy.noPersonas')}</p>
            ) : (
              <fieldset className={styles.personaPicker} disabled={policyDisabled || policyBusy}>
                <legend className={styles.personaLegend}>{t('swapPolicy.personaLabel')}</legend>
                <div className={styles.personaOptions}>
                  {personas.map((row) => {
                    const checked = selectedPersona?.id === row.id
                    const src = personaPortraitSrc(row.characterId, row.name)
                    return (
                      <label key={row.id} className={styles.personaOption} data-checked={checked ? '' : undefined}>
                        <input
                          type="radio"
                          className="persona-sr-only"
                          name={`${policyCardId}-persona`}
                          value={row.id}
                          checked={checked}
                          onChange={() => { setPersonaId(row.id); setPolicyNote(null) }}
                        />
                        <Avatar name={row.name} {...(src === undefined ? {} : { src })} size={32} decorative />
                        <span>{row.name}</span>
                      </label>
                    )
                  })}
                </div>
                {selectedPersona !== undefined && (
                  <p className={styles.sectionHint}>
                    {selectedHasOwnRule
                      ? t('swapPolicy.personaOwn', { name: selectedPersona.name })
                      : t('swapPolicy.personaFollowsTeam', { name: selectedPersona.name })}
                  </p>
                )}
              </fieldset>
            )
          )}
          {(scopeDraft === 'workspace' || selectedPersona !== undefined) && (
            <AccountPolicyPicker
              legend={t('accountPolicy.legend')}
              name={`${policyCardId}-policy-${scopeDraft}-${selectedPersona?.id ?? 'team'}`}
              value={shownPolicy}
              recommended="next_on_limit"
              recommendedLabel={t('accountPolicy.recommended')}
              disabled={policyDisabled || policyBusy}
              copy={policyCopy}
              onChange={savePolicy}
            />
          )}
          <p
            className={policyNote?.tone === 'error' ? styles.policyError : styles.policyOk}
            aria-live="polite"
          >
            {policyNote?.text ?? ''}
          </p>
        </Card>

        <div className={styles.providerList}>
          {ui.groups.map(group => (
            <Card key={group.provider} padding="l" className={styles.providerCard}>
              <div className={styles.providerHead}>
                <span className={styles.seal} aria-hidden="true">
                  <EngineBrandIcon engineId={group.provider} size={44} />
                </span>
                <h3 className={styles.providerName}>{group.providerName}</h3>
                {onOpenGuide !== undefined && (
                  <Button size="s" variant="ghost" className={styles.learnLink} onClick={onOpenGuide}>
                    {t('action.learn')}
                  </Button>
                )}
              </div>
              <AccountList label={group.providerName}>
                {group.accounts.map((entry) => {
                  const state = accountState(entry)
                  const menu: MenuItem[] = []
                  if (onRenameAccount !== undefined) {
                    menu.push({
                      id: 'rename',
                      label: t('account.menuRename'),
                      onSelect: () => {
                        setDialog({ kind: 'rename', provider: group.provider, providerName: group.providerName, id: entry.id, label: entry.accountLabel })
                      },
                    })
                  }
                  if (onRemoveAccount !== undefined) {
                    menu.push({
                      id: 'remove',
                      label: t('account.menuRemove'),
                      tone: 'danger',
                      onSelect: () => {
                        setDialog({ kind: 'remove', provider: group.provider, providerName: group.providerName, id: entry.id, label: entry.accountLabel })
                      },
                    })
                  }
                  let action: { label: string; onClick: () => void } | undefined
                  const seatCommand = entry.loginCommand ?? entry.copyCommand
                  if (seatCommand !== undefined) {
                    action = {
                      label: copiedId === entry.id ? t('action.copied') : t('action.copyCommand'),
                      onClick: () => {
                        void copyText(seatCommand).then(() => {
                          setCopiedId(entry.id)
                          window.setTimeout(() => { setCopiedId(current => (current === entry.id ? null : current)) }, 2000)
                        })
                      },
                    }
                  } else if (state === 'login') {
                    action = { label: t('action.connect'), onClick: () => { onOpenGuide?.() } }
                  } else if (entry.errorCode === 'quota_exhausted') {
                    action = { label: t('action.usage'), onClick: () => { onOpenUsage?.() } }
                  } else if (entry.errorCode === 'cli_not_found') {
                    action = { label: t('action.install'), onClick: () => { onOpenGuide?.() } }
                  }
                  return (
                    <AccountRow
                      key={entry.id}
                      label={entry.accountLabel}
                      providerName={group.providerName}
                      state={state}
                      stateText={t(statusTextKey(entry))}
                      {...(action === undefined ? {} : { action })}
                      {...(entry.quota === undefined ? {} : { quota: entry.quota })}
                      labels={accountRowLabels(group.providerName, entry.accountLabel)}
                      inUse={entry.inUseCount !== undefined && entry.inUseCount > 0}
                      {...(menu.length === 0 ? {} : { menu })}
                    />
                  )
                })}
              </AccountList>
              {onRecheck !== undefined && group.accounts.some(account => accountState(account) === 'login') && (
                <div className={styles.nextStep}>
                  <p className={styles.nextStepText}>{t('nextStep.login')}</p>
                  <Button
                    variant="primary"
                    size="s"
                    loading={checking === group.provider}
                    disabled={checking !== null}
                    onClick={() => { startRecheck(group.provider, group.providerName) }}
                  >
                    {checking === group.provider ? t('action.checking') : t('action.alreadyLoggedIn')}
                  </Button>
                </div>
              )}
              {onAddAccount !== undefined ? (
                <div className={styles.addAccountRow}>
                  <Button
                    variant="secondary"
                    size="s"
                    onClick={() => { setDialog({ kind: 'add', provider: group.provider, providerName: group.providerName }) }}
                  >
                    {t('account.addButton', { provider: group.providerName })}
                  </Button>
                  <p className={styles.addAccountHint}>{t('account.addIsolatedHint', { provider: group.providerName })}</p>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      </>
    )
  }

  return (
    <Screen className={styles.shell} data-persona-surface="connections">
      {header}
      {copiedId !== null && (
        <p className={styles.srOnly} role="status" aria-live="polite">
          {t('action.copied')}
        </p>
      )}
      {recheckNote !== null && dialog === null && (
        <Notice tone="info">{recheckNote}</Notice>
      )}
      {body}
      {dialog?.kind === 'add' && (
        <AddAccountDialog
          t={dialogT}
          providerName={dialog.providerName}
          accounts={groupOf(dialog.provider)?.accounts ?? []}
          onSubmitName={label => attempt(onAddAccount === undefined ? undefined : () => onAddAccount(dialog.provider, label))}
          {...(onRecheck === undefined ? {} : { onRecheck: () => { startRecheck(dialog.provider, dialog.providerName) } })}
          checking={checking === dialog.provider}
          recheckNote={recheckNote}
          onCopy={copyForDialog}
          onClose={() => { setDialog(null); setRecheckNote(null) }}
        />
      )}
      {dialog?.kind === 'rename' && (
        <RenameAccountDialog
          t={dialogT}
          providerName={dialog.providerName}
          currentLabel={dialog.label}
          otherLabels={(groupOf(dialog.provider)?.accounts ?? []).map(row => row.accountLabel)}
          onSubmit={label => attempt(onRenameAccount === undefined ? undefined : () => onRenameAccount(dialog.id, label))}
          onClose={() => { setDialog(null) }}
        />
      )}
      {dialog?.kind === 'remove' && (
        <RemoveAccountDialog
          t={dialogT}
          providerName={dialog.providerName}
          label={dialog.label}
          usedRecently={(groupOf(dialog.provider)?.accounts.find(row => row.id === dialog.id)?.inUseCount ?? 0) > 0}
          isLastOfProvider={(groupOf(dialog.provider)?.accounts.length ?? 0) <= 1}
          onConfirm={() => attempt(onRemoveAccount === undefined ? undefined : () => onRemoveAccount(dialog.id))}
          onClose={() => { setDialog(null) }}
        />
      )}
    </Screen>
  )
}

export type { ConnectionResolveErrorCode, ConnectionStatus }
