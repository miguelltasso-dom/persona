/**
 * OPT-10b: the real round of the `needed` mode — ONE read-only task on ONE connector, with a TEST connector (persona-spec/contracts/needed-real-round.md).
 * Atlas (05/11): authorised, but NOT on the person's account — "nothing of Miguel's Gmail, not even the labels: it is personal data". The connector is a local
 * fixture of 30 tools (`src/mcp/connector-fixture.ts`: the size of a real mail connector, synthetic answers) served to the CLI like the product's own tools.
 * The pre-registered criterion and the guards live in the engine (`bench/needed-round.ts`, tested before any data); this script only runs the plan.
 * This script never lists, reads or touches an account connector.
 *
 *   DRY (default; no CLI, no login): prints the plan and the criterion and runs the verdict on synthetic attempts to prove the wiring.
 *     node --import tsx/esm packages/persona/persona-runners/scripts/needed-real.ts
 *
 *   --preflight (ZERO model; the real CLI): proves `needed` for the version, MEASURES what the fixture adds to a task call (the CLI's own count, no prompt),
 *   fixes the limit of the request from that measurement, builds the runner exactly as the real round would (observed runtime, permission gate armed
 *   read-only, the fixture as the connector) and stops BEFORE any turn.
 *     node --import tsx/esm packages/persona/persona-runners/scripts/needed-real.ts --preflight [--out <file.json>]
 *
 *   REAL (Atlas's OK 05/11, inside the `real` lock, limiter ON with a FRESH absolute ledger, ceiling 3):
 *     PERSONA_NEEDED_REAL=1 PERSONA_REAL_E2E=1 PERSONA_CLI_ENV=needed PERSONA_REAL_TURN_CAP=3 PERSONA_REAL_TURN_LEDGER=<abs fresh path> \
 *       node scripts/persona/with-lock.mjs "Tally needed" --lock real --wait-max 3600000 -- \
 *       node --import tsx/esm packages/persona/persona-runners/scripts/needed-real.ts
 *   It exits at ZERO cost when `needed` is not proven for the installed version or the fixture does not come up connected.
 */

import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  NEEDED_CALL_CAP, NEEDED_FLOOR_TOKENS, NEEDED_TASKS, NEEDED_TOLERANCE, answerSharesWord, assertNeededGuards, evaluateNeededRound, renderNeededReport,
  type NeededAttempt, type NeededPlan, type NeededToolCall,
} from '@deepseek-ai/dsh-persona-engine'
import { PermissionGate, ToolObserver, annotationTable, callsForCriterion, contextDelta, disposeRunnerSessions, isolationPlan, measureContext, observeRuntime, openClaudeControl, probeCwd, proveCliIsolation, resolveRunner } from '../src/index.ts'
import { FIXTURE_SERVER, connectorFixtureDefinitions, connectorFixtureStatus, connectorFixtureToolSet, type FixtureCall } from '../src/mcp/connector-fixture.ts'

const REAL = process.env.PERSONA_NEEDED_REAL === '1'
const PREFLIGHT = process.argv.includes('--preflight') || REAL
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const SIDE_MS = 5 * 60_000
const TOOLS = 30
const TASK = NEEDED_TASKS.mail

function argOf(name: string): string | undefined {
  const at = process.argv.indexOf(name)
  return at >= 0 ? process.argv[at + 1] : undefined
}

// ---- the dry rehearsal (no CLI) ----------------------------------------------------------------------------------------------

