/**
 * D4b — Conexões (Value first, ask later: detect CLIs, native login at point of use).
 * WAVE2 — várias contas por provedor + política de troca (WAVE2-SPEC §c).
 */
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import {
  AccountList,
  AccountPolicyPicker,
  AccountRow,
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

export interface ConnectionsViewProps {
  readonly dict?: LocaleDict
  /** @deprecated Prefer {@link accountsUi}. Kept for previews. */
  readonly entries?: readonly ConnectionEntry[]
  readonly accountsUi?: ConnectionsAccountsUi | undefined
  readonly initialState?: ConnectionsSurfaceState
  readonly onRetry?: () => void
  readonly onSwapPolicyChange?: ((policy: RunnerSwapPolicy, scope: RunnerSwapPolicyScope) => void) | undefined
  readonly swapPolicyReadOnly?: boolean | undefined
  readonly onAddAccount?: ((provider: ConnectionProviderGroupUi['provider']) => void) | undefined
  readonly onRenameAccount?: ((accountId: string, label: string) => void) | undefined
  readonly onRemoveAccount?: ((accountId: string) => void) | undefined
  readonly onEmptyPrimary?: (() => void) | undefined
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
  onAddAccount,
  onRenameAccount,
  onRemoveAccount,
  onEmptyPrimary,
}: ConnectionsViewProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string>>) => bindLocale(dict, key, params)
  const [surfaceState, setSurfaceState] = useState(initialState)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const policyCardId = useId()

  const ui = useMemo(
    () => accountsUi ?? entriesToAccountsUi(entries),
    [accountsUi, entries],
  )

  const [policyDraft, setPolicyDraft] = useState<AccountPolicy>(runnerSwapPolicyToAccountPolicy(ui.swapPolicy))
  const [scopeDraft, setScopeDraft] = useState<RunnerSwapPolicyScope>(ui.swapPolicyScope)

  useEffect(() => {
    setSurfaceState(initialState)
  }, [initialState])

  useEffect(() => {
    setPolicyDraft(runnerSwapPolicyToAccountPolicy(ui.swapPolicy))
    setScopeDraft(ui.swapPolicyScope)
  }, [ui.swapPolicy, ui.swapPolicyScope])

  const policyCopy = useMemo(() => ({
    fixed: { title: t('accountPolicy.fixed.title'), body: t('accountPolicy.fixed.body') },
    next_on_limit: { title: t('accountPolicy.next_on_limit.title'), body: t('accountPolicy.next_on_limit.body') },
    split_balance: { title: t('accountPolicy.split_balance.title'), body: t('accountPolicy.split_balance.body') },
    ask: { title: t('accountPolicy.ask.title'), body: t('accountPolicy.ask.body') },
  }), [dict])

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
        illustrationKey="empty-connections"
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
            onChange={(next) => {
              setScopeDraft(next)
              onSwapPolicyChange?.(accountPolicyToRunnerSwapPolicy(policyDraft), next)
            }}
            items={[
              { id: 'workspace', label: t('swapPolicy.scope.workspace') },
              { id: 'persona', label: t('swapPolicy.scope.persona') },
            ]}
          />
          <AccountPolicyPicker
            legend={t('accountPolicy.legend')}
            name={`${policyCardId}-policy-${scopeDraft}`}
            value={policyDraft}
            recommended="next_on_limit"
            recommendedLabel={t('accountPolicy.recommended')}
            disabled={policyDisabled}
            copy={policyCopy}
            onChange={(next) => {
              setPolicyDraft(next)
              onSwapPolicyChange?.(accountPolicyToRunnerSwapPolicy(next), scopeDraft)
            }}
          />
        </Card>

        <div className={styles.providerList}>
          {ui.groups.map(group => (
            <Card key={group.provider} padding="l" className={styles.providerCard}>
              <div className={styles.providerHead}>
                <span className={styles.seal} aria-hidden="true">
                  <EngineBrandIcon engineId={group.provider} size={22} />
                </span>
                <h3 className={styles.providerName}>{group.providerName}</h3>
                <Button size="s" variant="ghost" className={styles.learnLink}>
                  {t('action.learn')}
                </Button>
              </div>
              <AccountList label={group.providerName}>
                {group.accounts.map((entry) => {
                  const state = accountState(entry)
                  const menu: MenuItem[] = []
                  if (onRenameAccount !== undefined) {
                    menu.push({
                      id: 'rename',
                      label: t('account.menuRename'),
                      onSelect: () => { onRenameAccount(entry.id, entry.accountLabel) },
                    })
                  }
                  if (onRemoveAccount !== undefined) {
                    menu.push({
                      id: 'remove',
                      label: t('account.menuRemove'),
                      tone: 'danger',
                      onSelect: () => { onRemoveAccount(entry.id) },
                    })
                  }
                  let action: { label: string; onClick: () => void } | undefined
                  if (entry.copyCommand !== undefined) {
                    action = {
                      label: copiedId === entry.id ? t('action.copied') : t('action.copyCommand'),
                      onClick: () => {
                        void copyText(entry.copyCommand ?? '').then(() => {
                          setCopiedId(entry.id)
                          window.setTimeout(() => { setCopiedId(current => (current === entry.id ? null : current)) }, 2000)
                        })
                      },
                    }
                  } else if (state === 'login') {
                    action = { label: t('action.connect'), onClick: () => {} }
                  } else if (entry.errorCode === 'quota_exhausted') {
                    action = { label: t('action.usage'), onClick: () => {} }
                  } else if (entry.errorCode === 'cli_not_found') {
                    action = { label: t('action.install'), onClick: () => {} }
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
              {onAddAccount !== undefined ? (
                <div className={styles.addAccountRow}>
                  <Button variant="secondary" size="s" onClick={() => { onAddAccount(group.provider) }}>
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
      {body}
    </Screen>
  )
}

export type { ConnectionResolveErrorCode, ConnectionStatus }
