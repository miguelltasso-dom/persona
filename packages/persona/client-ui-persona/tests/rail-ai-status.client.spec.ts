// @vitest-environment jsdom
// A-5 (NAV-SPEC regra 6): o estado da IA no rodapé do rail é o REAL: nunca "sem IA" antes do `unavailable` do host,
// nunca 0% inventado, a janela mais apertada vale, e o observável só consulta o host enquanto alguém assina.
import type { ConnectionView, OfficialQuotaView } from '@deepseek-ai/dsh-persona-host/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LOW_FREE_PCT,
  RAIL_AI_CHECKING,
  createRailAiObservable,
  deriveRailAiStatus,
  freePercentFromQuotas,
  railAiNeedsWarning,
  type RailAiRemote,
  type RailAiStatus,
} from '../src/client/shell/rail-ai-status.ts'
import { deriveRailPill, railAiRowText } from '../src/client/shell/rail-pill.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import type { EngineStatusUi } from '../src/client/remote/engine-status.ts'

const t = ((key: string, params?: Record<string, string | number>) => bindLocale(shellPt, key, params)) as never

const READY: EngineStatusUi = { readiness: 'ready', reason: null, pending: 0 }
const connection = (kind: ConnectionView['kind'], extra: Partial<ConnectionView> = {}): ConnectionView => ({
  id: kind, kind, available: true, loggedIn: true, loginHint: '', phase: 'ready', ...extra,
})
const quota = (provider: string, used: readonly (number | undefined)[], accountId?: string): OfficialQuotaView => ({
  provider,
  origin: 'official' as never,
  windows: used.map((usedPercent, index) => ({ id: `w${index}`, origin: 'official' as never, ...(usedPercent === undefined ? {} : { usedPercent }) })),
  ...(accountId === undefined ? {} : { accountId }),
})

describe('freePercentFromQuotas', () => {
  it('usa a janela mais apertada: 5 h a 18% e semana a 62% => 38% livre', () => {
    expect(freePercentFromQuotas([quota('claude', [18, 62])], 'claude')).toBe(38)
  })

  it('sem número oficial é null (a pílula mostra "—"), nunca 0%', () => {
    expect(freePercentFromQuotas(null, 'claude')).toBeNull()
    expect(freePercentFromQuotas([], 'claude')).toBeNull()
    expect(freePercentFromQuotas([quota('claude', [undefined])], 'claude')).toBeNull()
    expect(freePercentFromQuotas([quota('codex', [10])], 'claude')).toBeNull()
  })

  it('com mais de uma conta do motor vale a que ainda tem mais folga', () => {
    expect(freePercentFromQuotas([quota('claude', [90], 'a'), quota('claude', [30], 'b')], 'claude')).toBe(70)
  })

  it('limita a 0–100 e ignora o prefixo oar:', () => {
    expect(freePercentFromQuotas([quota('oar:claude', [140])], 'claude')).toBe(0)
    expect(freePercentFromQuotas([quota('claude', [-5])], 'claude')).toBe(100)
  })
})

describe('deriveRailAiStatus', () => {
  it('conferindo ou desconhecido nunca vira "sem IA"', () => {
    expect(deriveRailAiStatus({ readiness: 'checking', reason: null, pending: 0 }, null, null)).toEqual(RAIL_AI_CHECKING)
    expect(deriveRailAiStatus({ readiness: 'unknown', reason: null, pending: 0 }, [], [])).toEqual(RAIL_AI_CHECKING)
  })

  it('pronta: o nome do motor e a folga real', () => {
    expect(deriveRailAiStatus(READY, [connection('claude')], [quota('claude', [18])])).toEqual({ kind: 'ready', engine: 'Claude', freePct: 82, limited: false })
  })

  it('pronta sem cota publicada: motor com freePct null', () => {
    expect(deriveRailAiStatus(READY, [connection('codex')], [])).toEqual({ kind: 'ready', engine: 'Codex', freePct: null, limited: false })
  })

  it('pronta mas as conexões não vieram: sem nome, sem número', () => {
    expect(deriveRailAiStatus(READY, null, null)).toEqual({ kind: 'ready', engine: null, freePct: null, limited: false })
  })

  it('nenhuma IA ou login pendente é "unavailable"', () => {
    expect(deriveRailAiStatus({ readiness: 'unavailable', reason: 'none_connected', pending: 0 }, [], [])).toEqual({ kind: 'unavailable' })
    expect(deriveRailAiStatus({ readiness: 'unavailable', reason: 'login_required', pending: 0 }, [connection('claude', { loggedIn: false })], [])).toEqual({ kind: 'unavailable' })
  })

  it('cota esgotada continua conectada: motor + número real + limited (não diz "sem IA")', () => {
    const exhausted = connection('claude', { error: { code: 'quota_exhausted' } as never })
    expect(deriveRailAiStatus({ readiness: 'unavailable', reason: 'quota_exhausted', pending: 0 }, [exhausted], [quota('claude', [100])]))
      .toEqual({ kind: 'ready', engine: 'Claude', freePct: 0, limited: true })
    expect(deriveRailAiStatus({ readiness: 'unavailable', reason: 'quota_exhausted', pending: 0 }, [exhausted], []))
      .toEqual({ kind: 'ready', engine: 'Claude', freePct: null, limited: true })
  })
})

