/**
 * D-096 (Atlas, Keel 04:39), the HOST half, with NO model: `needed` is the default for a Task that carries connectors (only the GRANTED servers load) and
 * has two fallbacks. The first (the proof of the CLI version failed → native) is the runners' (Tally). The second is guarded here: a Task whose granted
 * connector the isolated launch could not reach runs ONCE native — decided BEFORE the first token inside `resolveRunner`, so there is no second run — the
 * ledger keeps WHY and the Task's card says it in plain words. The runner is a FAKE that reports exactly the typed signal the real one reports
 * (`RunnerUsage.envMode*`, `connectorsUnreached` by position, `connectorsFallback`); the real signal is proven in persona-runners (connector-unreached.spec).
 */
import type { Runner, RunnerEvent } from '@deepseek-ai/dsh-persona-engine'
import { McpStatusCache, type PermissionGate } from '@deepseek-ai/dsh-persona-runners'
import { expect, onTestFinished } from 'vitest'
import { ConnectorBridge } from '../src/connector-bridge.ts'
import type PersonaHost from '../src/index.ts'
import type { HostRunnerRequest } from '../src/runner.ts'
import { SCOPE, it, openJourney, say, seedJourney } from './journeys/journey-host.ts'

const GMAIL_URL = `https://proxy.example.test/v1/mcp/${'0f'.repeat(24)}`
const DRIVE_URL = 'https://proxy.example.test/v1/mcp/dddddddddddddddd'
const MAIL_SEARCH = 'mcp__claude_ai_Gmail__search_threads'
const DRIVE_SEARCH = 'mcp__claude_ai_Google_Drive__search_files'

/** What the runner says about the call it just made (the typed signal; no URL, no name). */
interface Signal {
  readonly envMode: 'native' | 'needed'
  readonly envModeRequested?: 'needed'
  readonly envModeReason?: string
  readonly connectorsUnreached?: ReadonlyArray<{ readonly ordinal: number; readonly reason: string }>
  readonly connectorsFallback?: 'native-once' | 'floor'
}

const NATIVE_ONCE: Signal = {
  envMode: 'native', envModeRequested: 'needed', envModeReason: 'connector-unreached',
  connectorsUnreached: [{ ordinal: 0, reason: 'failed' }], connectorsFallback: 'native-once',
}
const FLOOR: Signal = {
  envMode: 'needed', envModeReason: 'verified', connectorsUnreached: [{ ordinal: 0, reason: 'needs-auth' }], connectorsFallback: 'floor',
}
const FINE: Signal = { envMode: 'needed', envModeReason: 'verified' }

async function hookOf(gate: PermissionGate, tool: string, input: Record<string, unknown>): Promise<'allow' | 'deny'> {
  const settings = gate.settings() as { hooks: { PreToolUse: Array<{ hooks: Array<{ url: string; headers: Record<string, string> }> }> } }
  const hook = settings.hooks.PreToolUse[0]!.hooks[0]!
  const response = await fetch(hook.url, {
    method: 'POST', headers: { 'content-type': 'application/json', ...hook.headers },
    body: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: tool, tool_input: input, tool_use_id: 'tu', mcp_server: tool.split('__')[1] }),
  })
  const body = await response.json() as { hookSpecificOutput?: { permissionDecision?: string } }
  return body.hookSpecificOutput?.permissionDecision === 'allow' ? 'allow' : 'deny'
}

interface Rig {
  readonly h: PersonaHost
  readonly turns: () => number
  readonly executed: string[]
  readonly plan: (...signals: Signal[]) => void
}