function dryRehearsal(): void {
  const plan: NeededPlan = { grantedServer: FIXTURE_SERVER, connectorTokens: 12_644, allowContent: true }
  const read = (over: Partial<NeededToolCall> = {}): NeededToolCall => ({ server: FIXTURE_SERVER, tool: 'list_labels', actionClass: 'read', denied: false, ok: true, ...over })
  const good: NeededAttempt = { attempt: 1, effectiveMode: 'needed', toolCalls: [read()], maxRequestInputTokens: 46_000, finalTextChars: 120, answerSharesWord: true }
  const rows: readonly [string, readonly NeededAttempt[]][] = [
    ['tudo certo (sintético)', [good]],
    ['o modelo tentou enviar e o portão recusou (sintético)', [{ ...good, toolCalls: [read(), read({ tool: 'send_message', actionClass: 'send', denied: true })] }]],
    ['a requisição trouxe a conta toda (sintético, 308.902)', [{ ...good, maxRequestInputTokens: 308_902 }]],
    ['o resultado da ferramenta não foi observável (sintético)', [{ ...good, answerSharesWord: undefined }]],
  ]
  const lines = [
    '# OPT-10b — ensaio SECO do modo `needed` com o conector de TESTE (sem CLI, sem login, sem modelo)',
    '',
    `Tarefa única, só leitura, num conector de teste local de ${String(TOOLS)} ferramentas e respostas sintéticas (nada da conta de ninguém); teto ${String(NEEDED_CALL_CAP)} chamadas; piso ${String(NEEDED_FLOOR_TOKENS)} tokens; tolerância ${String(NEEDED_TOLERANCE)}× (piso + o que o conector acrescenta, MEDIDO pelo pré-voo).`,
    'Guardas do modo real: `PERSONA_NEEDED_REAL=1`, `PERSONA_REAL_E2E=1`, trava `real`, `PERSONA_CLI_ENV=needed`, `PERSONA_REAL_TURN_CAP` ≤ 3, `PERSONA_REAL_TURN_LEDGER` absoluto e FRESCO.',
    '',
    '| caso sintético | veredito | motivo |',
    '|---|---|---|',
    ...rows.map(([name, attempts]) => { const result = evaluateNeededRound(plan, attempts); return `| ${name} | ${result.verdict} | ${result.reason} |` }),
    '',
  ]
  process.stdout.write(`${lines.join('\n')}\n`)
  writeFileSync(join(root, 'persona-spec/reports/needed-real-dry.md'), `${lines.join('\n')}\n`)
}

// ---- the pre-flight (zero model, real CLI) -------------------------------------------------------------------------------------

interface Prepared {
  readonly version: string
  /** What the fixture adds to a task call, by the CLI's own count; and the floor it measured without it. */
  readonly fixtureTokens: number
  readonly measuredFloor: number
  readonly summary: Record<string, unknown>
}

/** Everything up to the first turn. `prepared` is absent when the round must end at zero cost (and has said why). */
async function preflight(env: NodeJS.ProcessEnv): Promise<{ readonly prepared: Prepared | undefined; readonly summary: Record<string, unknown> }> {
  const oar = await import('@botiverse/oar')
  const runtime = oar.defaultRuntimes.get('claude')
  const installation = runtime?.installation === undefined ? undefined : await runtime.installation()
  if (installation === undefined || installation.kind !== 'available' || installation.via !== 'executable') {
    process.stdout.write('pre-flight: o executável do claude não está disponível; nada foi gasto.\n')
    return { prepared: undefined, summary: { stopReason: 'no-cli' } }
  }
  const version = installation.version ?? 'unknown'
  const proof = await proveCliIsolation({ mode: 'needed', modelArg: 'haiku', env, call: 'task' })
  process.stdout.write(`pre-flight: ${proof.reason}\n`)
  if (!proof.ok) return { prepared: undefined, summary: { version, needed: false, stopReason: 'needed-not-proven' } }
  // The launch of a task call in `needed`: the plan's arguments and env, the vendor's own built-in tools. Counted with and without the fixture.
  const plan = isolationPlan('claude', { env, call: 'task' })
  const open = openClaudeControl(installation.command)
  const cwd = probeCwd()
  try {
    const launch = { args: [...plan.launchArgs], env: { ...plan.env }, cwd: cwd.dir }
    const baseline = await measureContext(open, launch)
    const withFixture = await measureContext(open, { ...launch, server: { name: FIXTURE_SERVER, definitions: connectorFixtureDefinitions(TOOLS), work: cwd.dir } })
    const delta = contextDelta(withFixture, baseline)
    const summary: Record<string, unknown> = {
      at: new Date().toISOString(), version, needed: true, tools: TOOLS,
      measuredFloorTokens: baseline.totalTokens ?? null, registeredFloorTokens: NEEDED_FLOOR_TOKENS,
      fixtureConnected: withFixture.connected, fixtureServerTools: withFixture.serverTools, fixtureTokens: delta ?? null,
    }
    process.stdout.write(`pre-flight: conector de teste ${withFixture.connected ? 'conectado' : 'NÃO conectou'} com ${String(withFixture.serverTools)} ferramentas; piso medido ${String(baseline.totalTokens ?? '?')}; o conector acrescenta ${String(delta ?? '?')} tokens por requisição (contagem da própria CLI)\n`)
    // +0 is a valid reading: with the vendor's built-in tools present the CLI DEFERS the schemas of an MCP server that has many tools (they load when the model asks
    // for them), so the opening context does not grow. Only a connector that did not come up, or a count that is missing or negative, ends the round at zero cost.
    if (!withFixture.connected || delta === undefined || delta < 0 || baseline.totalTokens === undefined) return { prepared: undefined, summary: { ...summary, stopReason: 'fixture-not-measured' } }
    return { prepared: { version, fixtureTokens: delta, measuredFloor: baseline.totalTokens, summary }, summary }
  } finally {
    cwd.dispose()
  }
}

