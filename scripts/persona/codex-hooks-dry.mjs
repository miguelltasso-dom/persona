/**
 * Dry proof for D-103a on Codex: does the installed Codex CLI dispatch a `PreToolUse` hook?
 *
 * Zero model, zero spend: the "model" is a local fake Responses endpoint that asks for one `exec_command`, and a
 * throw-away `CODEX_HOME` carries the hook. The hook is first DISCOVERED and TRUSTED through the app-server
 * (`hooks/list` → `[hooks.state."<key>"] trusted_hash`), then `codex exec` runs the turn. What is measured:
 *   - discovered: the app-server lists the hook with its key;
 *   - trusted:    after the state is written, `trustStatus` is `trusted`;
 *   - dispatched: the hook process ran (its log exists);
 *   - blocked:    the command did not run when the hook answered `deny`.
 *
 * Result on codex-cli 0.167.1 (11/11/2026): discovered and trusted, NEVER dispatched — neither `PreToolUse` nor
 * `SessionStart`/`UserPromptSubmit`, in `codex exec` and in the app-server turn. Codex therefore stays fail-closed
 * (`connectorVerdict`: reads only) until a version dispatches. Re-run after a Codex upgrade; the JSON says it all.
 *
 * Usage: node scripts/persona/codex-hooks-dry.mjs [--json <path>]
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CODEX = process.env.CODEX_BIN ?? 'codex'

/** Windows resolves `codex` to a `.cmd` shim, which Node can only start through a shell: quote every argument. */
const quoted = value => /[\s"]/u.test(value) ? `"${value.replace(/"/gu, '\\"')}"` : value
const codexCommand = args => `${quoted(CODEX)} ${args.map(quoted).join(' ')}`
const jsonAt = process.argv.indexOf('--json')
const outPath = jsonAt >= 0 ? process.argv[jsonAt + 1] : join('.maestri', 'tmp', 'codex-hooks-dry.json')

const home = mkdtempSync(join(tmpdir(), 'persona-codex-hooks-'))
const work = mkdtempSync(join(tmpdir(), 'persona-codex-hooks-work-'))
const hookLog = join(home, 'hook.log')
const marker = join(work, 'marker.txt')
const hookPath = join(home, 'hook.mjs')
const configPath = join(home, 'config.toml')

writeFileSync(hookPath, `
import { appendFileSync } from 'node:fs'
const chunks = []
process.stdin.on('data', chunk => chunks.push(chunk))
process.stdin.on('end', () => {
  appendFileSync(${JSON.stringify(hookLog)}, Buffer.concat(chunks).toString('utf8') + '\\n---\\n')
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'dry: blocked' } }))
})
`)

/** The fake "model": one `exec_command`, then a final message once the tool output comes back. */
function fakeProvider() {
  const server = createServer((req, res) => {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => {
      let body = {}
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { /* the turn still gets an answer */ }
      const input = Array.isArray(body.input) ? body.input : []
      const last = input.at(-1)
      const sawResult = last?.type === 'function_call_output'
      const send = event => res.write(`data: ${JSON.stringify(event)}\n\n`)
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      let output
      if (!sawResult) {
        const item = { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'exec_command', arguments: JSON.stringify({ cmd: `cmd /c echo hi > "${marker}"` }), status: 'completed' }
        send({ type: 'response.output_item.added', output_index: 0, item: { ...item, arguments: '', status: 'in_progress' } })
        send({ type: 'response.output_item.done', output_index: 0, item })
        output = [item]
      } else {
        const message = { type: 'message', id: 'msg_1', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'dry done', annotations: [] }] }
        send({ type: 'response.output_item.done', output_index: 0, item: message })
        output = [message]
      }
      send({ type: 'response.completed', response: { id: 'resp_1', object: 'response', status: 'completed', output, usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } })
      res.end()
    })
  })
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => { resolve({ server, port: server.address().port }) })
  })
}

