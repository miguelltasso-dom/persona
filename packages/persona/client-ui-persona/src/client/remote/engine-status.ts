/**
 * "Tem uma IA conectada?" no cliente (FR-2/FR-3, V1-P0). Lê o estado REAL do host (`getEngineStatus`,
 * cache de conexões) e nunca afirma "sem IA" enquanto o host ainda está sondando (`checking`) ou quando
 * não conseguiu responder (`unknown`): só `unavailable` bloqueia o primeiro pedido e mostra a faixa.
 * Puro + funções async finas sobre o Remote; sem React aqui (o hook mora em `use-engine-status.ts`).
 */
import type { ConnectionView } from '@deepseek-ai/dsh-persona-host/types'
import { unwrapRemote } from '../data/remote-call.ts'
import { isRemoteResult } from './persona-remote-unwrap.ts'

export type EngineReadiness = 'ready' | 'checking' | 'unavailable' | 'unknown'
export type EngineUnavailableReasonUi = 'none_connected' | 'login_required' | 'quota_exhausted'

export interface EngineStatusUi {
  readonly readiness: EngineReadiness
  /** Só vem quando `readiness === 'unavailable'`. */
  readonly reason: EngineUnavailableReasonUi | null
  /** Pedidos retidos esperando uma IA (retomam sozinhos quando ela conectar). */
  readonly pending: number
}

export const ENGINE_STATUS_UNKNOWN: EngineStatusUi = { readiness: 'unknown', reason: null, pending: 0 }

export interface EngineScope {
  readonly workspaceId: string
  readonly projectId: string
}

/** Superfície mínima e opcional do Remote (os métodos do FR-3 podem faltar em hosts/fakes antigos). */
export interface EngineRemoteWire {
  getEngineStatus?(request: EngineScope): unknown
  retryEngine?(request: EngineScope): unknown
  listConnections?(request: EngineScope): unknown
}

const REASONS: readonly EngineUnavailableReasonUi[] = ['none_connected', 'login_required', 'quota_exhausted']

/** Valida o `EngineStatusView` do host; qualquer coisa estranha vira `unknown` (nunca bloqueia). */
export function engineStatusFromWire(view: unknown): EngineStatusUi {
  if (typeof view !== 'object' || view === null) return ENGINE_STATUS_UNKNOWN
  const row = view as { state?: unknown; reason?: unknown; pending?: unknown }
  const pending = typeof row.pending === 'number' && Number.isFinite(row.pending) && row.pending > 0
    ? Math.floor(row.pending)
    : 0
  if (row.state === 'ready') return { readiness: 'ready', reason: null, pending }
  if (row.state === 'checking') return { readiness: 'checking', reason: null, pending }
  if (row.state === 'unavailable') {
    const reason = REASONS.find(candidate => candidate === row.reason) ?? 'none_connected'
    return { readiness: 'unavailable', reason, pending }
  }
  return ENGINE_STATUS_UNKNOWN
}

/**
 * Espelho cliente do `cachedEngineReadiness` do host, para quando `getEngineStatus` não existe.
 * Lista vazia = não sabemos (não afirma "sem IA").
 */
export function engineStatusFromConnections(connections: readonly ConnectionView[]): EngineStatusUi {
  if (connections.length === 0) return ENGINE_STATUS_UNKNOWN
  if (connections.some(card => card.phase === 'ready' && card.available && card.loggedIn && card.error === undefined)) {
    return { readiness: 'ready', reason: null, pending: 0 }
  }
  if (connections.some(card => card.phase === 'checking')) return { readiness: 'checking', reason: null, pending: 0 }
  if (connections.some(card => card.error?.code === 'quota_exhausted')) {
    return { readiness: 'unavailable', reason: 'quota_exhausted', pending: 0 }
  }
  if (connections.some(card => card.available)) return { readiness: 'unavailable', reason: 'login_required', pending: 0 }
  return { readiness: 'unavailable', reason: 'none_connected', pending: 0 }
}

async function settle(value: unknown): Promise<unknown> {
  const resolved = await Promise.resolve(value)
  return isRemoteResult(resolved) ? unwrapRemote(resolved) : resolved
}

/**
 * Lê o estado da IA: `getEngineStatus` (cache do host, sem sondar) e, na falta dele, `listConnections`.
 * Falha de leitura = `unknown`, para a UI seguir sem bloquear a pessoa.
 */
export async function fetchEngineStatus(remote: EngineRemoteWire, scope: EngineScope): Promise<EngineStatusUi> {
  try {
    if (remote.getEngineStatus !== undefined) {
      return engineStatusFromWire(await settle(remote.getEngineStatus(scope)))
    }
    if (remote.listConnections !== undefined) {
      const connections = await settle(remote.listConnections(scope))
      return Array.isArray(connections) ? engineStatusFromConnections(connections as readonly ConnectionView[]) : ENGINE_STATUS_UNKNOWN
    }
  } catch {
    /* host ocupado ou sem o método: não bloqueia */
  }
  return ENGINE_STATUS_UNKNOWN
}

/** "Conferir de novo": força uma checagem no host e devolve o estado (retoma os pedidos retidos se a IA estiver pronta). */
export async function retryEngineStatus(remote: EngineRemoteWire, scope: EngineScope): Promise<EngineStatusUi> {
  try {
    if (remote.retryEngine !== undefined) return engineStatusFromWire(await settle(remote.retryEngine(scope)))
  } catch {
    /* cai na leitura em cache */
  }
  return fetchEngineStatus(remote, scope)
}

/** Igualdade rasa (evita re-render a cada poll quando nada mudou). */
export function sameEngineStatus(a: EngineStatusUi, b: EngineStatusUi): boolean {
  return a.readiness === b.readiness && a.reason === b.reason && a.pending === b.pending
}