/** The runner exactly as the real round builds it: observed runtime, gate armed read-only, the fixture as the connector. Nothing is started. */
async function buildRunner(env: NodeJS.ProcessEnv): Promise<{ readonly runner: Awaited<ReturnType<typeof resolveRunner>>; readonly gate: PermissionGate; readonly observer: ToolObserver; readonly dispose: () => Promise<void> }> {
  const oar = await import('@botiverse/oar')
  const base = oar.defaultRuntimes.get('claude')
  if (base === undefined) throw new Error('the claude runtime is not available')
  const annotations = annotationTable(connectorFixtureStatus(TOOLS))
  const observer = new ToolObserver(annotations)
  const gate = await PermissionGate.start({ annotations })
  const runner = await resolveRunner({
    spec: { kind: 'cli', cli: 'claude', model: 'haiku' }, permissionMode: 'allow-once', toolLevel: 'read', autonomy: 'act', purpose: 'task',
    permissionGate: gate, runtime: observeRuntime(base, observer), env,
  })
  return { runner, gate, observer, dispose: async () => { try { await runner.dispose?.() } catch (error) { void error } await gate.close(); try { await disposeRunnerSessions() } catch (error) { void error } } }
}

// ---- the real round ---------------------------------------------------------------------------------------------------------------


/**
 * ONE attempt: build the runner, send the task, collect what the criterion reads. Whatever goes wrong is PRINTED with its reason (the runner's own report, an infra
 * event, or the error message: short strings with no personal data), so a failure of OURS cannot pass for the CLI's: an attempt that fails says why.
 */