describe('railAiNeedsWarning', () => {
  it(`abaixo de ${LOW_FREE_PCT}% livre, parado no limite ou sem IA: warning; o resto não`, () => {
    expect(railAiNeedsWarning({ kind: 'ready', engine: 'Claude', freePct: 19, limited: false })).toBe(true)
    expect(railAiNeedsWarning({ kind: 'ready', engine: 'Claude', freePct: 20, limited: false })).toBe(false)
    expect(railAiNeedsWarning({ kind: 'ready', engine: 'Claude', freePct: null, limited: true })).toBe(true)
    expect(railAiNeedsWarning({ kind: 'ready', engine: 'Claude', freePct: null, limited: false })).toBe(false)
    expect(railAiNeedsWarning({ kind: 'unavailable' })).toBe(true)
    expect(railAiNeedsWarning(RAIL_AI_CHECKING)).toBe(false)
  })
})

describe('deriveRailPill: um texto por vez, na ordem da Muse', () => {
  const ready: RailAiStatus = { kind: 'ready', engine: 'Claude', freePct: 82, limited: false }
  const base = { t, hostStatus: 'online' as const, awayText: null, ai: ready }

  it('equipe fora do ar vence tudo', () => {
    expect(deriveRailPill({ ...base, hostStatus: 'offline', awayText: 'Fora até 18h' })).toMatchObject({ tone: 'offline' })
  })

  it('"Fora até" vence a IA', () => {
    expect(deriveRailPill({ ...base, awayText: 'Fora até 18h', ai: { kind: 'unavailable' } })).toEqual({ text: 'Fora até 18h', tone: 'away' })
  })

  it('sem IA: "Sem IA conectada · Conectar" em warning', () => {
    expect(deriveRailPill({ ...base, ai: { kind: 'unavailable' } })).toEqual({ text: 'Sem IA conectada · Conectar', tone: 'warning' })
  })

  it('conferindo: "Conferindo a IA…" com o ponto lilás (pending), sem warning', () => {
    expect(deriveRailPill({ ...base, ai: RAIL_AI_CHECKING })).toEqual({ text: 'Conferindo a IA…', tone: 'pending' })
  })

  it('pronta: "Claude · 82% livre"; sem cota: "Claude · —"; pouca folga: mesmo texto, ponto warning', () => {
    expect(deriveRailPill(base)).toEqual({ text: 'Claude · 82% livre', tone: 'online' })
    expect(deriveRailPill({ ...base, ai: { ...ready, freePct: null } })).toEqual({ text: 'Claude · —', tone: 'online' })
    expect(deriveRailPill({ ...base, ai: { ...ready, freePct: 12 } })).toEqual({ text: 'Claude · 12% livre', tone: 'warning' })
  })

  it('sem fonte de IA (preview/testes): o "Conectado" de sempre', () => {
    expect(deriveRailPill({ ...base, ai: undefined })).toEqual({ text: 'Conectado', tone: 'online' })
  })

  it('a linha do popover não repete o "· Conectar" que o botão já diz', () => {
    expect(railAiRowText(t, { kind: 'unavailable' })).toBe('Sem IA conectada')
    expect(railAiRowText(t, ready)).toBe('Claude · 82% livre')
    expect(railAiRowText(t, undefined)).toBeNull()
  })
})