/** The app-server answers `hooks/list` with the hook's key and hash; the trust state is written from it. */
function listHooks() {
  return new Promise(resolve => {
    const child = spawn(codexCommand(['app-server']), { env: { ...process.env, CODEX_HOME: home }, stdio: ['pipe', 'pipe', 'ignore'], shell: true })
    let buffer = ''
    const send = message => child.stdin.write(`${JSON.stringify(message)}\n`)
    const done = result => { child.kill(); resolve(result) }
    child.stdout.on('data', chunk => {
      buffer += chunk
      let at
      while ((at = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, at)
        buffer = buffer.slice(at + 1)
        if (line.trim() === '') continue
        let message
        try { message = JSON.parse(line) } catch { continue }
        if (message.id === 2) done(message.result?.data?.[0]?.hooks?.[0] ?? null)
      }
    })
    child.on('error', () => { done(null) })
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { clientInfo: { name: 'persona-dry', version: '1' }, capabilities: { experimentalApi: true } } })
    send({ jsonrpc: '2.0', method: 'initialized', params: {} })
    setTimeout(() => { send({ jsonrpc: '2.0', id: 2, method: 'hooks/list', params: { cwds: [work] } }) }, 1200)
    setTimeout(() => { done(null) }, 15_000)
  })
}

function runExec() {
  return new Promise(resolve => {
    const child = spawn(codexCommand(['exec', '--json', '--skip-git-repo-check', '-C', work, 'run the command']), {
      env: { ...process.env, CODEX_HOME: home, DRY_API_KEY: 'sk-dry' },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    })
    let out = ''
    let err = ''
    child.stdout.on('data', chunk => { out += chunk })
    child.stderr.on('data', chunk => { err += chunk })
    child.on('close', code => { resolve({ code, out, err }) })
  })
}

const { server, port } = await fakeProvider()
writeFileSync(configPath, [
  'model = "dry-model"',
  'approval_policy = "never"',
  'sandbox_mode = "danger-full-access"',
  'model_provider = "dry"',
  '[model_providers.dry]',
  'name = "dry fake"',
  `base_url = "http://127.0.0.1:${String(port)}/v1"`,
  'env_key = "DRY_API_KEY"',
  'wire_api = "responses"',
  'requires_openai_auth = false',
  'request_max_retries = 0',
  'stream_max_retries = 0',
  '',
  `[projects.${JSON.stringify(work)}]`,
  'trust_level = "trusted"',
  '',
  '[[hooks.PreToolUse]]',
  'matcher = ".*"',
  '[[hooks.PreToolUse.hooks]]',
  'type = "command"',
  `command = ${JSON.stringify(`"${process.execPath}" "${hookPath}"`)}`,
  '',
  '[[hooks.SessionStart]]',
  '[[hooks.SessionStart.hooks]]',
  'type = "command"',
  `command = ${JSON.stringify(`"${process.execPath}" "${hookPath}"`)}`,
  '',
].join('\n'))

const discovered = await listHooks()
if (discovered !== null) {
  writeFileSync(configPath, `${readFileSync(configPath, 'utf8')}\n[hooks.state.${JSON.stringify(discovered.key)}]\ntrusted_hash = ${JSON.stringify(discovered.currentHash)}\n`)
}
const trusted = discovered === null ? null : await listHooks()
const turn = await runExec()
server.close()

const result = {
  note: 'fake local Responses endpoint; no real model call',
  codex: turn.out.match(/"thread\.started"/u) === null ? 'unknown' : 'ran',
  discovered: discovered === null ? null : { key: discovered.key, event: discovered.eventName, trustStatus: discovered.trustStatus },
  trusted: trusted === null ? null : { trustStatus: trusted.trustStatus, enabled: trusted.enabled },
  dispatched: existsSync(hookLog),
  blocked: !existsSync(marker),
  exit: turn.code,
  stderr: turn.err.slice(0, 400),
}
writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`)
console.log(JSON.stringify(result, null, 2))
process.exit(0)
