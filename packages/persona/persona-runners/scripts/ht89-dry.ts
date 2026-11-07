/**
 * HT-8/HT-9 dry proof and per-CLI-version regression: does the REAL `claude`, started with the product's own gate settings
 * (`PermissionGate.settings()`), obey the gate? Zero model call, zero spend, no login used: the CLI talks to a FAKE Anthropic endpoint
 * on 127.0.0.1 (API-key mode, blank HOME) that "asks" it to call `mcp__fake__send_message`, and a local fake MCP server records when a
 * tool REALLY runs.
 *
 *   node --import tsx/esm packages/persona/persona-runners/scripts/ht89-dry.ts [--out <file.json>]
 *
 * Exit 0 when every scenario behaved as the gate promises; 1 otherwise (then the runner must not release writes: read-only).
 * Serialise it with the `check` lock like any other job.
 */

import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PermissionGate } from '../src/resolve/permission-gate.ts'
import { argsHash } from '../src/resolve/tool-input.ts'

const CLAUDE = process.env.CLAUDE_BIN ?? 'claude'
const INPUT = { to: 'ana@x.com', body: 'oi' }
const TOOL = 'mcp__fake__send_message'

const MCP_SERVER = `
const { appendFileSync } = require('node:fs')
const rl = require('node:readline').createInterface({ input: process.stdin })
const send = (m) => process.stdout.write(JSON.stringify(m) + '\\n')
rl.on('line', (line) => {
  let msg; try { msg = JSON.parse(line) } catch { return }
  if (msg.method === 'initialize') send({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: (msg.params && msg.params.protocolVersion) || '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'fake', version: '1' } } })
  else if (msg.method === 'tools/list') send({ jsonrpc: '2.0', id: msg.id, result: { tools: [{ name: 'send_message', description: 'Send', inputSchema: { type: 'object', properties: { to: { type: 'string' }, body: { type: 'string' } } } }] } })
  else if (msg.method === 'tools/call') { appendFileSync(process.env.MCP_LOG, JSON.stringify(msg.params.arguments) + '\\n'); send({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: 'ran' }] } }) }
  else if (msg.id !== undefined && msg.method !== undefined) send({ jsonrpc: '2.0', id: msg.id, result: {} })
})`

