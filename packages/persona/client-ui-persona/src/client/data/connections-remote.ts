import type {
  AddConnectionAccountRequest,
  ConnectionAccountsBundleView,
  OfficialQuotaView,
  ProjectScopeRequest,
  RemoveConnectionAccountRequest,
  SetRunnerSwapPolicyRequest,
  UpdateConnectionAccountRequest,
} from '@deepseek-ai/dsh-persona-host/types'
import type { PersonaRemoteClient } from './lumen-inject.ts'
import { personaScreensRemote } from './persona-screens-remote.ts'
import { unwrapRemote } from './remote-call.ts'
import {
  connectionAccountsBundleToUi,
  enrichConnectionsAccountsWithQuotas,
  type ConnectionsAccountsUi,
} from './adapters/connection-accounts.ts'
import { quotaViewsToSeatPct } from './adapters/official-quota-seat.ts'

type ConnectionAccountsWire = PersonaRemoteClient & {
  listConnectionAccounts(request: ProjectScopeRequest): unknown
  setRunnerSwapPolicy(request: SetRunnerSwapPolicyRequest): unknown
  addConnectionAccount(request: AddConnectionAccountRequest): unknown
  removeConnectionAccount(request: RemoveConnectionAccountRequest): unknown
  updateConnectionAccount(request: UpdateConnectionAccountRequest): unknown
}

function asWire(persona: PersonaRemoteClient): ConnectionAccountsWire {
  return persona as ConnectionAccountsWire
}

function requireWire(persona: PersonaRemoteClient): ConnectionAccountsWire {
  const wire = asWire(persona)
  if (typeof wire.listConnectionAccounts !== 'function') {
    throw new Error('listConnectionAccounts-unavailable')
  }
  return wire
}

async function officialQuotaForAccount(
  persona: PersonaRemoteClient,
  scope: ProjectScopeRequest,
  provider: string,
  accountId: string,
): Promise<readonly OfficialQuotaView[]> {
  const screens = personaScreensRemote(persona)
  return unwrapRemote(
    await screens.getOfficialQuota({
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      provider,
      accountId,
    }),
  )
}

/** Load seats + per-account official quota (Forge WAVE2 remotes). */
export async function loadConnectionsAccountsUi(
  persona: PersonaRemoteClient,
  scope: ProjectScopeRequest,
): Promise<ConnectionsAccountsUi> {
  const wire = requireWire(persona)
  const bundle = await unwrapRemote(
    await wire.listConnectionAccounts(scope) as Parameters<typeof unwrapRemote>[0],
  ) as ConnectionAccountsBundleView
  const ui = connectionAccountsBundleToUi(bundle)
  const quotaByAccountId = new Map<string, ReturnType<typeof quotaViewsToSeatPct>>()
  await Promise.all(bundle.accounts.map(async (account) => {
    try {
      const views = await officialQuotaForAccount(persona, scope, account.provider, account.id)
      quotaByAccountId.set(account.id, quotaViewsToSeatPct(views))
    } catch {
      /* quota unavailable for this seat */
    }
  }))
  return enrichConnectionsAccountsWithQuotas(ui, quotaByAccountId)
}

/** Official quota rows for every stored seat (Uso e limites). */
export async function loadOfficialQuotasByAccount(
  persona: PersonaRemoteClient,
  scope: ProjectScopeRequest,
): Promise<readonly OfficialQuotaView[]> {
  const wire = requireWire(persona)
  const bundle = await unwrapRemote(
    await wire.listConnectionAccounts(scope) as Parameters<typeof unwrapRemote>[0],
  ) as ConnectionAccountsBundleView
  if (bundle.accounts.length === 0) {
    const screens = personaScreensRemote(persona)
    return unwrapRemote(await screens.getOfficialQuota(scope))
  }
  const chunks = await Promise.all(
    bundle.accounts.map(account => officialQuotaForAccount(persona, scope, account.provider, account.id)),
  )
  return chunks.flat()
}

export async function persistRunnerSwapPolicy(
  persona: PersonaRemoteClient,
  request: SetRunnerSwapPolicyRequest,
): Promise<void> {
  const wire = requireWire(persona)
  await unwrapRemote(await wire.setRunnerSwapPolicy(request) as Parameters<typeof unwrapRemote>[0])
}

export async function addConnectionAccountRemote(
  persona: PersonaRemoteClient,
  request: AddConnectionAccountRequest,
): Promise<ConnectionsAccountsUi> {
  const wire = requireWire(persona)
  const bundle = await unwrapRemote(
    await wire.addConnectionAccount(request) as Parameters<typeof unwrapRemote>[0],
  ) as ConnectionAccountsBundleView
  return connectionAccountsBundleToUi(bundle)
}

export async function updateConnectionAccountRemote(
  persona: PersonaRemoteClient,
  request: UpdateConnectionAccountRequest,
): Promise<void> {
  const wire = requireWire(persona)
  await unwrapRemote(await wire.updateConnectionAccount(request) as Parameters<typeof unwrapRemote>[0])
}

export async function removeConnectionAccountRemote(
  persona: PersonaRemoteClient,
  request: RemoveConnectionAccountRequest,
): Promise<void> {
  const wire = requireWire(persona)
  await unwrapRemote(await wire.removeConnectionAccount(request) as Parameters<typeof unwrapRemote>[0])
}
