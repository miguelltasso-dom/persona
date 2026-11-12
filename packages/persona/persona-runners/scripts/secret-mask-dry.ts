/**
 * Carbon P0-02 dry proof and per-CLI-version regression: does the REAL `claude`, started with the product's own gate settings (`PermissionGate.settings()`), keep a typed secret away from the model?
 * Zero model call, zero spend, no login used: the CLI talks to a FAKE Anthropic endpoint on 127.0.0.1 (API-key mode, blank config dir) that "asks" it to call one tool of a FAKE browser MCP server (named
 * `browser`, like the product's), and records what the CLI sent back to the model as the tool result.
 *
 *   node --import tsx/esm packages/persona/persona-runners/scripts/secret-mask-dry.ts [--out <file.json>]
 *
 * Scenarios (the fake server's page snapshot and request body both contain the password the host "typed"):
 *   1. CONTROL: no hook. The snapshot reaches the model with the password in it (so scenario 2 proves the PostToolUse hook and not a CLI that hides it).
 *   2. window open, `take_snapshot`: allowed, and the model reads the mask instead of the password (`updatedToolOutput` replaces the tool output).
 *   3. window open, `get_network_request`: refused by the PreToolUse hook (the raw read is closed), the body never reaches the model.
 *   4. window closed, `get_network_request`: allowed and untouched (nothing was typed: no over-blocking).
 * Exit 0 when every scenario behaved; 1 otherwise (then the runner must not rely on the hook on that CLI version). Serialise it with the `check` lock like any other job.
 */

import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { registerSecretWindow } from '../src/authority/secret-window.ts'
import { PermissionGate } from '../src/resolve/permission-gate.ts'

const CLAUDE = process.env.CLAUDE_BIN ?? 'claude'
const PASSWORD = 'Padaria#Lua-2026'
const MASK = '••••••'
const REFUSED = /outside what this persona may do/u

/** A stdio MCP server named `browser`: its page snapshot and its request body both carry the password the host typed. */
const FAKE_SERVER = String.raw`
const PASSWORD = process.env.DRY_PASSWORD
const tools = [
  { name: 'take_snapshot', description: 'page snapshot', inputSchema: { type: 'object', properties: {} } },
  { name: 'get_network_request', description: 'request body', inputSchema: { type: 'object', properties: {} } },
]
const answer = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n')
let buffer = ''
process.stdin.on('data', chunk => {
  buffer += chunk
  let at
  while ((at = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, at)
    buffer = buffer.slice(at + 1)
    if (line.trim() === '') continue
    const message = JSON.parse(line)
    if (message.method === 'initialize') answer(message.id, { protocolVersion: message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'browser', version: '1' } })
    else if (message.method === 'tools/list') answer(message.id, { tools })
    else if (message.method === 'tools/call') {
      const text = message.params.name === 'take_snapshot' ? 'uid=1_0 textbox "Senha" value="' + PASSWORD + '"' : 'POST /login body: user=ana&pw=' + encodeURIComponent(PASSWORD)
      answer(message.id, { content: [{ type: 'text', text }] })
    }
  }
})
`

interface Seen { toolResult: string | undefined }

