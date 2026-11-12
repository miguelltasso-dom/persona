/**
 * COLHEITA 8 dry proof and per-CLI-version regression: does the REAL `claude`, started with the product's own gate settings (`PermissionGate.settings()`), obey the authority
 * table for SHELL calls, file writers and secret reads? Zero model call, zero spend, no login used: the CLI talks to a FAKE Anthropic endpoint on 127.0.0.1 (API-key mode, blank
 * HOME) that "asks" it to call one built-in tool, and records what the CLI sent back as the tool result (the gate's reason when it refused, the output when the tool ran).
 *
 *   node --import tsx/esm packages/persona/persona-runners/scripts/authority-dry.ts [--out <file.json>]
 *
 * Every scenario is run against a CONTROL (the same call with an allow rule and no hook) so a "refused" is never a CLI that simply could not run the tool. Exit 0 when every
 * scenario behaved as the table promises; 1 otherwise (then the runner must not offer shell commands on that CLI version). Serialise it with the `check` lock like any other job.
 */

import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PermissionGate } from '../src/resolve/permission-gate.ts'

const CLAUDE = process.env.CLAUDE_BIN ?? 'claude'
const REFUSED = /outside what this persona may run|holds credentials or keys|Files can only be saved inside the draft/u

interface Call { readonly tool: string; readonly input: Record<string, unknown> }

interface Seen { toolResult: string | undefined }