describe('createRailAiObservable', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  function fakeRemote(overrides: Partial<Record<keyof RailAiRemote, unknown>> = {}) {
    const getEngineStatus = vi.fn(() => ({ state: 'ready', pending: 0 }))
    const listConnections = vi.fn(() => [connection('claude')])
    const getOfficialQuota = vi.fn(() => [quota('claude', [18])])
    const remote = { getEngineStatus, listConnections, getOfficialQuota, ...overrides } as unknown as RailAiRemote
    return { remote, getEngineStatus, listConnections, getOfficialQuota }
  }

  const scope = { workspaceId: 'ws', projectId: 'p' }

  it('não consulta o host sem assinante; ao assinar lê o estado, a conexão e a cota', async () => {
    const { remote, getEngineStatus, getOfficialQuota } = fakeRemote()
    const observable = createRailAiObservable({ remote, scope: () => scope, subscribeScope: () => () => {} })
    expect(getEngineStatus).not.toHaveBeenCalled()
    expect(observable.getSnapshot()).toEqual(RAIL_AI_CHECKING)
    const listener = vi.fn()
    const off = observable.subscribe(listener)
    await vi.advanceTimersByTimeAsync(0)
    expect(observable.getSnapshot()).toEqual({ kind: 'ready', engine: 'Claude', freePct: 82, limited: false })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(getEngineStatus).toHaveBeenCalledWith(scope)
    expect(getOfficialQuota).toHaveBeenCalledWith(scope)
    off()
  })

  it('espera o tenant: sem escopo fica em "conferindo" e lê assim que ele chega', async () => {
    const { remote, getEngineStatus } = fakeRemote()
    let current: typeof scope | null = null
    let notify: () => void = () => {}
    const observable = createRailAiObservable({ remote, scope: () => current, subscribeScope: (l) => { notify = l; return () => {} } })
    observable.subscribe(() => {})
    await vi.advanceTimersByTimeAsync(0)
    expect(getEngineStatus).not.toHaveBeenCalled()
    expect(observable.getSnapshot()).toEqual(RAIL_AI_CHECKING)
    current = scope
    notify()
    await vi.advanceTimersByTimeAsync(0)
    expect(getEngineStatus).toHaveBeenCalledTimes(1)
    expect(observable.getSnapshot()).toMatchObject({ kind: 'ready' })
  })

  it('pronta relê a cada 30 s; não pronta, a cada 4 s', async () => {
    const { remote, getEngineStatus } = fakeRemote()
    const observable = createRailAiObservable({ remote, scope: () => scope, subscribeScope: () => () => {} })
    observable.subscribe(() => {})
    await vi.advanceTimersByTimeAsync(0)
    expect(getEngineStatus).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(29_000)
    expect(getEngineStatus).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(getEngineStatus).toHaveBeenCalledTimes(2)

    const down = fakeRemote({ getEngineStatus: vi.fn(() => ({ state: 'unavailable', reason: 'none_connected', pending: 0 })), listConnections: vi.fn(() => []) })
    const slow = createRailAiObservable({ remote: down.remote, scope: () => scope, subscribeScope: () => () => {} })
    slow.subscribe(() => {})
    await vi.advanceTimersByTimeAsync(0)
    expect(slow.getSnapshot()).toEqual({ kind: 'unavailable' })
    await vi.advanceTimersByTimeAsync(4_000)
    expect((down.remote.getEngineStatus as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(2)
  })

  it('para de consultar quando o último assinante sai', async () => {
    const { remote, getEngineStatus } = fakeRemote()
    const observable = createRailAiObservable({ remote, scope: () => scope, subscribeScope: () => () => {} })
    const off = observable.subscribe(() => {})
    await vi.advanceTimersByTimeAsync(0)
    off()
    await vi.advanceTimersByTimeAsync(120_000)
    expect(getEngineStatus).toHaveBeenCalledTimes(1)
  })

  it('host sem os métodos ou com falha: fica em "conferindo", sem lançar e sem afirmar "sem IA"', async () => {
    const observable = createRailAiObservable({ remote: {} as RailAiRemote, scope: () => scope, subscribeScope: () => () => {} })
    observable.subscribe(() => {})
    await vi.advanceTimersByTimeAsync(0)
    expect(observable.getSnapshot()).toEqual(RAIL_AI_CHECKING)
    const broken = fakeRemote({ getEngineStatus: vi.fn(() => { throw new Error('host ocupado') }) })
    const failing = createRailAiObservable({ remote: broken.remote, scope: () => scope, subscribeScope: () => () => {} })
    failing.subscribe(() => {})
    await vi.advanceTimersByTimeAsync(0)
    expect(failing.getSnapshot()).toEqual(RAIL_AI_CHECKING)
  })

  it('falha só na cota: o motor aparece com "—", nunca 0%', async () => {
    const { remote } = fakeRemote({ getOfficialQuota: vi.fn(() => { throw new Error('sem cota') }) })
    const observable = createRailAiObservable({ remote, scope: () => scope, subscribeScope: () => () => {} })
    observable.subscribe(() => {})
    await vi.advanceTimersByTimeAsync(0)
    expect(observable.getSnapshot()).toEqual({ kind: 'ready', engine: 'Claude', freePct: null, limited: false })
  })

  it('ao voltar o foco da janela relê na hora (a pessoa volta do terminal do login)', async () => {
    const { remote, getEngineStatus } = fakeRemote()
    const observable = createRailAiObservable({ remote, scope: () => scope, subscribeScope: () => () => {} })
    observable.subscribe(() => {})
    await vi.advanceTimersByTimeAsync(0)
    expect(getEngineStatus).toHaveBeenCalledTimes(1)
    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(0)
    expect(getEngineStatus).toHaveBeenCalledTimes(2)
  })
})
