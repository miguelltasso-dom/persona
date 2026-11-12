/**
 * D-103a: fail closed per engine. No connector runs send / publish / pay / delete on a CLI whose permission gate is not PROVEN: today only Claude's
 * PreToolUse hook is proven (`permissionPreview: 'hook'`); Codex, Cursor and OpenCode read their connectors and nothing else, and the screen says so.
 * Pure policy + a stream observer on the runner (no session, no OAR): the same shape as the tool-level guard, but for the tools of the PERSON's connectors.
 */
import { scriptedRuntime } from '@botiverse/oar/testing'
import { afterEach, describe, expect, it } from 'vitest'
import type { Runtime } from '@botiverse/oar'
import { eventTime, type RunEvent, type RunHandle, type Runner, type StartTurnInput } from '../src/contract.ts'
import { cliCapabilityReport } from '../src/oar/isolation.ts'
import { disposeRunnerSessions, resolveRunner } from '../src/index.ts'
import { connectorVerdict, engineConnectorNotice, engineGateProven, withEngineConnectorPolicy } from '../src/resolve/engine-gate.ts'
import { createSessionPool } from '../src/resolve/session-pool.ts'
import { isNativeToolName } from '../src/resolve/tool-level.ts'
import { isReadByName } from '../src/resolve/tool-action.ts'

afterEach(async () => {
  await disposeRunnerSessions()
})

const UNPROVEN = ['codex', 'cursor', 'opencode'] as const
const NEEDED = { PERSONA_CLI_ENV: 'needed' }
const NATIVE = { PERSONA_CLI_ENV: 'native' }

const input: StartTurnInput = { ticketId: 't', assignmentId: 'a', personaId: 'nina', cwd: 'C:/tmp/g', prompt: 'envie', model: 'haiku', permissionMode: 'allow-once' }

const handleOf = (): RunHandle => ({ runId: 'r1', sessionId: 's1', ticketId: 't', assignmentId: 'a', personaId: 'nina', cwd: 'C:/tmp/g', model: 'haiku' })
const tool = (name: string): RunEvent => ({ type: 'report', at: eventTime(), report: { state: 'progress', summary: `tool:${name}` } })
const delta = (text: string): RunEvent => ({ type: 'delta', at: eventTime(), text })
const ready = (): RunEvent => ({ type: 'ended', at: eventTime(), report: { state: 'ready', summary: 'turn ended' } })

/** A runner that plays a fixed script and remembers what the observer asked of it. */
function scripted(events: readonly RunEvent[], log: string[] = []): Runner {
  const handle = handleOf()
  const play = async function *(): AsyncIterable<RunEvent> {
    for (const event of events) yield event
  }
  return {
    capabilities: () => ({ resume: true, usage: true, permission: 'explicit', mcpTools: 'available' }) as never,
    health: async () => ({ ok: true, detail: 'ok' }),
    authenticate: async () => ({ ok: true, detail: 'ok' }),
    start: async () => handle,
    startTurn: async () => handle,
    stream: play,
    events: play,
    cancel: async () => { log.push('cancel') },
    resume: async () => handle,
    usage: async () => ({ inputTokens: 0, outputTokens: 0 }),
  }
}

async function collect(runner: Runner): Promise<RunEvent[]> {
  const handle = await runner.start(input)
  const out: RunEvent[] = []
  for await (const event of runner.stream(handle)) out.push(event)
  return out
}

