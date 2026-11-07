/**
 * BUG-CRASH-1 (Flint 13:15, Keel 13:19), with NO model: the app closed by itself (exit 1) when the REPORT of a failed run hit a store
 * error. `settleTask` called `failReply` inside its own catch with nothing around it, so whatever the report threw became an unhandled
 * rejection of the work chain: the process died ("fatal load failure") and, short of that, every later Task stayed behind a rejected
 * chain. The report of a failure is a courtesy to the person; it must never take the host down.
 *
 * The store here is made to refuse the failure line the way the field log shows it (`StoreError conflict: UNIQUE constraint failed:
 * event.stream_id, event.seq`). The Task fails for the usual first-use reason: the engine is not signed in (RunnerResolveError).
 */
import type { Runner, RunnerEvent } from '@deepseek-ai/dsh-persona-engine'
import { RunnerResolveError } from '@deepseek-ai/dsh-persona-runners'
import { StoreError } from '@deepseek-ai/dsh-persona-store'
import { expect, onTestFinished } from 'vitest'
import type PersonaHost from '../src/index.ts'
import type { HostRunnerRequest } from '../src/runner.ts'
import { it, openJourney, say, seedJourney } from './journeys/journey-host.ts'

const SEQ_CONFLICT = 'UNIQUE constraint failed: event.stream_id, event.seq'
const ID_CONFLICT = 'UNIQUE constraint failed: event.id'

type Refusal = 'seq-conflict' | 'line-already-stored' | 'none'

interface Rig {
  readonly h: PersonaHost
  readonly unhandled: unknown[]
  readonly settled: Array<{ ticketId: string; state: string }>
  /** What the store does with the next `coord-` line the host writes. */
  readonly refuse: (mode: Refusal) => void
  readonly heal: () => void
  /** The `coord-` lines the store was asked to write while it was refusing, by id. */
  readonly hits: string[]
}

function open(): Rig {
  const unhandled: unknown[] = []
  const onUnhandled = (reason: unknown): void => { unhandled.push(reason) }
  process.on('unhandledRejection', onUnhandled)
  onTestFinished(() => { process.off('unhandledRejection', onUnhandled) })

  const h = openJourney()
  seedJourney(h, [{ id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true }, { id: 'nina', name: 'Nina', title: 'Atendimento' }])
  h.product.updatePersona({ ...h.product.getPersona('nina')!, runner: { kind: 'cli', cli: 'claude', model: 'default' } }, 'pp')
  h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
  const scripted = h.orchestration.scripted
  h.orchestration.scripted = false
  onTestFinished(() => { h.orchestration.scripted = scripted })

  const settled: Array<{ ticketId: string; state: string }> = []
  h.orchestration.ticketSettled = info => { settled.push({ ticketId: info.ticketId, state: info.state }) }

  let mode: Refusal = 'none'
  const hits: string[] = []
  const append = h.events.append.bind(h.events)
  h.events.append = (input) => {
    if (mode === 'none' || !input.id.startsWith('coord-')) return append(input)
    hits.push(input.id)
    if (mode === 'seq-conflict') throw new StoreError('conflict', SEQ_CONFLICT)
    const stored = append(input) // the line IS stored, then the store reports the duplicate (a retry of the same line)
    void stored
    throw new StoreError('conflict', ID_CONFLICT)
  }
  const failing = (): Promise<Runner> => Promise.reject(new RunnerResolveError('not_logged_in', 'claude'))
  h.orchestration.runnerFactory = failing
  let said: string | undefined
  Object.defineProperty(h.orchestration, 'liveText', { configurable: true, get: () => { const text = said; said = undefined; return text }, set: () => undefined })
  return {
    h,
    unhandled,
    settled,
    hits,
    refuse: (next) => { mode = next },
    heal: () => {
      mode = 'none'
      h.orchestration.runnerFactory = (request?: HostRunnerRequest) => {
        const listeners = new Set<(event: RunnerEvent) => void>()
        const runner: Runner = {
          ensureSession: () => Promise.resolve(),
          deliver: (sessionId) => {
            request?.usage?.record({
              provider: 'claude', model: 'default', window: 'five_hour', inputTokens: 10, outputTokens: 5, origin: 'measured',
              at: '2026-11-07T14:00:00.000Z', kind: 'execution',
            })
            said = 'Feito.'
            for (const listener of listeners) listener({ type: 'idle', sessionId, at: new Date().toISOString() })
            return Promise.resolve()
          },
          cancel: () => Promise.resolve(),
          status: () => 'idle',
          whenIdle: () => Promise.resolve(),
          onEvent: (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } },
          capabilities: () => ({ steer: false, removeQueued: false, reportsInputTaken: false, background: false, tools: 'mcp', resume: false }),
        }
        return Promise.resolve(runner)
      }
    },
  }
}

const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 25))
const softLines = (rig: Rig): string[] => [...rig.h.orchestration.lastErrors]

it('(1) the store refuses the failure line: the Task still settles, nothing is left unhandled, and the host says it in one soft line', async () => {
  const rig = open()
  rig.refuse('seq-conflict')
  say(rig.h, 'u1', '@Nina escreva um texto curto de boas-vindas')
  await rig.h.orchestration.flush('pp') // it used to reject here (and, unawaited in the app, killed the process)
  await tick()
  expect(rig.unhandled).toEqual([])
  expect(softLines(rig).some(line => /fail-reply|failure-line/u.test(line))).toBe(true)
  // The Task is already blocked on the engine; the board hears it settled even though the line could not be written.
  expect(rig.settled.some(item => item.state === 'blocked')).toBe(true)
})

it('(2) the work chain is not poisoned: the next Task runs after a failure report that was refused', async () => {
  const rig = open()
  rig.refuse('seq-conflict')
  say(rig.h, 'u1', '@Nina escreva um texto curto de boas-vindas')
  await rig.h.orchestration.flush('pp')
  rig.heal()
  say(rig.h, 'u2', '@Nina agora escreva outro texto curto')
  await rig.h.orchestration.flush('pp')
  await tick()
  expect(rig.unhandled).toEqual([])
  expect(rig.h.ledger.list({ projectId: 'pp', personaId: 'nina' }).length).toBeGreaterThan(0) // the second Task really ran a turn
})

/** `postAs` is private: the idempotence rule is tested on it directly, with a line id nothing else wrote. */
function postLine(rig: Rig, id: string): void {
  const event = rig.h.events.get('u1')!
  const postAs = Reflect.get(rig.h.orchestration, 'postAs') as (e: typeof event, speaker: undefined, id: string, body: string, type: string) => void
  postAs.call(rig.h.orchestration, event, undefined, id, 'Linha de teste.', 'message')
}

it('(3) the same line twice is the same line: a duplicate-id conflict on a line that IS stored is idempotence, not a failure', () => {
  const rig = open()
  say(rig.h, 'u1', 'Bom dia')
  rig.refuse('line-already-stored')
  expect(() => { postLine(rig, 'coord-direct-1') }).not.toThrow() // used to throw: the code was `conflict`, the guard only knew `constraint`
  expect(rig.hits).toEqual(['coord-direct-1'])
  expect(rig.h.events.has('coord-direct-1')).toBe(true)
})

it('(3b) ...but a conflict while the line is NOT stored is a real refusal and still surfaces (nothing is swallowed in silence)', () => {
  const rig = open()
  say(rig.h, 'u1', 'Bom dia')
  rig.refuse('seq-conflict')
  expect(() => { postLine(rig, 'coord-direct-2') }).toThrow(StoreError)
  expect(rig.h.events.has('coord-direct-2')).toBe(false)
})
