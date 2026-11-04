/**
 * Estado real da IA para a pílula do rodapé do rail (UX-BEYOND A-5, NAV-SPEC regra 6): "Claude · 82% livre",
 * "Sem IA conectada · Conectar" ou "Conferindo a IA…". Puro + um observável fino sobre o Remote.
 *
 * Regras (Muse, 04/11):
 * - nunca "sem IA" antes de o host dizer `unavailable` (checking/unknown viram `checking`);
 * - sem cota oficial publicada o número é `null` (a pílula mostra "—"), nunca 0% inventado;
 * - "% livre" é a janela mais apertada da conta; com mais de uma conta do motor vale a que ainda tem mais folga.
 */
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { ConnectionView, OfficialQuotaView } from '@deepseek-ai/dsh-persona-host/types'
import { unwrapRemote } from '../data/remote-call.ts'
import { isRemoteResult } from '../remote/persona-remote-unwrap.ts'
import {
  fetchEngineStatus,
  type EngineRemoteWire,
  type EngineScope,
  type EngineStatusUi,
} from '../remote/engine-status.ts'
import { runnerLabel } from '../team/engine-label.ts'

export type RailAiStatus =
  | { readonly kind: 'checking' }
  | { readonly kind: 'unavailable' }
  | {
    readonly kind: 'ready'
    /** Nome legível do motor ("Claude"); `null` quando o host não listou as conexões. */
    readonly engine: string | null
    /** 0–100, `null` quando o motor não publica cota. */
    readonly freePct: number | null
    /** O motor parou no limite (cota esgotada): o ponto fica âmbar mesmo sem número. */
    readonly limited: boolean
  }

export const RAIL_AI_CHECKING: RailAiStatus = { kind: 'checking' }

/** Abaixo disso o ponto da pílula vira âmbar (warning) com o mesmo texto. */
export const LOW_FREE_PCT = 20

export interface RailAiRemote extends EngineRemoteWire {
  getOfficialQuota?(request: EngineScope): unknown
}

const providerKey = (provider: string): string => provider.replace(/^oar:/u, '').toLowerCase()

/** Folga (0–100) da janela mais apertada de cada conta do motor; vale a conta com mais folga. `null` sem número oficial. */
export function freePercentFromQuotas(quotas: readonly OfficialQuotaView[] | null, kind: string): number | null {
  if (quotas === null) return null
  let best: number | null = null
  for (const view of quotas) {
    if (providerKey(view.provider) !== providerKey(kind)) continue
    const used = view.windows
      .map(window => window.usedPercent)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    if (used.length === 0) continue
    const free = Math.max(0, Math.min(100, Math.round(100 - Math.max(...used))))
    if (best === null || free > best) best = free
  }
  return best
}

const isUsable = (connection: ConnectionView): boolean =>
  connection.phase === 'ready' && connection.available && connection.loggedIn && connection.error === undefined

/** Lê o estado do host e escolhe o que a pílula diz. */
export function deriveRailAiStatus(
  engine: EngineStatusUi,
  connections: readonly ConnectionView[] | null,
  quotas: readonly OfficialQuotaView[] | null,
): RailAiStatus {
  if (engine.readiness === 'ready') {
    const connection = connections?.find(isUsable)
    if (connection === undefined) return { kind: 'ready', engine: null, freePct: null, limited: false }
    return { kind: 'ready', engine: runnerLabel(connection.kind), freePct: freePercentFromQuotas(quotas, connection.kind), limited: false }
  }
  if (engine.readiness === 'unavailable') {
    if (engine.reason !== 'quota_exhausted') return { kind: 'unavailable' }
    // Conectada, mas parada no limite: dizer "sem IA" seria falso.
    const connection = connections?.find(card => card.error?.code === 'quota_exhausted') ?? connections?.find(card => card.available && card.loggedIn)
    if (connection === undefined) return { kind: 'unavailable' }
    return { kind: 'ready', engine: runnerLabel(connection.kind), freePct: freePercentFromQuotas(quotas, connection.kind), limited: true }
  }
  return RAIL_AI_CHECKING
}

export function sameRailAiStatus(a: RailAiStatus, b: RailAiStatus): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'ready' && b.kind === 'ready') return a.engine === b.engine && a.freePct === b.freePct && a.limited === b.limited
  return true
}