describe('the seal: which engines have a proven permission gate', () => {
  it('only Claude is proven; Codex, Cursor, OpenCode and anything unknown are not', () => {
    expect(engineGateProven('claude')).toBe(true)
    for (const cli of [...UNPROVEN, 'something-else']) expect(engineGateProven(cli)).toBe(false)
  })

  it('the capability report says what the connectors may do on each engine, in every environment mode', () => {
    for (const env of [NATIVE, NEEDED, { PERSONA_CLI_ENV: 'answer-only' }]) {
      expect(cliCapabilityReport('claude', env).connectorActions).toBe('gated')
      for (const cli of [...UNPROVEN, 'something-else']) expect(cliCapabilityReport(cli, env).connectorActions).toBe('read-only')
    }
  })

  it('one switch: the seal follows `permissionPreview` (a CLI whose hook gets proven opens up by itself, nothing else to edit)', () => {
    for (const cli of ['claude', ...UNPROVEN, 'x']) {
      const report = cliCapabilityReport(cli, NEEDED)
      expect(report.connectorActions === 'gated').toBe(report.permissionPreview === 'hook')
      expect(engineGateProven(cli)).toBe(report.permissionPreview === 'hook')
    }
  })

  it('the notice for the screen names the engine and says what is left; Claude needs none', () => {
    expect(engineConnectorNotice('claude')).toBeUndefined()
    for (const [cli, name] of [['codex', 'Codex'], ['cursor', 'Cursor'], ['opencode', 'OpenCode']] as const) {
      const text = engineConnectorNotice(cli)
      expect(text).toContain(name)
      expect(text).toMatch(/só leio/u)
      expect(text).toMatch(/enviar/u)
      expect(text).toMatch(/Claude/u)
    }
  })
})

describe('isReadByName: a read must be PROVEN by the name (nothing else vouches for it on these engines)', () => {
  it('a read verb and no other verb is a read; any write verb, or no verb at all, is not', () => {
    for (const name of ['mcp__gmail__list_labels', 'mcp__cal__get_event', 'mcp__drive__searchFiles', 'mcp__x__read_thread', 'mcp__x__fetch-page']) expect(isReadByName(name)).toBe(true)
    for (const name of ['mcp__gmail__send_message', 'mcp__x__publish_post', 'mcp__bank__pay_invoice', 'mcp__drive__trash_file', 'mcp__cal__update_event']) expect(isReadByName(name)).toBe(false)
    // "list" next to a write verb is not a read; an unknown name is not a read (fail closed)
    expect(isReadByName('mcp__x__list_and_delete')).toBe(false)
    expect(isReadByName('mcp__x__get_then_send')).toBe(false)
    expect(isReadByName('mcp__drive__files')).toBe(false)
    expect(isReadByName('mcp__x__do_thing')).toBe(false)
  })

  it('the SERVER part never counts, in either direction', () => {
    expect(isReadByName('mcp__send_grid__list_templates')).toBe(true)
    expect(isReadByName('mcp__get_stuff__send_it')).toBe(false)
  })
})

describe('isNativeToolName: what the persona\'s own tool level governs, never a connector', () => {
  it('the CLIs\' own tools (any spelling) are native; a server-qualified name never is', () => {
    for (const name of ['Bash', 'PowerShell', 'Read', 'Glob', 'Grep', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'ToolSearch', 'WebFetch', 'WebSearch', 'Shell', 'ApplyPatch', 'apply_patch', 'Delete', 'str_replace']) {
      expect(isNativeToolName(name)).toBe(true)
    }
    for (const name of ['mcp__gmail__send_message', 'mcp__gmail__list_labels', 'mcp__persona__persona_recall', 'gmail.send_message', 'gmail__send_message', 'gmail/send']) {
      expect(isNativeToolName(name)).toBe(false)
    }
    expect(isNativeToolName('send_email')).toBe(false)
  })
})