async function attemptOnce(prepared: Prepared, env: NodeJS.ProcessEnv, number: number, cwd: string): Promise<NeededAttempt> {
  void prepared
  const built = await buildRunner(env)
  let text = ''
  const notes: string[] = []
  try {
    built.gate.arm({ preAllow: ['read'], approved: [] })
    const ran: FixtureCall[] = []
    const handle = await built.runner.start({
      ticketId: `needed-${String(number)}`, assignmentId: `needed-${String(number)}`, personaId: `tally-needed-${String(number)}`, cwd,
      prompt: TASK, model: 'haiku', permissionMode: 'allow-once', mcpTools: connectorFixtureToolSet({ count: TOOLS, calls: ran }),
    })
    let ended = false
    await withTimeout(SIDE_MS, (async () => {
      for await (const event of built.runner.stream(handle)) {
        if (event.type === 'delta') text += event.text
        if (event.type === 'infra') notes.push(`infra ${event.kind}: ${event.summary.slice(0, 160)}`)
        if (event.type === 'ended') {
          ended = event.report.state !== 'failed' && event.report.state !== 'dropped'
          notes.push(`fim ${event.report.state}: ${event.report.summary.slice(0, 200)}`)
        }
      }
    })(), async () => { await built.runner.cancel(handle) })
    const usage = await built.runner.usage(handle)
    const refused = new Set(built.gate.takeRequests().map(request => request.tool))
    // The CLI's own schema lookup (ToolSearch) is plumbing, not a tool the task uses: it is out of the calls the criterion reads and in the requests of the turn.
    const seen = callsForCriterion(built.observer.report(), refused)
    const calls = seen.calls.map((call): NeededToolCall => ({
      server: call.server, tool: call.name, actionClass: call.actionClass, denied: call.denied, ...(call.ok === undefined || call.denied ? {} : { ok: call.ok }),
    }))
    // The turn reports ONE total. Every tool call (the deferred-schema lookup included) is followed by one more request, so the requests of the turn are
    // the tool calls + 1 and the average per request is the total / that (a turn with parallel calls would have fewer requests: rare for this task).
    const requests = seen.requests
    const failedForCli = !ended || usage.inputTokens <= 0
    const attempt: NeededAttempt = {
      attempt: number, ...(failedForCli ? { failedForCli: true } : {}), ...(usage.envMode === undefined ? {} : { effectiveMode: usage.envMode }),
      toolCalls: calls, ...(usage.inputTokens > 0 ? { maxRequestInputTokens: Math.ceil(usage.inputTokens / requests) } : {}),
      finalTextChars: text.length,
      ...(calls.some(call => call.server === FIXTURE_SERVER && call.ok !== undefined)
        ? { answerSharesWord: built.observer.anyResult(FIXTURE_SERVER, result => answerSharesWord(text, result, TASK)) }
        : {}),
    }
    process.stdout.write(`attempt ${String(number)}: ${failedForCli ? `NÃO CONCLUIU (terminou=${String(ended)}, entrada=${String(usage.inputTokens)}, saída=${String(usage.outputTokens)}); ${notes.join(' | ') || 'o runner não deu motivo'}` : `ok · modo ${usage.envMode ?? '?'} · ${String(calls.length)} chamada(s) de ferramenta (${String(ran.length)} executada(s) pelo conector de teste) · entrada ${String(usage.inputTokens)} · saída ${String(usage.outputTokens)}`}\n`)
    return attempt
  } catch (error) {
    // A reason of the CLI or the network is recorded as a failed attempt (replaced once), never retried silently; the reason is PRINTED.
    process.stdout.write(`attempt ${String(number)}: LANÇOU (${error instanceof Error ? error.message.slice(0, 400) : String(error).slice(0, 400)})${notes.length > 0 ? `; ${notes.join(' | ')}` : ''}\n`)
    return { attempt: number, failedForCli: true, toolCalls: [], finalTextChars: 0 }
  } finally {
    await built.dispose()
  }
}

async function realRound(prepared: Prepared, env: NodeJS.ProcessEnv): Promise<void> {
  const { ledger } = assertNeededGuards(env)
  if (existsSync(ledger)) throw new Error('the ledger must be FRESH: this file already exists, so a previous round may have spent calls (a repeat needs a new OK from Atlas)')
  if (process.env.VITEST !== undefined || process.env.PERSONA_SCRIPTED !== undefined) throw new Error('clean environment required: VITEST / PERSONA_SCRIPTED must not be set')
  // The fixture holds no personal data, so a content tool of it is no leak; writes stay refused by the gate.
  const plan: NeededPlan = { grantedServer: FIXTURE_SERVER, connectorTokens: prepared.fixtureTokens, allowContent: true }
  const cwd = mkdtempSync(join(tmpdir(), 'persona-needed-real-'))
  const attempts: NeededAttempt[] = []
  try {
    for (const number of [1, 2] as const) {
      if (attempts.length >= NEEDED_CALL_CAP) break
      const attempt = await attemptOnce(prepared, env, number, cwd)
      attempts.push(attempt)
      if (attempt.failedForCli !== true) break
    }
  } finally {
    try { rmSync(cwd, { recursive: true, force: true }) } catch (error) { void error }
  }
  const result = evaluateNeededRound(plan, attempts)
  const report = renderNeededReport(plan, attempts, result)
  process.stdout.write(`\n${report}\n`)
  writeFileSync(join(root, 'persona-spec/reports/needed-real.md'), `${report}\n`)
  writeFileSync(join(root, 'persona-spec/reports/needed-real.json'), `${JSON.stringify({ plan: { connector: 'fixture', tools: TOOLS, connectorTokens: plan.connectorTokens, floorMeasured: prepared.measuredFloor }, attempts, result }, null, 2)}\n`)
  process.exitCode = result.verdict === 'pass' ? 0 : 1
}