/** A fake Anthropic that makes "the model" call the tool once, then end. */
function fakeAnthropic(): Promise<{ server: Server; port: number }> {
  const server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => { chunks.push(chunk) })
    req.on('end', () => {
      const path = (req.url ?? '').split('?')[0] ?? ''
      if (!path.endsWith('/v1/messages')) { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"input_tokens":10}'); return }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as { model?: string; tools?: { name?: string }[]; messages?: { content?: unknown }[] }
      const last = body.messages?.at(-1)
      const answered = Array.isArray(last?.content) && (last.content as { type?: string }[]).some(block => block.type === 'tool_result')
      const tool = (body.tools ?? []).map(item => item.name).find(name => name === TOOL)
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      const send = (event: string, data: unknown): void => { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`) }
      send('message_start', { type: 'message_start', message: { id: 'm', type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 1 } } })
      if (!answered && tool !== undefined) {
        send('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_1', name: tool, input: {} } })
        send('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(INPUT) } })
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

interface Outcome { name: string; expectRan: boolean; ran: boolean; requests: number; ok: boolean }

async function runTurn(options: {
  name: string
  expectRan: boolean
  gate: PermissionGate
  fakePort: number
  home: string
  work: string
  mcpFile: string
  /** Replace the hook URL by one nobody listens on (the gate "is down"). */
  hookDown?: boolean
}): Promise<Outcome> {
  const log = join(options.work, `mcp-${options.name.replace(/\W+/gu, '_')}.log`)
  const mcpConfig = JSON.stringify({ mcpServers: { fake: { command: process.execPath, args: [options.mcpFile], env: { MCP_LOG: log } } } })
  const gateSettings = options.gate.settings() as { hooks: { PreToolUse: { hooks: { url: string }[] }[] }; allowedHttpHookUrls: string[] }
  if (options.hookDown === true) {
    const dead = 'http://127.0.0.1:9/hook'
    const hook = gateSettings.hooks.PreToolUse[0]?.hooks[0]
    if (hook !== undefined) hook.url = dead
    gateSettings.allowedHttpHookUrls = [dead]
  }
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: options.home, USERPROFILE: options.home, ANTHROPIC_BASE_URL: `http://127.0.0.1:${String(options.fakePort)}`, ANTHROPIC_API_KEY: 'sk-ant-dry-dummy' }
  for (const name of ['CLAUDECODE', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_CHILD_SESSION']) delete env[name]
  // The product's arguments for a gated Claude task: no allow rule anywhere; the gate is the only thing that can enable the tool.
  const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--no-session-persistence',
    '--permission-mode', 'dontAsk', '--tools', '', '--setting-sources', 'project', '--strict-mcp-config', '--mcp-config', mcpConfig,
    '--model', 'haiku', '--settings', JSON.stringify(gateSettings)]
  const child = spawn(CLAUDE, args, { cwd: options.work, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
  let output = ''
  let done = false
  child.stdout.on('data', (chunk: Buffer) => { output += String(chunk); if (/"type":"result"/u.test(output)) done = true })
  child.stderr.on('data', () => undefined)
  child.stdin.write(`${JSON.stringify({ type: 'user', message: { role: 'user', content: 'envie a mensagem' } })}\n`)
  const started = Date.now()
  while (!done && Date.now() - started < 40_000) await new Promise<void>((resolve) => { setTimeout(resolve, 200) })
  try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }) } catch (error) { void error; child.kill() }
  const ran = existsSync(log) && readFileSync(log, 'utf8').trim() !== ''
  const requests = options.gate.takeRequests().length
  return { name: options.name, expectRan: options.expectRan, ran, requests, ok: done && ran === options.expectRan }
}

async function main(): Promise<void> {
  const outAt = process.argv.indexOf('--out')
  const out = outAt >= 0 ? process.argv[outAt + 1] : undefined
  let version = 'unknown'
  try { version = execFileSync(CLAUDE, ['--version'], { encoding: 'utf8' }).trim() } catch (error) { void error }
  const home = mkdtempSync(join(tmpdir(), 'ht89-home-'))
  const work = mkdtempSync(join(tmpdir(), 'ht89-work-'))
  const mcpFile = join(work, 'fake-mcp.cjs')
  writeFileSync(mcpFile, MCP_SERVER)
  const { server, port } = await fakeAnthropic()
  const gate = await PermissionGate.start()
  const rows: Outcome[] = []
  try {
    const base = { gate, fakePort: port, home, work, mcpFile }
    gate.arm()
    rows.push(await runTurn({ ...base, name: 'nada aprovado: nega e pede', expectRan: false }))
    const asked = rows.at(-1)?.requests ?? 0
    gate.arm({ approved: [{ tool: TOOL, argsHash: argsHash(INPUT) }] })
    rows.push(await runTurn({ ...base, name: 'aprovado ESTE hash: executa', expectRan: true }))
    gate.arm({ approved: [{ tool: TOOL, argsHash: argsHash({ to: 'bia@x.com', body: 'oi' }) }] })
    rows.push(await runTurn({ ...base, name: 'aprovado OUTRO hash: nega', expectRan: false }))
    gate.arm({ preAllow: ['send'] })
    rows.push(await runTurn({ ...base, name: 'classe send pre-liberada: executa', expectRan: true }))
    gate.arm({ preAllow: ['read'] })
    rows.push(await runTurn({ ...base, name: 'so leitura pre-liberada: nega o envio', expectRan: false }))
    gate.arm({ approved: [{ tool: TOOL, argsHash: argsHash(INPUT) }] })
    rows.push(await runTurn({ ...base, name: 'gate FORA DO AR (sem regra allow): continua negado', expectRan: false, hookDown: true }))
    gate.disarm()
    rows.push(await runTurn({ ...base, name: 'gate desarmado (fora de turno): nega', expectRan: false }))
    process.stdout.write(`pedido registrado no 1o cenario: ${String(asked)}\n`)
  } finally {
    await gate.close()
    server.close()
    try { rmSync(home, { recursive: true, force: true }); rmSync(work, { recursive: true, force: true }) } catch (error) { void error }
  }
  const ok = rows.every(row => row.ok) && (rows[0]?.requests ?? 0) === 1
  for (const row of rows) process.stdout.write(`${row.ok ? 'OK  ' : 'FAIL'} ${row.name}: executou=${String(row.ran)} (esperado ${String(row.expectRan)}) pedidos=${String(row.requests)}\n`)
  if (out !== undefined) writeFileSync(out, `${JSON.stringify({ note: 'HT-8/9 gate against the real CLI; fake endpoint; zero model', claudeVersion: version, ok, rows }, null, 2)}\n`)
  process.stdout.write(`${ok ? 'GATE OBEYED' : 'GATE NOT OBEYED — release read-only only'} (claude ${version})\n`)
  process.exit(ok ? 0 : 1)
}

main().catch((error: unknown) => {
  process.stderr.write(`ht89-dry failed: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
