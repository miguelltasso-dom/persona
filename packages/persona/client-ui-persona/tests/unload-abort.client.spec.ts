// @vitest-environment jsdom
// Probe P3: o fetch abortado pelo descarregamento da página não vira `console.error` no refresh; o resto continua sendo logado.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isAbortedByUnload, pageIsLeaving } from '../src/client/remote/unload-abort.ts'
import { createPersonaLiveStore, type PersonaLiveStore } from '../src/client/remote/persona-live-store.ts'

const fire = (name: string): void => { window.dispatchEvent(new Event(name)) }

beforeEach(() => { vi.useFakeTimers(); fire('pageshow') })
afterEach(() => { fire('pageshow'); vi.useRealTimers(); vi.restoreAllMocks() })

describe('isAbortedByUnload', () => {
  it('com a página viva, nenhum erro é "só o descarregamento"', () => {
    expect(pageIsLeaving()).toBe(false)
    expect(isAbortedByUnload(new TypeError('Failed to fetch'))).toBe(false)
    expect(isAbortedByUnload(new DOMException('aborted', 'AbortError'))).toBe(false)
  })

  it('depois de pagehide, o fetch abortado (TypeError ou AbortError) é só o descarregamento', () => {
    fire('pagehide')
    expect(pageIsLeaving()).toBe(true)
    expect(isAbortedByUnload(new TypeError('Failed to fetch'))).toBe(true)
    expect(isAbortedByUnload(new DOMException('aborted', 'AbortError'))).toBe(true)
  })

  it('um erro de verdade continua sendo erro, mesmo com a página saindo', () => {
    fire('pagehide')
    expect(isAbortedByUnload(new Error('host said no'))).toBe(false)
    expect(isAbortedByUnload(new RangeError('bug'))).toBe(false)
    expect(isAbortedByUnload('texto')).toBe(false)
  })

  it('voltar pelo cache de páginas (pageshow) tira a página do estado "saindo"', () => {
    fire('pagehide')
    fire('pageshow')
    expect(isAbortedByUnload(new TypeError('Failed to fetch'))).toBe(false)
  })

  it('beforeunload vale por 2 s: se a saída foi cancelada, o erro real volta a aparecer', () => {
    fire('beforeunload')
    expect(isAbortedByUnload(new TypeError('Failed to fetch'))).toBe(true)
    vi.advanceTimersByTime(1_999)
    expect(isAbortedByUnload(new TypeError('Failed to fetch'))).toBe(true)
    vi.advanceTimersByTime(2)
    expect(isAbortedByUnload(new TypeError('Failed to fetch'))).toBe(false)
  })
})

describe('o refresh da store', () => {
  type Result = { ok: true; value: unknown }
  const ok = (value: unknown): Promise<Result> => Promise.resolve({ ok: true, value })
  let live: PersonaLiveStore | undefined
  afterEach(() => { live?.dispose(); live = undefined })

  async function refreshWith(failure: unknown, beforeFailing: () => void): Promise<void> {
    vi.useRealTimers()
    let failing = false
    const remote: Record<string, unknown> = {
      listProjects: () => ok([{ id: 'proj-pessoal' }]),
      listChannels: () => ok([{ id: 'geral', name: 'geral' }]),
      getOnboarding: () => ok({ firstUse: false, completed: true, personalProjectId: 'proj-pessoal', hasPersonalProject: true }),
      ping: () => ok({ protocol: 1 }),
      getOverviewNow: () => (failing ? Promise.reject(failure) : ok({ personas: [] })),
      getWhileAway: () => ok({ events: [] }),
      getOverview: () => ok({ needsYou: [], inProgress: [] }),
      listTeam: () => ok({ personas: [], members: [] }),
      listTasks: () => ok([]),
      listMessages: () => ok({ events: [] }),
      listDms: () => ok([]),
      markVisit: () => ok(true),
      followMessages: () => ({ async* [Symbol.asyncIterator]() { /* idle */ } }),
      listApprovals: () => ok([]),
      listDailySummaries: () => ok([]),
    }
    live = createPersonaLiveStore(remote as never)
    await live.bootstrap(() => {})
    failing = true
    beforeFailing()
    await live.refresh()
  }

  it('um fetch abortado pelo descarregamento da página não loga nada', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await refreshWith(new TypeError('Failed to fetch'), () => { fire('pagehide') })
    expect(log).not.toHaveBeenCalled()
  })

  it('o mesmo erro com a página viva continua em console.error', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await refreshWith(new TypeError('Failed to fetch'), () => {})
    expect(log).toHaveBeenCalledWith('[persona] refresh falhou', expect.any(TypeError))
  })

  it('um erro de verdade logo antes de sair continua em console.error', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await refreshWith(new Error('host said no'), () => { fire('pagehide') })
    expect(log).toHaveBeenCalledWith('[persona] refresh falhou', expect.any(Error))
  })
})