function open(): Rig {
  const h = openJourney()
  seedJourney(h, [{ id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true }, { id: 'nina', name: 'Nina', title: 'Atendimento' }])
  h.product.updatePersona({ ...h.product.getPersona('nina')!, runner: { kind: 'cli', cli: 'claude', model: 'default' } }, 'pp')
  h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
  const scripted = h.orchestration.scripted
  h.orchestration.scripted = false
  onTestFinished(() => { h.orchestration.scripted = scripted })
  const row = (name: string, url: string, tools: Array<{ name: string; annotations: { readOnly: true } }>) => ({ name, scope: 'claudeai', status: 'connected', config: { url }, tools })
  h.connectorPorts = {}
  h.connectorBridge = new ConnectorBridge({
    cache: new McpStatusCache({
      open: () => () => ({
        request: subtype => Promise.resolve(subtype === 'mcp_status' ? {
          mcpServers: [
            row('claude.ai Gmail', GMAIL_URL, [{ name: 'search_threads', annotations: { readOnly: true } }]),
            row('claude.ai Google Drive', DRIVE_URL, [{ name: 'search_files', annotations: { readOnly: true } }]),
          ],
        } : { account: {} }),
        close: () => Promise.resolve(),
      }),
      arriveMs: 20, pauseMs: 1,
    }),
  })
  const executed: string[] = []
  const signals: Signal[] = []
  let turns = 0
  let said: string | undefined
  Object.defineProperty(h.orchestration, 'liveText', { configurable: true, get: () => { const text = said; said = undefined; return text }, set: () => undefined })
  h.orchestration.runnerFactory = (request?: HostRunnerRequest) => {
    const listeners = new Set<(event: RunnerEvent) => void>()
    const runner: Runner = {
      ensureSession: () => Promise.resolve(),
      deliver: async (sessionId) => {
        turns += 1
        const signal = signals.shift() ?? FINE
        // The real runner reports the call's measurement to the host's usage meter; the signal is the D-096 one.
        request?.usage?.record({
          id: `u${String(turns)}`, provider: 'claude', model: 'default', window: 'five_hour', inputTokens: 10, outputTokens: 5, origin: 'measured', at: '2026-11-03T15:00:00.000Z',
          ...signal,
        } as never)
        if (request?.permissionGate !== undefined) {
          // The CLI asks the hook before each connector call. The Drive is loaded in the account but NOT granted: it must be denied even in the native-once turn.
          if (await hookOf(request.permissionGate, MAIL_SEARCH, { query: 'cliente' }) === 'allow') executed.push(MAIL_SEARCH)
          if (await hookOf(request.permissionGate, DRIVE_SEARCH, { query: 'contratos' }) === 'allow') executed.push(DRIVE_SEARCH)
        }
        said = 'Li os e-mails.'
        for (const listener of listeners) listener({ type: 'idle', sessionId, at: new Date().toISOString() })
      },
      cancel: () => Promise.resolve(),
      status: () => 'idle',
      whenIdle: () => Promise.resolve(),
      onEvent: (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } },
      capabilities: () => ({ steer: false, removeQueued: false, reportsInputTaken: false, background: false, tools: 'mcp', resume: false }),
    }
    return Promise.resolve(runner)
  }
  onTestFinished(async () => { await h.actionBridge.closeAll() })
  return { h, turns: () => turns, executed, plan: (...next) => { signals.push(...next) } }
}

const ask = async (rig: Rig, id: string): Promise<void> => {
  say(rig.h, id, '@Nina leia meus emails de hoje')
  await rig.h.orchestration.flush('pp')
}
const taskOf = (h: PersonaHost, n: number) => h.listTasks(SCOPE)[n]
const ledgerOf = (h: PersonaHost) => h.ledger.list({ projectId: 'pp' }).filter(entry => entry.kind === 'execution' || entry.ticketId !== undefined)

it('(1) a granted connector the isolated launch did not reach: THIS Task runs native ONCE (no second run), the ledger keeps why, the card says it', async () => {
  const rig = open()
  await rig.h.connectorBridge!.refresh()
  rig.plan(NATIVE_ONCE)
  await ask(rig, 'u1')
  expect(rig.turns()).toBe(1) // decided before the first token: no "tried needed, failed, runs again"
  const [row] = ledgerOf(rig.h)
  expect(row).toMatchObject({ envMode: 'native', envModeReason: 'connector-unreached' })
  expect(taskOf(rig.h, 0)?.engineNote).toBe('Rodou no modo nativo desta vez: o conector Gmail não estava disponível.')
})

it('(2) the connector needs the person to sign in again: the Task stays at the FLOOR (needed), no native run, the card says "entre de novo"', async () => {
  const rig = open()
  await rig.h.connectorBridge!.refresh()
  rig.plan(FLOOR)
  await ask(rig, 'u1')
  const [row] = ledgerOf(rig.h)
  expect(row).toMatchObject({ envMode: 'needed' })
  expect(row?.envMode).not.toBe('native')
  expect(taskOf(rig.h, 0)?.engineNote).toBe('O conector Gmail precisa que você entre de novo na conta; a persona seguiu sem ele.')
})

it('(3) nothing sticks: the NEXT Task is judged again — the connector is back, it runs needed and its card carries no note', async () => {
  const rig = open()
  await rig.h.connectorBridge!.refresh()
  rig.plan(NATIVE_ONCE, FINE)
  await ask(rig, 'u1')
  await ask(rig, 'u2')
  const tasks = rig.h.listTasks(SCOPE)
  expect(tasks).toHaveLength(2)
  const notes = tasks.map(task => task.engineNote)
  expect(notes.filter(note => note !== undefined)).toHaveLength(1) // only the Task that really ran differently
  const rows = ledgerOf(rig.h).map(entry => entry.envMode).sort()
  expect(rows).toEqual(['native', 'needed'])
})

it('(4) the MANDATE holds in the native turn: the native launch loads every connector of the account, but the gate is armed with the granted servers only — the Drive is denied, no card', async () => {
  const rig = open()
  await rig.h.connectorBridge!.refresh()
  rig.plan(NATIVE_ONCE)
  await ask(rig, 'u1')
  expect(rig.executed).toEqual([MAIL_SEARCH]) // the Gmail (granted) read goes through; the Drive (loaded, not granted) does not
  expect(rig.h.listApprovals(SCOPE).filter(row => row.kind === 'action')).toEqual([])
})

it('(5) a Task with NO connector keeps its mode and has no note (the new default only concerns Tasks that carry a connector)', async () => {
  const rig = open()
  await rig.h.connectorBridge!.refresh()
  rig.plan(FINE)
  say(rig.h, 'u9', '@Nina faça um bolo de cenoura')
  await rig.h.orchestration.flush('pp')
  expect(taskOf(rig.h, 0)?.engineNote).toBeUndefined()
})
