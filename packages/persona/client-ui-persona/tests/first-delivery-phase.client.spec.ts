import { describe, expect, it } from 'vitest'
import {
  ENGINE_STATUS_UNKNOWN,
  engineStatusFromConnections,
  engineStatusFromWire,
  fetchEngineStatus,
  retryEngineStatus,
} from '../src/client/remote/engine-status.ts'
import { nextFirstDeliveryPhase, runErrorForFailed, type FirstDeliveryPhaseInput } from '../src/client/onboarding/first-delivery-phase.ts'
import type { FirstDeliveryView } from '../src/client/remote/persona-remote-types.ts'

const READY = { readiness: 'ready', reason: null, pending: 0 } as const
const NO_AI = { readiness: 'unavailable', reason: 'none_connected', pending: 0 } as const

const delivery = (status: FirstDeliveryView['status']): FirstDeliveryView => ({
  status,
  eventId: 'first-delivery',
  ticketId: 'ticket-1',
  title: 'Resumo da empresa',
  personaId: 'p-nina',
  personaName: 'Nina',
  feedEventId: '',
})

const base: FirstDeliveryPhaseInput = {
  phase: 'intro',
  requested: false,
  engine: READY,
  delivery: null,
  milestoneDone: false,
  freshRunError: false,
  slowElapsed: false,
  retryGrace: false,
}
const next = (patch: Partial<FirstDeliveryPhaseInput>) => nextFirstDeliveryPhase({ ...base, ...patch })

describe('nextFirstDeliveryPhase (FR-2: fase vem do estado real do host)', () => {
  it('antes do pedido: sem IA → needsEngine; IA pronta, sondando ou desconhecida → intro (nunca afirma "sem IA" sem saber)', () => {
    expect(next({ engine: NO_AI })).toBe('needsEngine')
    expect(next({ engine: READY })).toBe('intro')
    expect(next({ engine: { readiness: 'checking', reason: null, pending: 0 } })).toBe('intro')
    expect(next({ engine: ENGINE_STATUS_UNKNOWN })).toBe('intro')
  })

  it('depois do pedido: working, e slow só quando passou dos 45 s', () => {
    expect(next({ requested: true, delivery: delivery('working') })).toBe('working')
    expect(next({ requested: true, delivery: delivery('working'), slowElapsed: true })).toBe('slow')
  })

  it('marco ready do host (ou cartão Concluído) celebra, mesmo vindo de slow ou de needsEngine', () => {
    expect(next({ requested: true, delivery: delivery('ready') })).toBe('celebrate')
    expect(next({ requested: true, delivery: delivery('working'), milestoneDone: true, slowElapsed: true })).toBe('celebrate')
    expect(next({ requested: true, delivery: delivery('ready'), engine: NO_AI })).toBe('celebrate')
  })

  it('celebrate é terminal', () => {
    expect(next({ phase: 'celebrate', delivery: delivery('failed'), requested: true })).toBe('celebrate')
  })

  it('marco failed do host ou erro tipado NOVO levam a failed', () => {
    expect(next({ requested: true, delivery: delivery('failed') })).toBe('failed')
    expect(next({ requested: true, delivery: delivery('working'), freshRunError: true })).toBe('failed')
  })

  it('"Tentar de novo": o failed antigo do host não derruba de volta durante a janela de retry', () => {
    expect(next({ requested: true, delivery: delivery('failed'), retryGrace: true })).toBe('working')
    expect(next({ requested: true, delivery: delivery('failed'), retryGrace: false })).toBe('failed')
  })

  it('pedido retido sem IA (FR-3): needsEngine em vez de ficar "trabalhando" para sempre; volta a working quando a IA conecta', () => {
    expect(next({ requested: true, delivery: delivery('working'), engine: NO_AI })).toBe('needsEngine')
    expect(next({ requested: true, delivery: delivery('working'), engine: READY })).toBe('working')
  })

  it('IA indisponível mas o host já selou failed: mostra o erro (tem ação), não needsEngine', () => {
    expect(next({ requested: true, delivery: delivery('failed'), engine: NO_AI })).toBe('failed')
  })

  it('o pedido que nem chegou ao host (completeOnboarding falhou) nunca deixa a pessoa sem saída', () => {
    expect(next({ requested: true, startFailed: true })).toBe('failed')
  })
})