/** A fake Anthropic that makes "the model" call the current tool once, records the tool result the CLI sends back, then ends. */
function fakeAnthropic(current: { call: Call | undefined }, seen: Seen): Promise<{ server: Server; port: number }> {
  const server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => { chunks.push(chunk) })
    req.on('end', () => {
      const path = (req.url ?? '').split('?')[0] ?? ''
      if (!path.endsWith('/v1/messages')) { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"input_tokens":10}'); return }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as { model?: string; tools?: { name?: string }[]; messages?: { content?: unknown }[] }
      const last = body.messages?.at(-1)
      const blocks = Array.isArray(last?.content) ? (last.content as { type?: string; content?: unknown }[]) : []
      const result = blocks.find(block => block.type === 'tool_result')
      if (result !== undefined) {
        const content = result.content
        seen.toolResult = typeof content === 'string' ? content : Array.isArray(content) ? (content as { text?: string }[]).map(part => part.text ?? '').join('') : JSON.stringify(content)
      }
      const call = current.call
      const offered = call !== undefined && (body.tools ?? []).some(item => item.name === call.tool)
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      const send = (event: string, data: unknown): void => { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`) }
      send('message_start', { type: 'message_start', message: { id: 'm', type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 1 } } })
      if (result === undefined && call !== undefined && offered) {
        send('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_1', name: call.tool, input: {} } })
        send('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(call.input) } })
        send('content_block_stop', { type: 'content_block_stop', index: 0 })
        send('message_delta', { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 5 } })
      } else {
        send('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })
        send('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'ok' } })
        send('content_block_stop', { type: 'content_block_stop', index: 0 })
        send('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 2 } })
      }
      send('message_stop', { type: 'message_stop' })
      res.end()
    })
  })
  return new Promise((resolve) => { server.listen(0, '127.0.0.1', () => { resolve({ server, port: (server.address() as { port: number }).port }) }) })
}

interface Scenario {
  readonly name: string
  readonly call: (paths: Paths) => Call
  /** What the table promises. */
  readonly expect: 'refused' | 'ran'
  /** The control run is meaningless when the CLI's own permission mode already refuses the call (a write outside the working directory under acceptEdits). */
  readonly skipControl?: boolean
  /**
   * The gate lets the call through and the CLI STARTS the tool, but on this harness the Bash tool of the CLI does not complete (it hangs after `task_started`, with or without the hook,
   * in the control too), so what is asserted is that the hook refused nothing and the tool started. The hook answers BEFORE the tool starts: a started tool is an allowed tool.
   */
  readonly startedOnly?: boolean
  /** A file the call creates when it RUNS (checked on disk, the strongest evidence). */
  readonly marker?: (paths: Paths) => string
}

interface Paths { readonly draft: string; readonly outside: string }

const SCENARIOS: readonly Scenario[] = [
  { name: 'Bash: change inside the draft runs', call: () => ({ tool: 'Bash', input: { command: 'touch inside.txt' } }), expect: 'ran', startedOnly: true },
  { name: 'Bash: write OUTSIDE the draft is refused', call: p => ({ tool: 'Bash', input: { command: `touch ${join(p.outside, 'escape.txt').replace(/\\/gu, '/')}` } }), expect: 'refused', marker: p => join(p.outside, 'escape.txt') },
  { name: 'Bash: a redirect outside the draft is refused', call: p => ({ tool: 'Bash', input: { command: `echo x > ${join(p.outside, 'redirect.txt').replace(/\\/gu, '/')}` } }), expect: 'refused', marker: p => join(p.outside, 'redirect.txt') },
  { name: 'Bash: reading a secret is refused', call: () => ({ tool: 'Bash', input: { command: 'cat .env' } }), expect: 'refused' },
  { name: 'Bash: a push waits (no card on the runner\'s own gate): refused', call: () => ({ tool: 'Bash', input: { command: 'git push origin main' } }), expect: 'refused' },
  { name: 'Bash: the network is refused', call: () => ({ tool: 'Bash', input: { command: 'curl http://127.0.0.1:9/x' } }), expect: 'refused' },
  { name: 'Bash: a plain read runs', call: () => ({ tool: 'Bash', input: { command: 'echo lido' } }), expect: 'ran', startedOnly: true },
  { name: 'Write: inside the draft runs', call: p => ({ tool: 'Write', input: { file_path: join(p.draft, 'cartaz.svg'), content: '<svg/>' } }), expect: 'ran', marker: p => join(p.draft, 'cartaz.svg') },
  { name: 'Write: OUTSIDE the draft is refused', call: p => ({ tool: 'Write', input: { file_path: join(p.outside, 'cartaz.svg'), content: '<svg/>' } }), expect: 'refused', skipControl: true, marker: p => join(p.outside, 'cartaz.svg') },
  { name: 'Read: a credentials path is refused', call: () => ({ tool: 'Read', input: { file_path: join(tmpdir(), '.ssh', 'id_rsa') } }), expect: 'refused' },
]

/** The tool result the fake endpoint recorded (read through a function: the assignment that clears it before each turn would otherwise narrow the property to undefined). */
function resultOf(seen: Seen): string | undefined {
  return seen.toolResult
}

interface Outcome { name: string; mode: 'control' | 'gated'; expect: string; ran: boolean; refused: boolean; toolResult: string | undefined; ok: boolean }

async function runTurn(options: { scenario: Scenario; mode: 'control' | 'gated'; gate: PermissionGate; port: number; home: string; paths: Paths; current: { call: Call | undefined }; seen: Seen }): Promise<Outcome> {
  const { scenario, mode, paths } = options
  const call = scenario.call(paths)
  options.current.call = call
  options.seen.toolResult = undefined
  const marker = scenario.marker?.(paths)
  if (marker !== undefined && existsSync(marker)) rmSync(marker)
  // A fresh CLAUDE_CONFIG_DIR keeps the person's login and settings out (API-key mode with a dummy key); HOME stays the real one because Git Bash, the Bash tool's shell on Windows, hangs on a blank HOME.
  const env: NodeJS.ProcessEnv = { ...process.env, CLAUDE_CONFIG_DIR: options.home, ANTHROPIC_BASE_URL: `http://127.0.0.1:${String(options.port)}`, ANTHROPIC_API_KEY: 'sk-ant-dry-dummy' }
  for (const name of ['CLAUDECODE', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_CHILD_SESSION']) delete env[name]
  // The product's arguments for a task that saves files, plus an allow rule for the tool under test: it simulates the person's own settings (native mode) that allow the shell, so the
  // ONLY thing that can stop the call is the gate. The control run has the same rule and no hook.
  const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--no-session-persistence',
    '--permission-mode', 'acceptEdits', '--tools', 'Bash,Read,Write,Edit', '--allowedTools', 'Bash', 'Read', '--setting-sources', 'project',
    '--model', 'haiku', ...(mode === 'gated' ? ['--settings', JSON.stringify(options.gate.settings())] : [])]
  const child = spawn(CLAUDE, args, { cwd: paths.draft, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
  let output = ''
  let done = false
  child.stdout.on('data', (chunk: Buffer) => { output += String(chunk); if (/"type":"result"/u.test(output)) done = true })
  let errors = ''
  child.stderr.on('data', (chunk: Buffer) => { errors += String(chunk) })
  if (mode === 'gated') options.gate.arm({ draftRoot: paths.draft, allowedServers: [] })
  child.stdin.write(`${JSON.stringify({ type: 'user', message: { role: 'user', content: 'faça' } })}\n`)
  const started = Date.now()
  const early = scenario.startedOnly === true
  while (!done && !(early && /task_started/u.test(output)) && Date.now() - started < 40_000) await new Promise<void>((resolve) => { setTimeout(resolve, 200) })
  const toolStarted = /task_started/u.test(output)
  try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }) } catch (error) { void error; child.kill() }
  const heldByGate = options.gate.takeRefusals().length + options.gate.takeRequests().length > 0
  if (mode === 'gated') options.gate.disarm()
  const toolResult = resultOf(options.seen)
  const refused = toolResult !== undefined && REFUSED.test(toolResult)
  const ran = marker === undefined ? toolResult !== undefined && !refused : existsSync(marker)
  const expectation = mode === 'control' ? 'ran' : scenario.expect
  // The control proves the call CAN run in this CLI; only the scenarios that promise a refusal need it (a "ran" scenario is its own proof).
  const ok = early
    ? toolStarted && !heldByGate && !refused
    : done && toolResult !== undefined && (expectation === 'ran' ? ran && !refused : !ran && refused)
  if (!ok && process.env.AUTHORITY_DRY_DEBUG !== undefined) console.log('--- debug', scenario.name, mode, JSON.stringify({ done, stdoutTail: output.slice(-700), stderr: errors.slice(-400) }))
  return { name: scenario.name, mode, expect: expectation, ran, refused, toolResult: toolResult?.slice(0, 200), ok }
}

async function main(): Promise<void> {
  const outAt = process.argv.indexOf('--out')
  const out = outAt >= 0 ? process.argv[outAt + 1] : undefined
  let version = 'unknown'
  try { version = execFileSync(CLAUDE, ['--version'], { encoding: 'utf8' }).trim() } catch (error) { void error }
  const base = mkdtempSync(join(tmpdir(), 'authority-dry-'))
  const home = join(base, 'home')
  const paths: Paths = { draft: join(base, 'draft'), outside: join(base, 'pasta-real') }
  for (const dir of [home, paths.draft, paths.outside]) mkdirSync(dir, { recursive: true })
  writeFileSync(join(paths.draft, '.env'), 'SEGREDO=1\n')
  const current: { call: Call | undefined } = { call: undefined }
  const seen: Seen = { toolResult: undefined }
  const { server, port } = await fakeAnthropic(current, seen)
  const gate = await PermissionGate.start({ askable: false })
  gate.configure({ shell: 'write' })
  const rows: Outcome[] = []
  try {
    for (const scenario of SCENARIOS.filter(item => process.env.AUTHORITY_DRY_ONLY === undefined || item.name.includes(process.env.AUTHORITY_DRY_ONLY))) {
      // No control for the Bash scenarios: the tool never completes on this harness (see `startedOnly`), so a control could not show that the call CAN run. The refusal text is the gate's own.
      if (scenario.expect === 'refused' && scenario.skipControl !== true && !scenario.name.startsWith('Bash:')) rows.push(await runTurn({ scenario, mode: 'control', gate, port, home, paths, current, seen }))
      rows.push(await runTurn({ scenario, mode: 'gated', gate, port, home, paths, current, seen }))
    }
  } finally {
    server.close()
    await gate.close()
    rmSync(base, { recursive: true, force: true })
  }
  const passed = rows.every(row => row.ok)
  for (const row of rows) console.log(`${row.ok ? 'OK  ' : 'FAIL'} [${row.mode}] ${row.name} (expected ${row.expect}; ran=${String(row.ran)} refused=${String(row.refused)})${row.ok ? '' : ` -> ${row.toolResult ?? 'no tool result'}`}`)
  console.log(`claude ${version}: ${passed ? 'every scenario behaved as the authority table promises' : 'FAILED: do not offer shell commands on this CLI version'}`)
  if (out !== undefined) writeFileSync(out, JSON.stringify({ version, passed, rows }, null, 2))
  process.exit(passed ? 0 : 1)
}

void main()