async function withTimeout(ms: number, work: Promise<void>, onTimeout: () => Promise<void>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<'timeout'>((resolveTimeout) => { timer = setTimeout(() => { resolveTimeout('timeout') }, ms) })
  const won = await Promise.race([work.then(() => 'done' as const), timeout])
  if (timer !== undefined) clearTimeout(timer)
  if (won === 'timeout') { await onTimeout(); throw new Error('timeout') }
}


/** A fake Anthropic on 127.0.0.1: "the model" looks for the fixture's list_labels (searching for it first when the CLI deferred its schema), calls it once, then answers. */
async function fakeAnthropic(requests: { count: number; maxChars: number }): Promise<{ readonly close: () => void; readonly port: number }> {
  const { createServer } = await import('node:http')
  const server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => { chunks.push(chunk) })
    req.on('end', () => {
      const path = (req.url ?? '').split('?')[0] ?? ''
      if (!path.endsWith('/v1/messages')) { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"input_tokens":10}'); return }
      const raw = Buffer.concat(chunks).toString('utf8')
      requests.count += 1
      requests.maxChars = Math.max(requests.maxChars, raw.length)
      const body = JSON.parse(raw || '{}') as { model?: string; tools?: { name?: string }[]; messages?: { role?: string; content?: unknown }[] }
      const names = (body.tools ?? []).map(item => item.name ?? '')
      const blocks = (body.messages ?? []).flatMap(message => (Array.isArray(message.content) ? message.content as { type?: string; name?: string }[] : []))
      const called = blocks.some(block => block.type === 'tool_use' && block.name === `mcp__${FIXTURE_SERVER}__list_labels`)
      const searched = blocks.some(block => block.type === 'tool_use' && block.name === 'ToolSearch')
      const target = `mcp__${FIXTURE_SERVER}__list_labels`
      let call: { name: string; input: unknown } | undefined
      if (!called && names.includes(target)) call = { name: target, input: {} }
      else if (!called && !searched && names.includes('ToolSearch')) call = { name: 'ToolSearch', input: { query: `select:${target}`, max_results: 1 } }
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      const send = (event: string, data: unknown): void => { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`) }
      send('message_start', { type: 'message_start', message: { id: 'm', type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 1 } } })
      if (call !== undefined) {
        send('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: `toolu_${String(requests.count)}`, name: call.name, input: {} } })
        send('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(call.input) } })
        send('content_block_stop', { type: 'content_block_stop', index: 0 })
        send('message_delta', { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 5 } })
      } else {
        send('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })
        send('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Há 6 rótulos: INBOX, SENT e DRAFT.' } })
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

/**
 * ZERO model: the SAME attempt as the real round (same runner, gate, observer, fixture, mode) but the CLI talks to a fake endpoint on 127.0.0.1 with a dummy API
 * key, so nothing can reach a model or spend a token. It proves, before any real call, that the attempt gets to a verdict and shows the reason when it does not.
 */
async function fakeRehearsal(prepared: Prepared, env: NodeJS.ProcessEnv): Promise<void> {
  const requests = { count: 0, maxChars: 0 }
  const fake = await fakeAnthropic(requests)
  const saved = { base: process.env.ANTHROPIC_BASE_URL, key: process.env.ANTHROPIC_API_KEY }
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${String(fake.port)}`
  process.env.ANTHROPIC_API_KEY = 'sk-ant-dry-dummy'
  const cwd = mkdtempSync(join(tmpdir(), 'persona-needed-fake-'))
  try {
    const attempt = await attemptOnce(prepared, { ...env, ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL, ANTHROPIC_API_KEY: 'sk-ant-dry-dummy' }, 1, cwd)
    const result = evaluateNeededRound({ grantedServer: FIXTURE_SERVER, connectorTokens: prepared.fixtureTokens, allowContent: true }, [attempt])
    process.stdout.write(`rehearsal (endpoint falso, 0 modelo): ${String(requests.count)} requisição(ões) ao endpoint; veredito do critério com os números FALSOS: ${result.verdict} — ${result.reason}\n`)
    for (const check of result.checks) process.stdout.write(`  ${check.id}: ${check.ok === undefined ? 'sem evidência' : check.ok ? 'sim' : 'NÃO'} — ${check.why}\n`)
  } finally {
    fake.close()
    if (saved.base === undefined) delete process.env.ANTHROPIC_BASE_URL
    else process.env.ANTHROPIC_BASE_URL = saved.base
    if (saved.key === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = saved.key
    try { rmSync(cwd, { recursive: true, force: true }) } catch (error) { void error }
  }
}

async function main(): Promise<void> {
  if (!PREFLIGHT) { dryRehearsal(); return }
  const env: NodeJS.ProcessEnv = { ...process.env, PERSONA_CLI_ENV: 'needed' }
  const { prepared, summary } = await preflight(env)
  const out = argOf('--out')
  if (prepared === undefined) {
    if (out !== undefined) writeFileSync(out, `${JSON.stringify({ ...summary, modelCalls: 0 }, null, 2)}\n`)
    process.exitCode = 3
    return
  }
  if (process.argv.includes('--fake') && !REAL) {
    await fakeRehearsal(prepared, env)
    return
  }
  if (!REAL) {
    // Build the runner as the real round would, then stop: no turn is started, no model is called.
    const built = await buildRunner(env)
    try {
      built.gate.arm({ preAllow: ['read'], approved: [] })
      if (process.argv.includes('--prime')) {
        // ZERO model: `prime` spawns the CLI session and serves the tools exactly as a turn does, but sends no prompt. A failure that is ours shows here.
        const cwd = mkdtempSync(join(tmpdir(), 'persona-needed-prime-'))
        try {
          const handle = await built.runner.prime?.({ ticketId: 'prime', assignmentId: 'prime', personaId: 'tally-needed-prime', cwd, prompt: '', model: 'haiku', permissionMode: 'allow-once', mcpTools: connectorFixtureToolSet({ count: TOOLS }) })
          process.stdout.write(`prime: ${handle === undefined ? 'sem prime neste runner' : 'a sessão subiu (CLI iniciada, ferramentas servidas); nenhum prompt enviado'}\n`)
          if (handle !== undefined) await built.runner.cancel(handle)
        } catch (error) {
          process.stdout.write(`prime FALHOU: ${error instanceof Error ? error.message.slice(0, 600) : String(error).slice(0, 600)}\n`)
          process.exitCode = 4
        } finally {
          rmSync(cwd, { recursive: true, force: true })
        }
      }
      const limit = Math.round(NEEDED_TOLERANCE * (NEEDED_FLOOR_TOKENS + Math.max(prepared.fixtureTokens, 2_875)))
      process.stdout.write(`pre-flight: runner montado (observador, portão armado só com leitura, conector de teste como ferramentas do turno, modo ${env.PERSONA_CLI_ENV ?? '?'}); limite da requisição = ${String(NEEDED_TOLERANCE)} × (${String(NEEDED_FLOOR_TOKENS)} + ${String(prepared.fixtureTokens)}) = ${String(limit)}; nenhum turno iniciado; 0 chamadas de modelo.\n`)
      if (out !== undefined) writeFileSync(out, `${JSON.stringify({ ...prepared.summary, maxRequestInputAllowed: limit, runnerBuilt: true, modelCalls: 0 }, null, 2)}\n`)
    } finally {
      await built.dispose()
    }
    return
  }
  await realRound(prepared, env)
}

main().catch((error: unknown) => {
  process.stderr.write(`needed-real: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