describe('runErrorForFailed', () => {
  it('usa o erro tipado mais recente do #geral', () => {
    expect(runErrorForFailed({ code: 'quota_exhausted', provider: 'Codex' }, READY)).toEqual({ code: 'quota_exhausted', provider: 'Codex' })
  })

  it('sem erro no fio, descreve pelo motivo real do host — nunca inventa "não logado no Claude"', () => {
    const label = { providerLabel: 'motor de IA' }
    expect(runErrorForFailed(undefined, { readiness: 'unavailable', reason: 'login_required', pending: 0 }, label))
      .toEqual({ code: 'not_logged_in', provider: 'motor de IA' })
    expect(runErrorForFailed(undefined, { readiness: 'unavailable', reason: 'quota_exhausted', pending: 0 }, label))
      .toEqual({ code: 'quota_exhausted', provider: 'motor de IA' })
    expect(runErrorForFailed(undefined, NO_AI, label)).toEqual({ code: 'cli_not_found', provider: 'motor de IA' })
    expect(runErrorForFailed(undefined, READY, label)).toEqual({ code: 'engine_unavailable', provider: 'motor de IA' })
  })

  it('falha ao iniciar o pedido vira app_offline', () => {
    expect(runErrorForFailed(undefined, READY, { startFailed: true })).toEqual({ code: 'app_offline' })
  })
})

describe('engine-status (FR-3: estado real da IA)', () => {
  it('interpreta o EngineStatusView do host e descarta formato estranho como unknown', () => {
    expect(engineStatusFromWire({ state: 'ready', reason: null, pending: 0 })).toEqual(READY)
    expect(engineStatusFromWire({ state: 'unavailable', reason: 'login_required', pending: 2 }))
      .toEqual({ readiness: 'unavailable', reason: 'login_required', pending: 2 })
    expect(engineStatusFromWire({ state: 'checking', reason: null, pending: 1 }))
      .toEqual({ readiness: 'checking', reason: null, pending: 1 })
    expect(engineStatusFromWire({ state: 'unavailable', reason: 'weird', pending: -3 }))
      .toEqual({ readiness: 'unavailable', reason: 'none_connected', pending: 0 })
    expect(engineStatusFromWire(null)).toEqual(ENGINE_STATUS_UNKNOWN)
    expect(engineStatusFromWire({ state: 'nope' })).toEqual(ENGINE_STATUS_UNKNOWN)
  })

  it('espelha o cachedEngineReadiness do host a partir dos cartões de conexão', () => {
    const card = (patch: Record<string, unknown>) => ({
      id: 'claude', kind: 'claude', available: true, loggedIn: true, loginHint: '', phase: 'ready', ...patch,
    }) as never
    expect(engineStatusFromConnections([])).toEqual(ENGINE_STATUS_UNKNOWN)
    expect(engineStatusFromConnections([card({})])).toEqual(READY)
    expect(engineStatusFromConnections([card({ loggedIn: false }), card({ id: 'codex', kind: 'codex', phase: 'checking' })]).readiness).toBe('checking')
    expect(engineStatusFromConnections([card({ loggedIn: false })])).toEqual({ readiness: 'unavailable', reason: 'login_required', pending: 0 })
    expect(engineStatusFromConnections([card({ available: false, loggedIn: false })])).toEqual(NO_AI)
    expect(engineStatusFromConnections([card({ loggedIn: false, error: { code: 'quota_exhausted' } })]).reason).toBe('quota_exhausted')
  })

  it('fetchEngineStatus prefere getEngineStatus, cai em listConnections e nunca lança', async () => {
    const scope = { workspaceId: 'ws', projectId: 'p' }
    expect(await fetchEngineStatus({ getEngineStatus: () => ({ ok: true, value: { state: 'unavailable', reason: 'none_connected', pending: 1 } }) }, scope))
      .toEqual({ readiness: 'unavailable', reason: 'none_connected', pending: 1 })
    expect(await fetchEngineStatus({ listConnections: () => Promise.resolve({ ok: true, value: [{ id: 'claude', kind: 'claude', available: true, loggedIn: true, loginHint: '', phase: 'ready' }] }) }, scope))
      .toEqual(READY)
    expect(await fetchEngineStatus({ getEngineStatus: () => Promise.reject(new Error('boom')) }, scope)).toEqual(ENGINE_STATUS_UNKNOWN)
    expect(await fetchEngineStatus({ getEngineStatus: () => ({ ok: false, error: { code: 'forbidden', message: 'x' } }) }, scope)).toEqual(ENGINE_STATUS_UNKNOWN)
    expect(await fetchEngineStatus({}, scope)).toEqual(ENGINE_STATUS_UNKNOWN)
  })

  it('retryEngineStatus força a checagem; sem o método, relê em cache', async () => {
    const scope = { workspaceId: 'ws', projectId: 'p' }
    let forced = 0
    const out = await retryEngineStatus({
      retryEngine: () => { forced += 1; return { state: 'ready', reason: null, pending: 0 } },
      getEngineStatus: () => ({ state: 'unavailable', reason: 'none_connected', pending: 0 }),
    }, scope)
    expect(forced).toBe(1)
    expect(out).toEqual(READY)
    expect(await retryEngineStatus({ getEngineStatus: () => ({ state: 'checking', reason: null, pending: 0 }) }, scope))
      .toEqual({ readiness: 'checking', reason: null, pending: 0 })
  })
})
