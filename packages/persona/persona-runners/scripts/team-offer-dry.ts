/**
 * D-097 (Atlas 05/11): with the team tools offered to EVERY Task of a project with colleagues (no keyword), does a NATURAL request ("faz um cartaz da promoção da Padaria Lua com esta foto,
 * quero algo bonito para o Instagram") reach the model with the team tools and the one-paragraph orientation? ZERO model: the REAL `claude` CLI talks to a fake endpoint on 127.0.0.1 with a dummy
 * API key, so nothing can reach a model. What it proves, and what it CANNOT:
 *   - PROVES the OFFER: the request the CLI sends carries the team tools (names and definitions) and the paragraph (`TEAM_GUIDANCE`) next to the natural request, through the SAME path the host
 *     uses (`TeamTools.toolsFor/guidanceFor`, `productToolsOpener`, the HT-0 gateway, the real runner);
 *   - PROVES the PATH: a scripted "model" that calls `pass_forward` goes CLI -> gateway -> `TeamTools.call` -> `handoffs.ask` (kind `next`) and gets the host's answer back;
 *   - does NOT prove the model CHOOSES to use them: a fake endpoint decides nothing. Only a real call shows that (and needs the owner's OK).
 *
 *   node --import tsx/esm packages/persona/persona-runners/scripts/team-offer-dry.ts [--out <file.json>]
 *
 * REAL mode (default OFF; needs the owner's OK, one call, no personal data): `PERSONA_TEAM_OFFER_REAL=1 PERSONA_REAL_E2E=1 PERSONA_LOCK=real PERSONA_REAL_TURN_CAP=1
 * PERSONA_REAL_TURN_LEDGER=<absolute, fresh path>` runs the SAME request ONCE on the real model (haiku, a call without built-in tools like a TEAM-10 worker) and records which tools
 * it CHOSE to call. Nothing else changes.
 * `--tool-search <value>` sets the CLI's `ENABLE_TOOL_SEARCH` for the run and `--only-tasks` keeps only the task-with-built-in-tools configuration: the investigation of how to keep OUR
 * server's tool definitions inline (not deferred) when built-in tools are present.
 * Prints counts, names and sizes only.
 */

import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { StoredPersona } from '@deepseek-ai/dsh-persona-store'
import { TEAM_TOOLS, TeamTools, withTeamTools } from '../../persona-host/src/harness-team.ts'
import { offeredToolNames, productToolsOpener } from '../../persona-host/src/harness-turn.ts'
import { bandedPng } from './png-fixture.ts'
import { createMcpGateway } from '../src/mcp/gateway.ts'
import { HARNESS_TOOLS } from '../src/mcp/harness-tools.ts'
import type { SessionOptions } from '@botiverse/oar'
import { createOarSessionRunner, disposeRunnerSessions, resolveRunner, type MeasuredUsage } from '../src/index.ts'

const NATURAL = 'faz um cartaz da promoção da Padaria Lua com esta foto, quero algo bonito para o Instagram'
const PROJECT = 'p-padaria'
const PERSONA = { id: 'bia', name: 'Bia', title: 'Redação' } as unknown as StoredPersona
const COLLEAGUES = [PERSONA, { id: 'teo', name: 'Teo', title: 'Arte' }, { id: 'lia', name: 'Lia', title: 'Coordenação' }] as unknown as StoredPersona[]

function argOf(name: string): string | undefined {
  const at = process.argv.indexOf(name)
  return at >= 0 ? process.argv[at + 1] : undefined
}

interface Seen {
  count: number
  firstTools: { name: string; description: string; chars: number }[]
  firstText: string
  toolResult: string
  called?: string
  deferredNames?: boolean
  namedInText?: boolean
  toolSearchUsed?: boolean
}