/** O ponto da pílula fica âmbar: pouca folga ou parado no limite. */
export function railAiNeedsWarning(status: RailAiStatus): boolean {
  if (status.kind === 'unavailable') return true
  if (status.kind !== 'ready') return false
  return status.limited || (status.freePct !== null && status.freePct < LOW_FREE_PCT)
}

export interface RailAiSource {
  readonly remote: RailAiRemote | undefined
  /** Escopo do tenant (ou `null` antes de o host responder ao bootstrap). */
  readonly scope: () => EngineScope | null
  /** Avisa quando o escopo pode ter mudado, para a primeira leitura sair assim que o tenant existe. */
  readonly subscribeScope: (listener: () => void) => () => void
}

export interface RailAiTiming {
  /** Intervalo enquanto a IA não está pronta. */
  readonly pollMs: number
  /** Intervalo com a IA pronta (a cota muda devagar; o banner do #geral também lê o estado). */
  readonly readyPollMs: number
}

export const RAIL_AI_TIMING: RailAiTiming = { pollMs: 4_000, readyPollMs: 30_000 }

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

/** Uma leitura completa: estado da IA e, quando há motor, conexões e cota oficial (falha de cota = sem número). */
export async function readRailAiStatus(remote: RailAiRemote, scope: EngineScope): Promise<{ readonly status: RailAiStatus; readonly engine: EngineStatusUi }> {
  const engine = await fetchEngineStatus(remote, scope)
  if (engine.readiness === 'checking' || engine.readiness === 'unknown') {
    return { status: RAIL_AI_CHECKING, engine }
  }
  const [connections, quotas] = await Promise.all([
    readList<ConnectionView>(remote.listConnections === undefined ? undefined : () => remote.listConnections?.(scope)),
    readList<OfficialQuotaView>(remote.getOfficialQuota === undefined ? undefined : () => remote.getOfficialQuota?.(scope)),
  ])
  return { status: deriveRailAiStatus(engine, connections, quotas), engine }
}

/**
 * Observável do estado da IA para o rail. Só consulta o host enquanto alguém assina; lê de novo ao voltar o foco da
 * janela (a pessoa volta do terminal onde fez o login) e a cada `readyPollMs`/`pollMs`.
 */
export function createRailAiObservable(source: RailAiSource, timing: RailAiTiming = RAIL_AI_TIMING): HostObservable<RailAiStatus> {
  let snapshot: RailAiStatus = RAIL_AI_CHECKING
  const listeners = new Set<() => void>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let disposeScope: (() => void) | undefined
  let inFlight = false
  let rerun = false
  let generation = 0

  const publish = (next: RailAiStatus): void => {
    if (sameRailAiStatus(snapshot, next)) return
    snapshot = next
    for (const listener of [...listeners]) listener()
  }

  const schedule = (delay: number): void => {
    if (timer !== undefined) clearTimeout(timer)
    if (delay > 0 && listeners.size > 0) timer = setTimeout(() => { void tick() }, delay)
  }

  const tick = async (): Promise<void> => {
    if (timer !== undefined) { clearTimeout(timer); timer = undefined }
    if (inFlight) { rerun = true; return }
    const scope = source.scope()
    const remote = source.remote
    if (remote === undefined || scope === null) { schedule(timing.pollMs); return }
    inFlight = true
    const mine = generation
    let delay = timing.pollMs
    try {
      const { status, engine } = await readRailAiStatus(remote, scope)
      if (mine === generation) {
        publish(status)
        delay = engine.readiness === 'ready' ? timing.readyPollMs : timing.pollMs
      }
    } catch {
      /* host ocupado: segue com o último estado e tenta de novo */
    } finally {
      inFlight = false
    }
    if (mine !== generation) return
    if (rerun) { rerun = false; void tick(); return }
    schedule(delay)
  }

  const onFocus = (): void => { void tick() }

  const start = (): void => {
    generation += 1
    disposeScope = source.subscribeScope(() => { void tick() })
    if (typeof window !== 'undefined') window.addEventListener('focus', onFocus)
    void tick()
  }

  const stop = (): void => {
    generation += 1
    if (timer !== undefined) { clearTimeout(timer); timer = undefined }
    disposeScope?.()
    disposeScope = undefined
    if (typeof window !== 'undefined') window.removeEventListener('focus', onFocus)
    inFlight = false
    rerun = false
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener)
      if (listeners.size === 1) start()
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) stop()
      }
    },
  }
}
