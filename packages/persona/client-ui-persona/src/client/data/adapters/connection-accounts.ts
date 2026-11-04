import type {
  ConnectionAccountsBundleView,
  ConnectionView,
  RunnerSwapPolicy,
  RunnerSwapPolicyScope,
} from '@deepseek-ai/dsh-persona-host/types'
import type { ConnectionEntry, ConnectionResolveErrorCode, ConnectionStatus } from '../../connections/mock-data.ts'
import { runnerLabel } from '../../team/engine-label.ts'

const LOGIN_COMMANDS: Record<string, string> = {
  claude: 'claude login',
  codex: 'codex login',
  opencode: 'opencode auth login',
  cursor: 'cursor-agent login',
}

export type { RunnerSwapPolicy, RunnerSwapPolicyScope }

/** Optional fields a newer host may add to a seat; read defensively (older hosts omit them). */
interface HostAccountExtras { readonly loginCommand?: string | undefined }
interface HostBundleExtras {
  readonly personaPolicies?: readonly { readonly personaId: string; readonly policy: RunnerSwapPolicy }[] | undefined
}

export interface ConnectionAccountUiRow extends ConnectionEntry {
  /** User-defined seat label ("Trabalho"). */
  readonly accountLabel: string
  readonly inUseCount?: number
  readonly quota?: { readonly fiveHourPct?: number; readonly weekPct?: number }
  /**
   * Host-built command that signs in to THIS seat's own folder (the default login would sign in to the main account).
   * Absent until the host sends it: the add-account steps then say so instead of showing a command that could clobber another seat.
   */
  readonly loginCommand?: string
}

/** Per-persona swap rule the host may report (optional: older hosts only accept writes). */
export interface PersonaSwapPolicyUi {
  readonly personaId: string
  readonly policy: RunnerSwapPolicy
}

export interface ConnectionProviderGroupUi {
  readonly provider: ConnectionView['kind']
  readonly providerName: string
  readonly accounts: readonly ConnectionAccountUiRow[]
}

export interface ConnectionsAccountsUi {
  readonly groups: readonly ConnectionProviderGroupUi[]
  readonly swapPolicy: RunnerSwapPolicy
  readonly swapPolicyScope: RunnerSwapPolicyScope
  /** True only in unit tests that simulate legacy `listConnections`. */
  readonly legacySingleSeat: boolean
  /** Rules that belong to one persona; a persona not listed follows the team rule. */
  readonly personaPolicies?: readonly PersonaSwapPolicyUi[]
}

/** One-line swap policy for the persona card (locale-owned). */
export function swapPolicyCardSummaryLine(
  t: (key: string) => string,
  policy: RunnerSwapPolicy,
): string {
  switch (policy) {
    case 'fixed': return t('card.policy.fixed')
    case 'next_on_limit': return t('card.policy.next_on_limit')
    case 'round_robin': return t('card.policy.split_balance')
    case 'ask_before_swap': return t('card.policy.ask')
  }
}

export function enrichConnectionsAccountsWithQuotas(
  ui: ConnectionsAccountsUi,
  quotaByAccountId: ReadonlyMap<string, { readonly fiveHourPct?: number; readonly weekPct?: number }>,
): ConnectionsAccountsUi {
  const groups = ui.groups.map(group => ({
    ...group,
    accounts: group.accounts.map((account) => {
      const quota = quotaByAccountId.get(account.id)
      return quota === undefined ? account : { ...account, quota }
    }),
  }))
  return { ...ui, groups }
}

function narrowErrorCode(code: string | undefined): ConnectionResolveErrorCode | undefined {
  if (code === 'cli_not_found' || code === 'not_logged_in' || code === 'quota_exhausted') return code
  return undefined
}

function statusForProbe(available: boolean, loggedIn: boolean, code: string | undefined): ConnectionStatus {
  if (!available || code === 'cli_not_found') return 'missing'
  if (code === 'quota_exhausted') return 'expired'
  if (!loggedIn || code === 'not_logged_in') return 'expired'
  return 'ready'
}