describe('connectorVerdict: what a connector tool may do on an engine without a proven gate', () => {
  it('Claude is always allowed here: its own hook gate (PermissionGate) judges every call', () => {
    for (const name of ['mcp__gmail__send_message', 'mcp__bank__pay_invoice', 'mcp__drive__trash_file']) expect(connectorVerdict('claude', name)).toEqual({ allow: true })
  })

  it('Codex, Cursor and OpenCode: send / publish / pay / delete / change are refused, with the class and the verb that decided', () => {
    for (const cli of UNPROVEN) {
      expect(connectorVerdict(cli, 'mcp__gmail__send_message')).toEqual({ allow: false, actionClass: 'send', verb: 'send' })
      expect(connectorVerdict(cli, 'mcp__x__publishPost')).toEqual({ allow: false, actionClass: 'send', verb: 'publish' })
      expect(connectorVerdict(cli, 'mcp__bank__create-payment')).toEqual({ allow: false, actionClass: 'pay', verb: 'payment' })
      expect(connectorVerdict(cli, 'mcp__drive__trash_file')).toEqual({ allow: false, actionClass: 'delete', verb: 'trash' })
      expect(connectorVerdict(cli, 'mcp__cal__update_event')).toEqual({ allow: false, actionClass: 'change', verb: 'update' })
    }
  })

  it('reads pass; an unknown name FAILS CLOSED (an action that leaves)', () => {
    for (const cli of UNPROVEN) {
      expect(connectorVerdict(cli, 'mcp__gmail__list_labels')).toEqual({ allow: true })
      expect(connectorVerdict(cli, 'mcp__drive__searchFiles')).toEqual({ allow: true })
      expect(connectorVerdict(cli, 'mcp__drive__files')).toEqual({ allow: false, actionClass: 'send', verb: 'send' })
    }
  })

  it('a native tool is not a connector: the persona\'s own tool level judges it, this policy stays out', () => {
    for (const cli of UNPROVEN) for (const name of ['Bash', 'Edit', 'Write', 'Read', 'ApplyPatch']) expect(connectorVerdict(cli, name)).toEqual({ allow: true })
  })
})

describe('withEngineConnectorPolicy: the turn that reaches for a refused connector tool ends blocked', () => {
  it('Codex with a WRITE grant (the tool-level guard lets everything through): send_message is cancelled and the turn ends blocked, in human words', async () => {
    const log: string[] = []
    const runner = withEngineConnectorPolicy(scripted([delta('vou enviar'), tool('mcp__gmail__send_message'), delta('enviado'), ready()], log), 'codex')
    const events = await collect(runner)
    expect(log).toEqual(['cancel'])
    expect(events.map(event => event.type)).toEqual(['delta', 'ended'])
    const ended = events.at(-1)
    expect(ended).toMatchObject({ type: 'ended', report: { state: 'blocked' } })
    const report = ended?.type === 'ended' ? ended.report : undefined
    expect(report?.summary).toContain('Codex')
    expect(report?.summary).toContain('só leio')
    expect(report?.summary).toContain('mcp__gmail__send_message')
    expect(report?.question).toContain('Precisa de você')
    expect(report?.question).toContain('mcp__gmail__send_message')
    // nothing after the refused call reaches the person
    expect(events.some(event => event.type === 'delta' && event.text === 'enviado')).toBe(false)
  })

  it('names the action in the person\'s words: enviar/publicar, pagar, apagar, alterar', async () => {
    const cases: [string, RegExp][] = [
      ['mcp__gmail__send_message', /enviar/u], ['mcp__x__publish_post', /publicar|enviar/u], ['mcp__bank__pay_invoice', /pagar/u], ['mcp__drive__trash_file', /apagar/u], ['mcp__cal__update_event', /alterar/u],
    ]
    for (const [name, words] of cases) {
      const events = await collect(withEngineConnectorPolicy(scripted([tool(name), ready()]), 'cursor'))
      const ended = events.at(-1)
      expect(ended?.type === 'ended' ? ended.report.summary : '').toMatch(words)
    }
  })

  it('a read of the same connector runs untouched, event for event', async () => {
    const log: string[] = []
    const script = [tool('mcp__gmail__list_labels'), delta('3 rótulos'), ready()]
    const events = await collect(withEngineConnectorPolicy(scripted(script, log), 'opencode'))
    expect(events).toEqual(script)
    expect(log).toEqual([])
  })

  it('an unknown connector tool is refused (fail closed) and the engine is named', async () => {
    const events = await collect(withEngineConnectorPolicy(scripted([tool('mcp__drive__files'), ready()]), 'opencode'))
    const ended = events.at(-1)
    expect(ended).toMatchObject({ type: 'ended', report: { state: 'blocked' } })
    expect(ended?.type === 'ended' ? ended.report.summary : '').toContain('OpenCode')
  })

  it('native tools are not touched (the persona\'s own tool level decides those), and neither are the product tools THIS turn was offered', async () => {
    const script = [tool('Bash'), tool('Edit'), tool('mcp__persona__persona_email_send'), ready()]
    const handle = handleOf()
    const log: string[] = []
    const inner = scripted(script, log)
    const runner = withEngineConnectorPolicy({ ...inner, startTurn: async () => handle, start: async () => handle }, 'codex')
    const offered: StartTurnInput = { ...input, mcpTools: { server: 'persona', tools: [{ name: 'persona_email_send', description: 'd', inputSchema: {}, handler: async () => ({ content: 'ok' }) }] } }
    const opened = await runner.startTurn(offered)
    const events: RunEvent[] = []
    for await (const event of runner.stream(opened)) events.push(event)
    expect(events).toEqual(script)
    expect(log).toEqual([])
  })

  it('a product tool name that was NOT offered to this turn gets no exemption', async () => {
    const events = await collect(withEngineConnectorPolicy(scripted([tool('mcp__persona__persona_email_send'), ready()]), 'codex'))
    expect(events.at(-1)).toMatchObject({ type: 'ended', report: { state: 'blocked' } })
  })

  it('Claude is returned untouched (same object): its gate is the PermissionGate hook', () => {
    const inner = scripted([ready()])
    expect(withEngineConnectorPolicy(inner, 'claude')).toBe(inner)
  })

  it('the single switch: an engine whose gate is declared proven is returned untouched too', () => {
    const inner = scripted([ready()])
    expect(withEngineConnectorPolicy(inner, 'codex', { proven: true })).toBe(inner)
  })

  it('every other method of the runner is passed through (capabilities, usage, dispose...)', async () => {
    let disposed = false
    const inner: Runner = { ...scripted([ready()]), dispose: async () => { disposed = true } }
    const runner = withEngineConnectorPolicy(inner, 'codex')
    expect(runner.capabilities()).toEqual(inner.capabilities())
    expect(await runner.usage()).toEqual({ inputTokens: 0, outputTokens: 0 })
    await runner.dispose?.()
    expect(disposed).toBe(true)
  })
})