/** A fake Anthropic that makes "the model" call the current tool once, records the tool result the CLI sends back, then ends. */
function fakeAnthropic(current: { tool: string | undefined }, seen: Seen): Promise<{ server: Server; port: number }> {
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
      const tool = current.tool
      const offered = tool !== undefined && (body.tools ?? []).some(item => item.name === tool)
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      const send = (event: string, data: unknown): void => { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`) }
      send('message_start', { type: 'message_start', message: { id: 'm', type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 1 } } })
      if (result === undefined && tool !== undefined && offered) {
        send('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_1', name: tool, input: {} } })
        send('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{}' } })
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
  readonly tool: string
  readonly mode: 'control' | 'gated'
  /** The host's mask window while the scenario runs. */
  readonly window: boolean
  readonly check: (toolResult: string) => boolean
}

const SCENARIOS: readonly Scenario[] = [
  { name: 'CONTROL (no hook): the snapshot reaches the model with the password', tool: 'mcp__browser__take_snapshot', mode: 'control', window: true, check: text => text.includes(PASSWORD) },
  { name: 'window open: take_snapshot runs and the model reads the mask, never the password', tool: 'mcp__browser__take_snapshot', mode: 'gated', window: true, check: text => !text.includes(PASSWORD) && text.includes(MASK) },
  { name: 'window open: get_network_request is refused, the body never reaches the model', tool: 'mcp__browser__get_network_request', mode: 'gated', window: true, check: text => REFUSED.test(text) && !text.includes(PASSWORD) && !text.includes(encodeURIComponent(PASSWORD)) },
  { name: 'window closed: get_network_request runs untouched (nothing was typed, no over-blocking)', tool: 'mcp__browser__get_network_request', mode: 'gated', window: false, check: text => text.includes(encodeURIComponent(PASSWORD)) },
]

/** The tool result the fake endpoint recorded (read through a function: the assignment that clears it before each turn would otherwise narrow the property to undefined). */
function resultOf(seen: Seen): string | undefined {
  return seen.toolResult
}

interface Outcome { name: string; mode: string; toolResult: string | undefined; ok: boolean }

async function runTurn(options: { scenario: Scenario; gate: PermissionGate; port: number; home: string; cwd: string; mcpConfig: string; current: { tool: string | undefined }; seen: Seen }): Promise<Outcome> {
  const { scenario } = options
  options.current.tool = scenario.tool
  options.seen.toolResult = undefined
  // The same rule the product's mask uses: the password in the shapes a page shows it (as typed, percent-encoded).
  registerSecretWindow(() => scenario.window, text => (scenario.window ? text.split(PASSWORD).join(MASK).split(encodeURIComponent(PASSWORD)).join(MASK) : text))
  const env: NodeJS.ProcessEnv = { ...process.env, CLAUDE_CONFIG_DIR: options.home, ANTHROPIC_BASE_URL: `http://127.0.0.1:${String(options.port)}`, ANTHROPIC_API_KEY: 'sk-ant-dry-dummy', DRY_PASSWORD: PASSWORD }
  for (const name of ['CLAUDECODE', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_CHILD_SESSION']) delete env[name]
  const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--no-session-persistence',
    '--permission-mode', 'dontAsk', '--tools', 'Read', '--mcp-config', options.mcpConfig, '--strict-mcp-config',
    // The control carries an allow rule (the person's own settings); the gated run has none: only the gate's explicit `allow` lets a browser tool run, as in the product.
    ...(scenario.mode === 'control' ? ['--allowedTools', 'mcp__browser__take_snapshot', 'mcp__browser__get_network_request'] : ['--settings', JSON.stringify(options.gate.settings())]),
    '--model', 'haiku']
  const child = spawn(CLAUDE, args, { cwd: options.cwd, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
  let output = ''
  let done = false
  child.stdout.on('data', (chunk: Buffer) => { output += String(chunk); if (/"type":"result"/u.test(output)) done = true })
  let errors = ''
  child.stderr.on('data', (chunk: Buffer) => { errors += String(chunk) })
  if (scenario.mode === 'gated') options.gate.arm({ allowedServers: [] })
  child.stdin.write(`${JSON.stringify({ type: 'user', message: { role: 'user', content: 'faça' } })}\n`)
  const started = Date.now()
  while (!done && Date.now() - started < 60_000) await new Promise<void>((resolve) => { setTimeout(resolve, 200) })
  try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }) } catch (error) { void error; child.kill() }
  if (scenario.mode === 'gated') options.gate.disarm()
  const toolResult = resultOf(options.seen)
  const ok = done && toolResult !== undefined && scenario.check(toolResult)
  if (!ok && process.env.SECRET_DRY_DEBUG !== undefined) console.log('--- debug', scenario.name, JSON.stringify({ done, toolResult, stdoutTail: output.slice(-700), stderr: errors.slice(-400) }))
  return { name: scenario.name, mode: scenario.mode, toolResult: toolResult?.replaceAll(PASSWORD, '<senha>').slice(0, 200), ok }
}

async function main(): Promise<void> {
  const outAt = process.argv.indexOf('--out')
  const out = outAt >= 0 ? process.argv[outAt + 1] : undefined
  let version = 'unknown'
  try { version = execFileSync(CLAUDE, ['--version'], { encoding: 'utf8' }).trim() } catch (error) { void error }
  const base = mkdtempSync(join(tmpdir(), 'secret-mask-dry-'))
  const home = join(base, 'home')
  const cwd = join(base, 'draft')
  for (const dir of [home, cwd]) mkdirSync(dir, { recursive: true })
  const serverFile = join(base, 'fake-browser.mjs')
  writeFileSync(serverFile, FAKE_SERVER)
  const mcpConfig = join(base, 'mcp.json')
  writeFileSync(mcpConfig, JSON.stringify({ mcpServers: { browser: { command: process.execPath, args: [serverFile] } } }))
  const current: { tool: string | undefined } = { tool: undefined }
  const seen: Seen = { toolResult: undefined }
  const { server, port } = await fakeAnthropic(current, seen)
  const gate = await PermissionGate.start({ askable: false })
  gate.configure({ browser: true })
  const rows: Outcome[] = []
  try {
    for (const scenario of SCENARIOS) rows.push(await runTurn({ scenario, gate, port, home, cwd, mcpConfig, current, seen }))
  } finally {
    registerSecretWindow(undefined)
    server.close()
    await gate.close()
    rmSync(base, { recursive: true, force: true })
  }
  const passed = rows.every(row => row.ok)
  for (const row of rows) console.log(`${row.ok ? 'OK  ' : 'FAIL'} [${row.mode}] ${row.name}${row.ok ? '' : ` -> ${row.toolResult ?? 'no tool result'}`}`)
  console.log(`claude ${version}: ${passed ? 'a typed secret never reaches the model through the browser tools' : 'FAILED: the PostToolUse/PreToolUse masking does not hold on this CLI version'}`)
  if (out !== undefined) writeFileSync(out, JSON.stringify({ version, passed, rows }, null, 2))
  process.exit(passed ? 0 : 1)
}

void main()