async function fakeAnthropic(seen: Seen): Promise<{ readonly close: () => void; readonly port: number }> {
  const { createServer } = await import('node:http')
  const server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => { chunks.push(chunk) })
    req.on('end', () => {
      const path = (req.url ?? '').split('?')[0] ?? ''
      if (!path.endsWith('/v1/messages')) { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"input_tokens":10}'); return }
      const raw = Buffer.concat(chunks).toString('utf8')
      seen.count += 1
      const body = JSON.parse(raw || '{}') as { model?: string; tools?: { name?: string; description?: string }[]; messages?: { role?: string; content?: unknown }[]; system?: unknown }
      const toolNames = (body.tools ?? []).map(item => item.name ?? '')
      const blocks = (body.messages ?? []).flatMap(message => (Array.isArray(message.content) ? message.content as { type?: string; name?: string; content?: unknown; text?: string }[] : [{ type: 'text', text: typeof message.content === 'string' ? message.content : '' }]))
      if (seen.count === 1) {
        seen.firstTools = (body.tools ?? []).map(item => ({ name: item.name ?? '', description: item.description ?? '', chars: JSON.stringify(item).length }))
        seen.firstText = blocks.filter(block => block.type === 'text').map(block => block.text ?? '').join('\n')
      }
      const result = blocks.find(block => block.type === 'tool_result')
      if (result !== undefined) seen.toolResult = typeof result.content === 'string' ? result.content : JSON.stringify(result.content)
      const allText = `${JSON.stringify(body.system ?? '')}\n${blocks.map(block => block.text ?? '').join('\n')}`
      const fullName = /mcp__[A-Za-z0-9_-]+__pass_forward/u.exec(allText)?.[0]
      const inRequest = toolNames.find(name => name.endsWith('pass_forward'))
      if (seen.count === 1) { seen.deferredNames = fullName !== undefined && inRequest === undefined; seen.namedInText = fullName !== undefined }
      const searched = blocks.some(block => block.type === 'tool_use' && block.name === 'ToolSearch')
      const alreadyCalled = blocks.some(block => block.type === 'tool_use' && block.name?.endsWith('pass_forward') === true)
      const args = { colleague: 'Teo', title: 'Arte do cartaz da Padaria Lua', done: ['texto curto do cartaz'], needed: ['arte para o Instagram, com a foto'] }
      let call: { name: string; input: unknown } | undefined
      if (!alreadyCalled && inRequest !== undefined) call = { name: inRequest, input: args }
      else if (!alreadyCalled && !searched && fullName !== undefined && toolNames.includes('ToolSearch')) call = { name: 'ToolSearch', input: { query: `select:${fullName}`, max_results: 1 } }
      else if (!alreadyCalled && searched && fullName !== undefined) call = { name: fullName, input: args }
      if (call !== undefined) { seen.called = call.name; if (call.name === 'ToolSearch') seen.toolSearchUsed = true }
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      const send = (event: string, data: unknown): void => { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`) }
      send('message_start', { type: 'message_start', message: { id: 'm', type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 1 } } })
      if (call !== undefined) {
        send('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: `toolu_${String(seen.count)}`, name: call.name, input: {} } })
        send('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(call.input) } })
        send('content_block_stop', { type: 'content_block_stop', index: 0 })
        send('message_delta', { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 5 } })
      } else {
        send('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })
        send('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Passei a arte para o Teo; o texto do cartaz está pronto.' } })
        send('content_block_stop', { type: 'content_block_stop', index: 0 })
        send('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 12 } })
      }
      send('message_stop', { type: 'message_stop' })
      res.end()
    })
  })
  const port = await new Promise<number>((resolvePort) => { server.listen(0, '127.0.0.1', () => { resolvePort((server.address() as { port: number }).port) }) })
  return { close: () => { server.close(); server.closeAllConnections() }, port }
}

interface Handoff { kind: unknown; toPersonaId: unknown; title: unknown; note: unknown }

async function once(toolLevel: 'none' | 'read' | 'write', permissionMode: 'allow-once' | 'deny', work: string, real = false): Promise<Record<string, unknown>> {
  const handoffs: Handoff[] = []
  /** The tools the model CHOSE to call (what the gateway served), in order. */
  const chosen: string[] = []
  const team = new TeamTools({
    enabled: () => true,
    product: { listPersonas: () => COLLEAGUES },
    harness: { identityOf: () => ({ projectId: PROJECT, personaId: PERSONA.id, initiator: 'person', autonomy: 'ask' }) as never },
    handoffs: {
      ask: (input: never) => { const row = input as unknown as Handoff; handoffs.push({ kind: row.kind, toPersonaId: row.toPersonaId, title: row.title, note: row.note }); return { ok: true, requestId: 'req-1', status: 'open' } as never },
      verdict: () => ({ ok: false, message: 'n/a' }) as never,
      isReviewTask: () => false,
    },
    limitsOf: () => ({ canAskColleagues: true }) as never,
    ticketOf: () => undefined,
  })
  // The host's ports: every harness tool wired, the team ones served by TeamTools (the opinion tool is a stub here: `opinion-host.ts` is the host's own).
  const base = { tools: HARNESS_TOOLS.filter(name => !(TEAM_TOOLS as readonly string[]).includes(name)), call: async () => '{"ok":true}' }
  const ports = withTeamTools(base as never, team)
  const gateway = createMcpGateway({
    hooks: { report: () => undefined, recall: () => '', ask: () => { chosen.push('persona_ask'); return { ok: true, content: 'ok' } } } as never,
    harness: { tools: [...(ports.tools ?? []), 'ask_team_opinion'] as never, call: async (input) => { chosen.push(input.tool); return input.tool === 'ask_team_opinion' ? '{"ok":true}' : ports.call?.(input) ?? '{"ok":true}' } },
    onlyWired: true,
  })
  const rules = { taskTextOf: () => NATURAL, teamToolsOf: (turn: { ticketId: string }) => team.toolsFor(PROJECT, PERSONA, turn.ticketId) }
  const offered = offeredToolNames(rules, toolLevel, { personaId: PERSONA.id, ticketId: 't1' })
  const set = productToolsOpener({ gateway, toolLevel, ...rules })({ personaId: PERSONA.id, ticketId: 't1', assignmentId: 'a1', cwd: work } as never)
  const guidance = team.guidanceFor(PROJECT, PERSONA, 't1')
  const prompt = guidance === undefined ? NATURAL : `${NATURAL}\n\n${guidance}`

  const seen: Seen = { count: 0, firstTools: [], firstText: '', toolResult: '' }
  const fake = real ? undefined : await fakeAnthropic(seen)
  const saved = { base: process.env.ANTHROPIC_BASE_URL, key: process.env.ANTHROPIC_API_KEY, toolSearch: process.env.ENABLE_TOOL_SEARCH }
  const toolSearch = argOf('--tool-search')
  if (toolSearch !== undefined) process.env.ENABLE_TOOL_SEARCH = toolSearch
  if (fake !== undefined) {
    process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${String(fake.port)}`
    process.env.ANTHROPIC_API_KEY = 'sk-ant-dry-dummy'
  }
  let ended = 'not-run'
  let text = ''
  let usageRow: Record<string, unknown> = {}
  // "com esta foto": a synthetic draft poster (colour bands, no real person or place), attached the way the host attaches it to the turn.
  const photo = join(work, 'cartaz-rascunho.png')
  writeFileSync(photo, bandedPng(1200, 800, [[30, 80, 170], [250, 250, 250], [210, 40, 40], [245, 200, 40]]))
  // EFF-1 next to D-097: the persona has its model chosen EXPLICITLY (haiku), so this call also shows what the OAR session is handed (`--model`) and what the sink (the host's ledger input) receives.
  const oar = await import('@botiverse/oar')
  const claudeRuntime = oar.defaultRuntimes.get('claude')
  if (claudeRuntime === undefined) throw new Error('the claude runtime is not available')
  const opened: SessionOptions[] = []
  const originalSession = claudeRuntime.session.bind(claudeRuntime)
  const runtime = Object.assign(Object.create(claudeRuntime) as typeof claudeRuntime, claudeRuntime, {
    session: async (installation: never, options: SessionOptions) => { opened.push(options); return originalSession(installation, options) },
  })
  const sinkEntries: MeasuredUsage[] = []
  try {
    const runner = await resolveRunner({
      spec: { kind: 'cli', cli: 'claude', model: 'haiku' }, permissionMode, toolLevel, purpose: 'task', runtime,
      usage: { record: (entry) => { sinkEntries.push(entry) } },
      env: fake === undefined ? { ...process.env } : { ...process.env, ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL, ANTHROPIC_API_KEY: 'sk-ant-dry-dummy' },
    })
    // The SAME composition the host uses (`resolveHostRunner`): the session runner wraps the FIRST delivery of a worker with the persona's identity and the owner norms
    // (`prefixOwnerNorms`: "Você é Bia, Redação…"), opens the lease's tools for this assignment and attaches the images. A bare `runner.start` would leave the persona out.
    let last: Awaited<ReturnType<typeof runner.start>> | undefined
    const turn = {
      ...runner,
      start: async (input: Parameters<typeof runner.start>[0]) => { last = await runner.start(input); return last },
      stream: (handle: Parameters<typeof runner.stream>[0]) => (async function *() { for await (const event of runner.stream(handle)) { if (event.type === 'delta') text += event.text; yield event } })(),
    }
    const session = createOarSessionRunner({
      turn, personaId: PERSONA.id, model: 'haiku', permissionMode, purpose: 'task', personaName: PERSONA.name, personaTitle: PERSONA.title,
      toolsFor: () => set,
    })
    await session.ensureSession('worker-t1', work, 'Cartaz da promoção da Padaria Lua', 'worker')
    await session.deliver('worker-t1', 'launch:a1', prompt, 'queue', { images: [{ path: photo, mediaType: 'image/png' }] })
    if (last === undefined) throw new Error('the turn did not start')
    // the turn has been streamed to its end by the session runner; read what it left
    const usage = await runner.usage(last)
    usageRow = {
      inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, cacheReadTokens: usage.cacheReadTokens ?? null, cacheWriteTokens: usage.cacheWriteTokens ?? null, envMode: usage.envMode ?? null,
      modelRequested: usage.modelRequested ?? null, effortRequested: usage.effortRequested ?? null, modelDropped: usage.modelDropped ?? null, effortDropped: usage.effortDropped ?? null,
    }
    ended = 'ready'
    await runner.dispose?.()
  } finally {
    if (saved.base === undefined) delete process.env.ANTHROPIC_BASE_URL
    else process.env.ANTHROPIC_BASE_URL = saved.base
    if (saved.key === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = saved.key
    if (saved.toolSearch === undefined) delete process.env.ENABLE_TOOL_SEARCH
    else process.env.ENABLE_TOOL_SEARCH = saved.toolSearch
    fake?.close()
    try { await disposeRunnerSessions() } catch (error) { void error }
    try { await set?.close?.() } catch (error) { void error }
  }
  const teamNames = ['ask_colleague', 'pass_forward', 'ask_team_opinion', 'persona_ask']
  const seenTeam = seen.firstTools.filter(tool => teamNames.some(name => tool.name.endsWith(name)))
  return {
    toolLevel, permissionMode, real,
    hostOffer: offered,
    // REAL mode only: the tools the MODEL chose to call (empty = it answered without any); `usage` is the vendor's own count.
    ...(real ? { modelChose: chosen, usage: usageRow } : {}),
    // EFF-1: the options the OAR session was opened with (the CLI's --model/--effort) and the entries the ledger sink got (tokens, ids and the choice; no text, no secret).
    sessionOptionsHandedToOar: opened.map(options => ({ model: options.model ?? null, effort: (options as { effort?: string }).effort ?? null })),
    sinkEntries,
    guidanceText: guidance ?? null,
    guidanceChars: guidance?.length ?? 0,
    guidanceTokensEstimate: guidance === undefined ? 0 : Math.round(guidance.length / 2.483),
    requestsToEndpoint: seen.count,
    firstRequest: {
      toolNamesInRequest: seen.firstTools.map(tool => tool.name),
      teamToolsInRequest: seenTeam.map(tool => tool.name),
      teamDefinitionChars: seenTeam.reduce((total, tool) => total + tool.chars, 0),
      naturalRequestInPrompt: seen.firstText.includes(NATURAL),
      guidanceInPrompt: guidance !== undefined && seen.firstText.includes(guidance),
      personaIdentityInPrompt: seen.firstText.includes('Você é Bia') ,
      promptTextTheModelSaw: seen.firstText,
      // `deferred`: the CLI listed the tools by NAME only (their schemas load when the model asks for them with ToolSearch)
      deferred: seen.deferredNames === true,
      toolNamedInTheTurnText: seen.namedInText === true,
    },
    toolSearchUsedByTheScriptedModel: seen.toolSearchUsed === true,
    scriptedModelCalled: seen.called ?? null,
    hostReceivedHandoff: handoffs,
    toolResultBackToModel: seen.toolResult.slice(0, 220),
    ended, finalText: text.slice(0, 120),
  }
}

const REAL = process.env.PERSONA_TEAM_OFFER_REAL === '1'

/** The guards of the real call: fail closed before anything can reach a model. */
function assertRealGuards(): void {
  const problems: string[] = []
  if (process.env.PERSONA_REAL_E2E !== '1') problems.push('PERSONA_REAL_E2E=1 is required')
  if (process.env.PERSONA_LOCK !== 'real') problems.push('run under the `real` lock (PERSONA_LOCK=real)')
  const cap = Number(process.env.PERSONA_REAL_TURN_CAP)
  if (!Number.isInteger(cap) || cap < 1 || cap > 2) problems.push('PERSONA_REAL_TURN_CAP must be 1 or 2')
  const ledger = process.env.PERSONA_REAL_TURN_LEDGER ?? ''
  if (!/^([A-Za-z]:[\\/]|\/)/u.test(ledger) || existsSync(ledger)) problems.push('PERSONA_REAL_TURN_LEDGER must be an absolute path that does not exist yet')
  for (const name of ['CLAUDECODE', 'CLAUDE_PID', 'CLAUDE_EFFORT', 'MAESTRI_WORKSPACE_ID']) if (process.env[name] !== undefined) problems.push(`${name} must not be set (clean environment)`)
  if (process.env.ANTHROPIC_BASE_URL !== undefined) problems.push('ANTHROPIC_BASE_URL must not be set in a real call')
  if (problems.length > 0) throw new Error(`real call refused: ${problems.join('; ')}`)
}

async function main(): Promise<void> {
  const work = mkdtempSync(join(tmpdir(), 'persona-team-offer-'))
  try {
    const rows: Record<string, unknown>[] = []
    if (REAL) {
      assertRealGuards()
      const row = await once('none', 'deny', work, true)
      rows.push(row)
      process.stdout.write(`${JSON.stringify(row, null, 1)}\n`)
      const realOut = argOf('--out')
      if (realOut !== undefined) writeFileSync(realOut, `${JSON.stringify({ at: new Date().toISOString(), natural: NATURAL, guidance: (rows[0] as { guidanceText?: unknown } | undefined)?.guidanceText ?? null, rows }, null, 2)}\n`)
      return
    }
    // The worker of a real round runs as a call WITHOUT built-in tools (`deny`, what the ledger calls answer-only); a task with a file/shell grant runs with them (`allow-once`).
    const all = [['none', 'deny'], ['read', 'deny'], ['write', 'allow-once']] as const
    const configs = process.argv.includes('--only-tasks') ? all.filter(([, mode]) => mode === 'allow-once') : all
    for (const [level, mode] of configs) {
      const row = await once(level, mode, work)
      rows.push(row)
      process.stdout.write(`${JSON.stringify(row, null, 1)}\n`)
    }
    const out = argOf('--out')
    if (out !== undefined) writeFileSync(out, `${JSON.stringify({ at: new Date().toISOString(), natural: NATURAL, guidance: (rows[0] as { guidanceText?: unknown } | undefined)?.guidanceText ?? null, rows }, null, 2)}\n`)
  } finally {
    try { rmSync(work, { recursive: true, force: true }) } catch (error) { void error }
  }
}

await main()
