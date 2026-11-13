import { createFakeRunner } from '@deepseek-ai/dsh-persona-runners'
import { describe, expect, it } from 'vitest'
import type { HostRunnerRequest } from '../src/runner.ts'
import { openJourney, say, seedJourney } from './journeys/journey-host.ts'

/**
 * M4 / 24 h (host): after N requests the number of resident runners (each one is a CLI process in production) comes back to the ceiling AT REST, then to zero when nobody asks again, and the next request reopens by itself.
 * Real host, fake runners that only count how many were opened and how many were released; the host clock moves, the sweep is called by hand (production runs it on an unref'd timer).
 */
const START = Date.parse('2026-11-12T15:00:00.000Z')
const NAMES = ['Lia', 'Bia', 'Cai', 'Duda', 'Edu', 'Fabi']

function bed(): { readonly h: ReturnType<typeof openJourney>; readonly clock: { ms: number }; readonly opened: Array<{ readonly request: HostRunnerRequest; disposed: boolean }>; readonly live: () => number } {
  const clock = { ms: START }
  const h = openJourney(new Date(START).toISOString())
  h.orchestration.now = () => new Date(clock.ms).toISOString()
  h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
  seedJourney(h, NAMES.map((name, index) => ({ id: name.toLowerCase(), name, title: 'Equipe', ...(index === 0 ? { coordination: true } : {}) })))
  const opened: Array<{ readonly request: HostRunnerRequest; disposed: boolean }> = []
  h.orchestration.runnerFactory = (request?: HostRunnerRequest) => {
    const inner = createFakeRunner()
    const record = { request: request as HostRunnerRequest, disposed: false }
    opened.push(record)
    return Promise.resolve(new Proxy(inner, {
      get(target, prop, receiver) {
        if (prop === 'dispose') return () => { record.disposed = true; return Promise.resolve() }
        return Reflect.get(target, prop, receiver) as unknown
      },
    }))
  }
  return { h, clock, opened, live: () => opened.filter(record => !record.disposed).length }
}

describe('M4 host: the resident runners have a ceiling and let go when idle', () => {
  it('N requests to 6 personas: the host keeps what it is allowed, the released ones are really disposed (no phantom CLI), the registry and the live count agree', async () => {
    const { h, clock, opened, live } = bed()
    for (const [index, name] of NAMES.entries()) say(h, `m${String(index)}`, `@${name} olá, tudo bem?`)
    await h.orchestration.work
    expect(opened.length, 'the requests did open runners').toBeGreaterThanOrEqual(3)
    expect(h.orchestration.warmPool.resident()).toBe(h.orchestration.warmRunners.size)
    h.orchestration.warmLimits = () => ({ globalCap: 3 })
    clock.ms += 2 * 60_000 // two minutes later: inside the idle limit, so only the ceiling acts
    h.orchestration.warmPool.sweep()
    expect(live(), 'resident CLIs back to the ceiling at rest').toBeLessThanOrEqual(3)
    expect(h.orchestration.warmRunners.size, 'the registry and the live count agree').toBe(live())
  })

  it('nobody asks for a quarter of an hour: everything idle is released, and the next request reopens a runner by itself', async () => {
    const { h, clock, opened, live } = bed()
    for (const [index, name] of NAMES.entries()) say(h, `m${String(index)}`, `@${name} olá, tudo bem?`)
    await h.orchestration.work
    const before = opened.length
    clock.ms += 16 * 60_000
    h.orchestration.warmPool.sweep()
    expect(live(), 'at rest, nothing stays resident').toBe(0)
    expect(h.orchestration.warmRunners.size).toBe(0)
    say(h, 'again', '@Lia e agora, como estamos?')
    await h.orchestration.work
    expect(opened.length, 'the conversation continues on a new runner').toBeGreaterThan(before)
    expect(live()).toBeGreaterThanOrEqual(1)
  })

  it('the Station shows the resident runners', async () => {
    const { h } = bed()
    say(h, 'm0', '@Lia olá')
    await h.orchestration.work
    const view = await h.station.view()
    expect(view.warm?.resident, 'resident runners on the Station').toBe(h.orchestration.warmRunners.size)
    expect(view.warm?.cap).toBeGreaterThanOrEqual(3)
  })
})
