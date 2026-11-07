/**
 * EFF-1 in the LEDGER, with NO model: the model and the effort ("Capricho") the person chose for a persona reach the runner's
 * spec, and what the runner reports about the call (`modelRequested` / `effortRequested`, and `modelDropped` / `effortDropped`
 * when the engine did not take them) lands on the turn's ledger row — the row Tally's real Opus + Máximo turn is read from
 * (`host.ledger.list`). No schema change: the detail is a JSON doc next to the row (persona-store `turn_engine`).
 * The runner here is a FAKE that reports exactly what the real one reports for the spec it was given (persona-runners
 * `withChoiceReport`, proven with the real CLI in eff1-runner.spec / reports/eff1-dry.json).
 */
import type { Runner, RunnerEvent } from '@deepseek-ai/dsh-persona-engine'
import { expect, onTestFinished } from 'vitest'
import type PersonaHost from '../src/index.ts'
import type { HostRunnerRequest } from '../src/runner.ts'
import { engineChoiceOf } from '../src/engine-choice.ts'
import { SCOPE, it, openJourney, say, seedJourney } from './journeys/journey-host.ts'

/** What the engine did with the choice (the real runner decides it; the fake replays it). */
interface Outcome {
  readonly modelDropped?: boolean
  readonly effortDropped?: boolean
  /** A value the runner should never send (prose): the turn must still be measured. */
  readonly garbage?: boolean
}

interface Rig {
  readonly h: PersonaHost
  readonly specs: Array<HostRunnerRequest['spec']>
}

function open(runner: { model: string; effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max' }, outcome: Outcome = {}): Rig {
  const h = openJourney()
  seedJourney(h, [{ id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true }, { id: 'nina', name: 'Nina', title: 'Atendimento' }])
  h.product.updatePersona({ ...h.product.getPersona('nina')!, runner: { kind: 'cli', cli: 'claude', ...runner } }, 'pp')
  h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
  const scripted = h.orchestration.scripted
  h.orchestration.scripted = false
  onTestFinished(() => { h.orchestration.scripted = scripted })
  const specs: Array<HostRunnerRequest['spec']> = []
  let turns = 0
  let said: string | undefined
  Object.defineProperty(h.orchestration, 'liveText', { configurable: true, get: () => { const text = said; said = undefined; return text }, set: () => undefined })
  h.orchestration.runnerFactory = (request?: HostRunnerRequest) => {
    const listeners = new Set<(event: RunnerEvent) => void>()
    const spec = request?.spec
    if (spec !== undefined) specs.push(spec)
    const fake: Runner = {
      ensureSession: () => Promise.resolve(),
      deliver: (sessionId) => {
        turns += 1
        // What the real runner reports for this spec: the choice only when there is one; a refused model/effort as a drop.
        const model = spec !== undefined && 'model' in spec ? spec.model : 'default'
        const effort = spec !== undefined && 'effort' in spec ? spec.effort : undefined
        request?.usage?.record({
          provider: 'claude', model: outcome.modelDropped === true ? 'default' : model, window: 'five_hour', inputTokens: 10, outputTokens: 5,
          origin: 'measured', at: `2026-11-07T13:00:0${String(turns)}.000Z`, kind: 'execution',
          ...(model === 'default' ? {} : { modelRequested: outcome.garbage === true ? 'o melhor modelo' : model }),
          ...(effort === undefined ? {} : { effortRequested: effort }),
          ...(outcome.modelDropped === true && model !== 'default' ? { modelDropped: model } : {}),
          ...(outcome.effortDropped === true && effort !== undefined ? { effortDropped: effort } : {}),
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
    return Promise.resolve(fake)
  }
  return { h, specs }
}

const ask = async (rig: Rig): Promise<void> => {
  say(rig.h, 'u1', '@Nina escreva um texto curto de boas-vindas')
  await rig.h.orchestration.flush('pp')
}
const ninaRows = (h: PersonaHost) => h.ledger.list({ projectId: 'pp', personaId: 'nina' })
const CHOICE = ['model', 'modelRequested', 'effortRequested', 'modelDropped', 'effortDropped'] as const

it('(1) Opus + Máximo: the choice reaches the runner spec and the turn\'s ledger row says modelRequested opus, effortRequested max, nothing dropped', async () => {
  const rig = open({ model: 'opus', effort: 'max' })
  await ask(rig)
  expect(rig.specs.some(spec => 'model' in spec && spec.model === 'opus' && 'effort' in spec && spec.effort === 'max')).toBe(true)
  const rows = ninaRows(rig.h)
  expect(rows.length).toBeGreaterThan(0)
  expect(rows[0]).toMatchObject({ model: 'opus', modelRequested: 'opus', effortRequested: 'max', inputTokens: 10, outputTokens: 5 })
  expect(rows[0]).not.toHaveProperty('modelDropped')
  expect(rows[0]).not.toHaveProperty('effortDropped')
  expect(rig.h.listTasks(SCOPE)).toHaveLength(1)
})

it('(2) "Padrão do motor": nothing fixed reaches the runner (no effort, model default) and the row says nothing about a choice', async () => {
  const rig = open({ model: 'default' })
  await ask(rig)
  const ninaSpecs = rig.specs.filter(spec => 'model' in spec && spec.model === 'default')
  expect(ninaSpecs.length).toBeGreaterThan(0)
  for (const spec of rig.specs) expect(spec).not.toHaveProperty('effort') // never a fixed 'sonnet' / level behind her back
  const rows = ninaRows(rig.h)
  expect(rows.length).toBeGreaterThan(0)
  for (const row of rows) for (const field of CHOICE) expect(row).not.toHaveProperty(field)
  const docs = rig.h.store.db.prepare('SELECT COUNT(*) AS n FROM screen_doc WHERE kind = ?').get('turn_engine')
  expect(docs?.n).toBe(0)
})

it('(3) a model the engine does not offer and an effort the model refused: the Task still runs (engine default) and the row keeps both drops', async () => {
  const rig = open({ model: 'claude-nope-9', effort: 'xhigh' }, { modelDropped: true, effortDropped: true })
  await ask(rig)
  const [row] = ninaRows(rig.h)
  expect(row).toMatchObject({ model: 'default', modelRequested: 'claude-nope-9', modelDropped: 'claude-nope-9', effortRequested: 'xhigh', effortDropped: 'xhigh' })
  expect(rig.h.listTasks(SCOPE)).toHaveLength(1)
})

it('(4) a value that is not an identifier never costs the measurement: the row is kept, the bad field is left out', async () => {
  const rig = open({ model: 'opus', effort: 'high' }, { garbage: true })
  await ask(rig)
  const [row] = ninaRows(rig.h)
  expect(row).toMatchObject({ inputTokens: 10, outputTokens: 5, effortRequested: 'high', model: 'opus' })
  expect(row).not.toHaveProperty('modelRequested')
})

it('(5) engineChoiceOf: model alone (no choice, no drop) is not kept; with a choice it rides along', () => {
  expect(engineChoiceOf({ model: 'claude-haiku-4-5' })).toEqual({})
  expect(engineChoiceOf({ model: 'opus', effortRequested: 'max' })).toEqual({ model: 'opus', effortRequested: 'max' })
  expect(engineChoiceOf({ model: 'tem espaço', modelRequested: 'sonnet' })).toEqual({ modelRequested: 'sonnet' })
})