function copyCommandFor(kind: string, loggedIn: boolean, error: ConnectionView['error']): string | undefined {
  if (error?.code !== 'not_logged_in' && loggedIn) return undefined
  const fromMessage = error?.message.match(/`([^`]+)`/u)?.[1]
  if (fromMessage !== undefined) return fromMessage
  return LOGIN_COMMANDS[kind]
}

function rowRank(status: ConnectionStatus, phase: 'checking' | 'ready'): number {
  if (phase === 'checking') return 0
  if (status === 'ready') return 3
  if (status === 'expired') return 2
  return 1
}

function accountRowFromProbe(
  id: string,
  kind: ConnectionView['kind'],
  accountLabel: string,
  available: boolean,
  loggedIn: boolean,
  phase: 'checking' | 'ready',
  loginHint: string,
  error: ConnectionView['error'],
  inUseCount?: number,
  loginCommand?: string,
): ConnectionAccountUiRow {
  void phase
  const code = error?.code
  const status = statusForProbe(available, loggedIn, code)
  const errorCode = narrowErrorCode(code)
  const detail = error?.message ?? (status === 'ready' ? '' : loginHint)
  const copyCommand = copyCommandFor(kind, loggedIn, error)
  return {
    id,
    name: accountLabel,
    accountLabel,
    kind,
    status,
    detail,
    ...(errorCode === undefined ? {} : { errorCode }),
    ...(copyCommand === undefined ? {} : { copyCommand }),
    ...(inUseCount === undefined ? {} : { inUseCount }),
    ...(loginCommand === undefined || loginCommand.trim() === '' ? {} : { loginCommand }),
  }
}

function groupAccounts(rows: readonly ConnectionAccountUiRow[]): ConnectionProviderGroupUi[] {
  const byProvider = new Map<ConnectionView['kind'], ConnectionAccountUiRow[]>()
  for (const row of rows) {
    const kind = row.kind as ConnectionView['kind']
    const list = byProvider.get(kind) ?? []
    list.push(row)
    byProvider.set(kind, list)
  }
  const order: ConnectionView['kind'][] = ['claude', 'codex', 'cursor', 'opencode', 'dsh']
  const groups: ConnectionProviderGroupUi[] = []
  for (const provider of order) {
    const accounts = byProvider.get(provider)
    if (accounts === undefined || accounts.length === 0) continue
    groups.push({
      provider,
      providerName: runnerLabel(provider),
      accounts,
    })
  }
  for (const [provider, accounts] of byProvider) {
    if (order.includes(provider)) continue
    groups.push({ provider, providerName: runnerLabel(provider), accounts })
  }
  return groups
}

/** Host multi-account bundle → grouped UI rows. */
export function connectionAccountsBundleToUi(bundle: ConnectionAccountsBundleView): ConnectionsAccountsUi {
  const wire = bundle as ConnectionAccountsBundleView & HostBundleExtras
  const rows = bundle.accounts.map((row) => {
    const extra = row as typeof row & HostAccountExtras
    return accountRowFromProbe(
      row.id,
      row.provider,
      row.label,
      row.available,
      row.loggedIn,
      row.phase,
      row.loginHint,
      row.error,
      row.inUseCount,
      extra.loginCommand,
    )
  })
  const personaPolicies = (wire.personaPolicies ?? []).map(row => ({ personaId: row.personaId, policy: row.policy }))
  return {
    groups: groupAccounts(rows),
    swapPolicy: bundle.swapPolicy,
    swapPolicyScope: bundle.swapPolicyScope,
    legacySingleSeat: false,
    ...(personaPolicies.length === 0 ? {} : { personaPolicies }),
  }
}

function dedupeLegacyRows(rows: readonly ConnectionView[]): ConnectionView[] {
  const byId = new Map<string, ConnectionView>()
  for (const row of rows) {
    const prev = byId.get(row.id)
    const rank = (r: ConnectionView) => rowRank(
      statusForProbe(r.available, r.loggedIn, r.error?.code),
      r.phase,
    )
    if (prev === undefined || rank(row) > rank(prev)) byId.set(row.id, row)
  }
  const byKind = new Map<string, ConnectionView>()
  for (const row of byId.values()) {
    const prev = byKind.get(row.kind)
    const rank = (r: ConnectionView) => rowRank(
      statusForProbe(r.available, r.loggedIn, r.error?.code),
      r.phase,
    )
    if (prev === undefined || rank(row) > rank(prev)) byKind.set(row.kind, row)
  }
  return [...byKind.values()]
}

/** Test-only fallback when `listConnectionAccounts` is not on the mock. */
export function connectionAccountsFallbackFromConnections(
  rows: readonly ConnectionView[],
): ConnectionsAccountsUi {
  const uiRows = dedupeLegacyRows(rows).map(row => accountRowFromProbe(
    row.id,
    row.kind,
    runnerLabel(row.kind),
    row.available,
    row.loggedIn,
    row.phase,
    row.loginHint,
    row.error,
  ))
  return {
    groups: groupAccounts(uiRows),
    swapPolicy: 'next_on_limit',
    swapPolicyScope: 'workspace',
    legacySingleSeat: true,
  }
}

/** Flat entries for callers that still expect the old list shape. */
export function connectionsAccountsToFlatEntries(ui: ConnectionsAccountsUi): ConnectionEntry[] {
  return ui.groups.flatMap(g => g.accounts.map(({ accountLabel: _l, inUseCount: _u, ...entry }) => entry))
}
