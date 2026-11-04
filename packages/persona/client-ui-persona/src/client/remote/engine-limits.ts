/**
 * Limites REAIS do motor para o `/limites` do composer e para a gaveta "Contexto usado" (UX-BEYOND IV-4 = P0-28).
 * Lê as mesmas cotas oficiais que a tela Uso (`getOfficialQuota` → `officialQuotasToProviderPools`) e devolve só o que o
 * provedor publicou: sem dado é `unavailable` (a tela mostra "—" e "Cota oficial indisponível"), nunca um número inventado.
 */
import type { ConnectionView, OfficialQuotaView } from '@deepseek-ai/dsh-persona-host/types'
import { unwrapRemote } from '../data/remote-call.ts'
import { officialQuotasToProviderPools } from '../data/adapters/usage-pooled.ts'
import type { PooledAccount } from '../primitives/Pooled.tsx'
import { runnerLabel } from '../team/engine-label.ts'
import { isRemoteResult } from './persona-remote-unwrap.ts'
import type { EngineScope } from './engine-status.ts'

export type EngineLimitsUi =
  | { readonly state: 'loading' }
  /** Sem IA pronta ou sem cota oficial publicada para ela. */
  | { readonly state: 'unavailable' }
  | {
    readonly state: 'ready'
    /** "Claude". */
    readonly engine: string
    /** Um segmento por conta, na mesma ordem nas duas janelas (a da próxima recarga primeiro). */
    readonly fiveHour: readonly PooledAccount[]
    readonly week: readonly PooledAccount[]
  }

export const ENGINE_LIMITS_LOADING: EngineLimitsUi = { state: 'loading' }
export const ENGINE_LIMITS_UNAVAILABLE: EngineLimitsUi = { state: 'unavailable' }

export interface EngineLimitsRemote {
  listConnections?(request: EngineScope): unknown
  getOfficialQuota?(request: EngineScope): unknown
}

const isUsable = (connection: ConnectionView): boolean =>
  connection.phase === 'ready' && connection.available && connection.loggedIn && connection.error === undefined

const providerKey = (provider: string): string => provider.replace(/^oar:/u, '').toLowerCase()
const reports = (accounts: readonly PooledAccount[]): boolean => accounts.some(account => account.leftPct !== undefined)

/** Escolhe o motor (a 1ª conexão pronta) e as janelas que ele publicou. Puro. */
export function deriveEngineLimits(
  connections: readonly ConnectionView[] | null,
  quotas: readonly OfficialQuotaView[] | null,
): EngineLimitsUi {
  const connection = connections?.find(isUsable) ?? connections?.find(card => card.error?.code === 'quota_exhausted')
  if (connection === undefined || quotas === null) return ENGINE_LIMITS_UNAVAILABLE
  const engine = runnerLabel(connection.kind)
  const forEngine = quotas.filter(view => providerKey(view.provider) === providerKey(connection.kind))
  const pool = officialQuotasToProviderPools(forEngine)[0]
  if (pool === undefined) return ENGINE_LIMITS_UNAVAILABLE
  // Conta sem apelido (legado) leva o nome do motor, nunca "default".
  const named = (accounts: readonly PooledAccount[]): readonly PooledAccount[] =>
    accounts.map(account => (account.id === 'default' ? { ...account, label: engine } : account))
  const fiveHour = named(pool.fiveHour)
  const week = named(pool.week)
  if (!reports(fiveHour) && !reports(week)) return ENGINE_LIMITS_UNAVAILABLE
  return { state: 'ready', engine, fiveHour, week }
}

async function settle(value: unknown): Promise<unknown> {
  const resolved = await Promise.resolve(value)
  return isRemoteResult(resolved) ? unwrapRemote(resolved) : resolved
}

async function readList<T>(call: (() => unknown) | undefined): Promise<readonly T[] | null> {
  if (call === undefined) return null
  try {
    const value = await settle(call())
    return Array.isArray(value) ? (value as readonly T[]) : null
  } catch {
    return null
  }
}

/** Uma leitura do host. Falha ou host sem o método = `unavailable` (honesto), nunca um número de exemplo. */
export async function loadEngineLimits(remote: EngineLimitsRemote | undefined, scope: EngineScope | null): Promise<EngineLimitsUi> {
  if (remote === undefined || scope === null) return ENGINE_LIMITS_UNAVAILABLE
  const [connections, quotas] = await Promise.all([
    readList<ConnectionView>(remote.listConnections === undefined ? undefined : () => remote.listConnections?.(scope)),
    readList<OfficialQuotaView>(remote.getOfficialQuota === undefined ? undefined : () => remote.getOfficialQuota?.(scope)),
  ])
  return deriveEngineLimits(connections, quotas)
}