describe('wired through resolveRunner: every engine without a proven gate is read-only on connectors, whatever the persona\'s own grant', () => {
  function runtimeCalling(name: string): Runtime {
    const base = scriptedRuntime({ id: 'fake-cli', turn: async (turn) => { await turn.tool(name, '{"to":"ana@x.com"}', () => 'ok').catch(() => undefined); turn.say('feito') } })
    return Object.assign(base, {
      installation: async () => ({ kind: 'available', via: 'bundled' }),
      authStatus: async () => ({ kind: 'logged_in' }),
      listModels: async () => ({ kind: 'ok', models: [{ id: 'haiku' }] }),
    }) as unknown as Runtime
  }

  async function endOf(cli: 'claude' | 'codex' | 'cursor' | 'opencode', name: string): Promise<RunEvent | undefined> {
    const runner = await resolveRunner({
      spec: { kind: 'cli', cli, model: 'haiku' }, permissionMode: 'allow-once', tools: { files: 'write', shell: 'write' }, runtime: runtimeCalling(name), personId: 'nina', projectId: 'p1', cwd: 'C:/tmp/g',
      pool: createSessionPool<Runner>(), infra: { wait: async () => undefined }, env: { PERSONA_CLI_ENV: 'native' },
    })
    const handle = await runner.start(input)
    let ended: RunEvent | undefined
    for await (const event of runner.stream(handle)) if (event.type === 'ended') { ended = event; break }
    await runner.dispose?.()
    return ended
  }

  it('a send through a connector on Codex / Cursor / OpenCode ends the turn blocked, even for a persona that may write and run shell', async () => {
    for (const cli of UNPROVEN) {
      const ended = await endOf(cli, 'mcp__gmail__send_message')
      expect(ended, cli).toMatchObject({ type: 'ended', report: { state: 'blocked' } })
    }
  })

  it('a read of a connector on the same engines is not blocked', async () => {
    for (const cli of UNPROVEN) {
      const ended = await endOf(cli, 'mcp__gmail__list_labels')
      expect(ended, cli).toMatchObject({ type: 'ended', report: { state: 'ready' } })
    }
  })

  it('Claude is not blocked by THIS policy (its hook gate judges the call, the scripted runtime has none)', async () => {
    const ended = await endOf('claude', 'mcp__gmail__send_message')
    expect(ended).toMatchObject({ type: 'ended', report: { state: 'ready' } })
  })
})
