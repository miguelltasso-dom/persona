#!/usr/bin/env node
/**
 * Fake CLI stub for Persona E2E.
 * Supports:
 * - Version checks (--version, -V, -v)
 * - Auth/login probes (claude auth status --json, codex login status)
 * - Stream-json session/turns with configurable latency and failure (Claude runner format)
 * - JSON-RPC app-server sessions (Codex runner format)
 *
 * Configurable via environment variables:
 * - FAKE_CLI_TURN_MS / FAKE_CLI_LATENCY_MS: Turn latency delay in ms (default 0).
 * - FAKE_CLI_FAIL: Simulate failure ('1', 'true', error message, 'crash', 'rate_limit').
 * - FAKE_CLI_FAIL_FILE: ABSOLUTE path of a file; WHILE it exists every turn fails (its text, when not empty, is the error message). The host's environment is fixed when it
 *   starts, so this is the only way for a test to say "the first turn fails, the next one works" (create the file, ask, delete the file, retry).
 * - FAKE_CLI_NEEDLES: JSON array of strings; every logged `turn` says, per needle, whether the prompt the CLI received contains it (`needles`) and how long the prompt was
 *   (`promptChars`) — proof that the WHOLE request text reached the worker, never the prompt itself.
 * - FAKE_CLI_REPLY / FAKE_CLI_RESPONSE: Custom response text for the turn.
 */

import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, normalize, resolve } from 'node:path'
import readline from 'node:readline'

const args = process.argv.slice(2)
let tool = process.env.FAKE_CLI_TOOL || 'claude'
let rawArgs = args

if (rawArgs.length > 0 && !rawArgs[0].startsWith('-') && ['claude', 'codex', 'opencode', 'cursor', 'cursor-agent'].includes(rawArgs[0])) {
  tool = rawArgs[0]
  rawArgs = rawArgs.slice(1)
}

const joined = rawArgs.join(' ')

/** `FAKE_CLI_LOG`: append one JSON line per invocation / turn so a test can prove the app really called the stub. */
function logInvocation(event, extra = {}) {
  const target = process.env.FAKE_CLI_LOG
  if (!target) return
  try {
    appendFileSync(target, `${JSON.stringify({ at: Date.now(), event, tool, argv: rawArgs, pid: process.pid, ppid: process.ppid, ...extra })}\n`)
  } catch {
    // Logging must never change the stub's behavior.
  }
}
logInvocation('invoke')

/**
 * `FAKE_CLI_WRITE_FILE` (a RELATIVE path, no `..`): during a user turn, write that text file in the stub's working directory — the
 * task's draft ("rascunho") when the runner runs in it — so "Revisar mudanças" has a REAL revision to show without a model call.
 * `FAKE_CLI_WRITE_CONTENT` sets the text. `FAKE_CLI_CONFLICT_DIR` (absolute) ALSO writes the same relative file there with
 * `FAKE_CLI_CONFLICT_CONTENT`, as if the person edited it at the same time: a real conflict. Every write is logged (event `write`).
 */
/**
 * What the working directory holds when a turn STARTS (before the stub writes anything): relative path (`/`), size and the SHA-256 of the file (files above 4 MB: no hash). This is the
 * stub's own look at "what the persona would find" — the end state of a draft cannot tell a file the host put there from one the persona recreated. Bounded: depth 6, 200 files.
 */
function listCwd() {
  const out = []
  const root = process.cwd()
  const visit = (dir, prefix, depth) => {
    if (depth > 6 || out.length >= 200) return
    let entries
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue
      const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`
      const full = join(dir, entry.name)
      if (entry.isDirectory()) visit(full, relative, depth + 1)
      else if (entry.isFile()) {
        try {
          const size = statSync(full).size
          out.push({ p: relative, s: size, h: size <= 4 * 1024 * 1024 ? createHash('sha256').update(readFileSync(full)).digest('hex') : null })
        } catch { /* gone while reading */ }
      }
    }
  }
  visit(root, '', 0)
  return out
}

/**
 * The files a prompt PROMISES the worker — "Anexos do pedido: <files>." and the bilhete's "Arquivos:" list — and whether each one exists in the working directory right now. A path in the
 * free text of a bilhete ("salvar como x.png") may be a file still to be created, so only those two places count (same reading as `promisedFiles` in `src/team-draft-checks.ts`).
 */
function promisedPaths(promptText) {
  const found = new Set()
  const token = /(?<![\p{L}\p{N}_:/.\\-])(?:[\p{L}\p{N}_.-]+[\\/])*[\p{L}\p{N}_.-]+\.(?:png|svg|jpe?g|webp|gif|pdf|txt|md|json|csv)(?![\p{L}\p{N}_/\\-])/giu
  const take = (text) => {
    for (const match of String(text).matchAll(token)) {
      const path = match[0].trim().replace(/\\/gu, '/').replace(/^\.\//u, '')
      if (path !== '' && !/^[a-z]:/iu.test(path) && !path.startsWith('/') && !path.includes('..')) found.add(path)
    }
  }
  for (const match of promptText.matchAll(/Anexos do pedido:[ \t]*([^\n]*)/gu)) take(match[1] ?? '')
  for (const match of promptText.matchAll(/^Arquivos:[ \t]*\n((?:[ \t]*[-•][^\n]*\n?)*)/gmu)) take(match[1] ?? '')
  for (const match of promptText.matchAll(/^Arquivos que chegaram no seu rascunho[^\n]*\n((?:[ \t]*[-•][^\n]*\n?)*)/gmu)) take(match[1] ?? '')
  return [...found].slice(0, 40).map((path) => ({ p: path, present: existsSync(join(process.cwd(), path)) }))
}

let turnCounter = 0

/**
 * `FAKE_CLI_WRITE_RULES` (a JSON array of `{ match, file, content, fillIn? }`): content-based writes, so only the turn that IS the art part writes the art (`FAKE_CLI_WRITE_FILE` writes it in
 * every turn, which hides a colleague that does not find the file). `fillIn: true` plays the model that does not find the file a prompt tells it about and MAKES ONE (what Lia did in the real
 * round of 07/11): it writes only if the file is missing from the working directory, and the log says `recreated: true` — the proof that the file was not shared.
 */
function applyWriteRules(promptText) {
  const raw = process.env.FAKE_CLI_WRITE_RULES
  if (!raw || promptText === undefined) return
  let rules
  try { rules = JSON.parse(raw) } catch { return }
  if (!Array.isArray(rules)) return
  for (const rule of rules) {
    if (!rule || typeof rule.match !== 'string' || typeof rule.file !== 'string') continue
    if (!new RegExp(rule.match, 'iu').test(promptText)) continue
    const clean = normalize(rule.file)
    if (isAbsolute(clean) || clean.startsWith('..') || clean.split(/[\\/]/u).includes('..')) { logInvocation('write-refused', { file: rule.file, reason: 'path must be relative' }); continue }
    const target = join(process.cwd(), clean)
    if (rule.fillIn === true && existsSync(target)) continue
    try {
      mkdirSync(dirname(target), { recursive: true })
      const content = typeof rule.content === 'string' ? rule.content : `escrito pelo fake-cli em ${new Date().toISOString()}\n`
      writeFileSync(target, content)
      logInvocation('write', { proc: process.pid, seq: turnCounter, file: clean.replace(/\\/gu, '/'), cwd: process.cwd(), sha: createHash('sha256').update(content).digest('hex'), ...(rule.fillIn === true ? { recreated: true } : {}) })
    } catch (error) {
      logInvocation('write-refused', { file: rule.file, reason: error instanceof Error ? error.message.slice(0, 120) : String(error) })
    }
  }
}

function applyConfiguredWrites(promptText) {
  applyWriteRules(promptText)
  const relative = process.env.FAKE_CLI_WRITE_FILE
  if (!relative) return
  const clean = normalize(relative)
  if (isAbsolute(clean) || clean.startsWith('..') || clean.split(/[\\/]/u).includes('..')) {
    logInvocation('write-refused', { file: relative, reason: 'path must be relative and stay inside the working directory' })
    return
  }
  const stamp = new Date().toISOString()
  try {
    const target = join(process.cwd(), clean)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, process.env.FAKE_CLI_WRITE_CONTENT ?? `Cardápio atualizado pelo fake-cli em ${stamp}\n`)
    logInvocation('write', { file: clean, cwd: process.cwd() })
    const conflictDir = process.env.FAKE_CLI_CONFLICT_DIR
    if (conflictDir && isAbsolute(conflictDir)) {
      const other = join(resolve(conflictDir), clean)
      mkdirSync(dirname(other), { recursive: true })
      writeFileSync(other, process.env.FAKE_CLI_CONFLICT_CONTENT ?? `Edição da pessoa ao mesmo tempo em ${stamp}\n`)
      logInvocation('write', { file: clean, cwd: resolve(conflictDir), conflict: true })
    }
  } catch (error) {
    logInvocation('write-refused', { file: relative, reason: error instanceof Error ? error.message.slice(0, 120) : String(error) })
  }
}

const versions = {
  claude: '2.1.317 (fake-persona-e2e)',
  codex: '0.166.0-fake-persona-e2e',
  opencode: '1.19.3-fake-persona-e2e',
  cursor: '2026.10.22-fake-persona-e2e',
  'cursor-agent': '2026.10.22-fake-persona-e2e',
}

// 1. Version probe
if (rawArgs.includes('--version') || rawArgs.includes('-V') || rawArgs.includes('-v')) {
  console.log(versions[tool] ?? `${tool}-fake-persona-e2e`)
  process.exit(0)
}

// 1b. Readiness probes (`codex app-server --help`, `claude --help`): print usage and exit instead of waiting on stdin.
if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
  console.log(`${tool} (fake-persona-e2e) - usage: ${tool} [options]`)
  process.exit(0)
}

// 2. Auth / login probe
if (/auth|login/i.test(joined)) {
  // `FAKE_CLI_AUTH_HANG_FILE` / `FAKE_CLI_AUTH_OUT_FILE` (ABSOLUTE paths): WHILE the file exists, the tools it names (its text: `claude`, `claude,codex`) never answer the login probe (it
  // outlasts any probe timeout: the CLI that is slow to start) / answer "not logged in" (a CONFIRMED logout). The host's environment is fixed when it starts, so a test changes the
  // answer by creating or deleting the file (COLHEITA item 13: a timeout is "não consegui conferir", never "sem login").
  const switched = (variable) => {
    const file = process.env[variable]
    try { return file && existsSync(file) ? readFileSync(file, 'utf8').split(/[\s,]+/u).filter(Boolean) : [] } catch { return [] }
  }
  if (switched('FAKE_CLI_AUTH_HANG_FILE').includes(tool)) await new Promise(resolve => setTimeout(resolve, 25_000)) // far past the probe's 8 s, short enough not to leave a stray process behind
  if (switched('FAKE_CLI_AUTH_OUT_FILE').includes(tool)) {
    if (tool === 'codex') console.log('Not logged in')
    else console.log(JSON.stringify({ loggedIn: false, authMethod: 'none', status: 'unauthenticated', tool, source: 'persona-e2e-fake-cli' }))
    process.exit(1)
  }
  if (tool === 'codex') {
    console.log('Logged in using ChatGPT (fake-persona-e2e)')
    process.exit(0)
  }
  // Same field set and value shapes as the REAL `claude auth status --json` (compared 04/11 on Claude Code 2.x): a guard in the packaged
  // product that reads account / organization / expiry fields must see what a real login shows. Values are fake; `status`, `tool` and
  // `source` are kept (extras the real CLI does not print) so the stub stays identifiable in logs.
  console.log(JSON.stringify({
    loggedIn: true,
    authMethod: 'claude.ai',
    apiProvider: 'firstParty',
    analyticsDisabled: false,
    projectsDirectory: process.env.FAKE_CLI_CONFIG_DIR === undefined ? 'C:\\persona-e2e-fake\\.claude\\projects' : `${process.env.FAKE_CLI_CONFIG_DIR}\\projects`,
    configDirectory: process.env.FAKE_CLI_CONFIG_DIR ?? 'C:\\persona-e2e-fake\\.claude',
    loginExpiresAt: '2030-01-01T00:00:00.000Z',
    email: 'probe@persona.local',
    orgId: '00000000-0000-4000-8000-000000000001',
    orgName: "Probe's Organization",
    subscriptionType: 'max',
    status: 'authenticated',
    tool,
    source: 'persona-e2e-fake-cli',
  }))
  process.exit(0)
}

const DEFAULT_REPLY = [
  'Aqui está a primeira entrega para a equipe:',
  '1. Agência Ponto — estúdio de sites.',
  '2. Estúdio de sites para PMEs.',
  '3. Cliente: Padaria Lua.',
  '4. Objetivo: divulgar o cardápio.',
  '5. Prazo não informado.',
  'Tarefa proposta: preparar texto do cardápio; dona: Coordenação; pronto quando revisado.',
].join('\n')

/**
 * Which model turn this is (1-based), counted from the shared invocation log (`FAKE_CLI_LOG`): every stub process of a run appends to it,
 * so the count survives a new process per turn. Without a log it is always 1.
 */
function turnNumber() {
  const target = process.env.FAKE_CLI_LOG
  if (!target || !existsSync(target)) return 1
  let turns = 0
  for (const line of readFileSync(target, 'utf8').split('\n')) {
    if (line.includes('"event":"turn"')) turns += 1
  }
  return Math.max(1, turns)
}

/**
 * `FAKE_CLI_REPLIES` (a JSON array of strings): the reply of turn N is element N (the last one repeats). Lets one run script a whole
 * conversation — e.g. turn 2 a worker report `{"state":"waiting","summary":"…","question":"…"}`, turn 3 the final report.
 * Falls back to `FAKE_CLI_REPLY` / the default.
 */
/**
 * `FAKE_CLI_RULES` (a JSON array of `{ "match": "<regex>", "reply": "<text>" }`): the FIRST rule whose regex matches the text of the
 * user turn decides the reply. Content-based, so a run can script "the work request makes the persona ask a question, the answer finishes
 * it" no matter how many other model turns (conversation replies, triage) happen in between. Put the most specific rule first.
 */
function matchingRule(promptText) {
  const rules = process.env.FAKE_CLI_RULES
  if (!rules || promptText === undefined) return undefined
  try {
    const list = JSON.parse(rules)
    if (!Array.isArray(list)) return undefined
    for (const rule of list) {
      if (rule && typeof rule.match === 'string' && typeof rule.reply === 'string' && new RegExp(rule.match, 'iu').test(promptText)) return rule
    }
  } catch {
    // A malformed rule list falls through to the sequence / single reply.
  }
  return undefined
}

function ruleReply(promptText) {
  return matchingRule(promptText)?.reply
}

/**
 * `narration` of a matching rule (an array of strings): what a real model says BETWEEN its tool calls ("Vou começar conferindo se o foto.png existe…"). The stub emits each one the way the
 * real CLI does — an `assistant` message with a text block and a tool call, then the tool's result — and only THEN the final answer (`reply`), so a product that puts the whole text of the
 * turn in the thread shows the monologue, and one that keeps the text after the last tool shows the answer alone (P0-2 of the real round of 07/11).
 */
function ruleNarration(promptText) {
  const narration = matchingRule(promptText)?.narration
  return Array.isArray(narration) ? narration.filter(item => typeof item === 'string') : []
}

// ── MCP: the stub as a SCRIPTED model that calls the product's own tools (`pass_forward`, `ask_colleague`, …) through the server the CLI was given (`--mcp-config`) ─────────────────────
function mcpEntry() {
  const at = rawArgs.indexOf('--mcp-config')
  if (at < 0 || rawArgs[at + 1] === undefined) return undefined
  try {
    const arg = rawArgs[at + 1]
    const config = JSON.parse(existsSync(arg) ? readFileSync(arg, 'utf8') : arg)
    const servers = config?.mcpServers ?? {}
    const entry = servers.persona ?? Object.values(servers)[0]
    return entry && typeof entry.url === 'string' ? entry : undefined
  } catch { return undefined }
}

async function mcpRpc(entry, session, id, method, params) {
  const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(entry.headers ?? {}), ...(session === undefined ? {} : { 'mcp-session-id': session }) }
  const body = id === undefined ? { jsonrpc: '2.0', method, params } : { jsonrpc: '2.0', id, method, params }
  const response = await fetch(entry.url, { method: 'POST', headers, body: JSON.stringify(body) })
  const sid = response.headers.get('mcp-session-id') ?? session
  const text = await response.text()
  if (id === undefined || text.trim() === '') return { sid, json: undefined }
  const event = (response.headers.get('content-type') ?? '').includes('text/event-stream') ? text.split('\n').find(row => row.startsWith('data:'))?.slice(5) : text
  try { return { sid, json: event === undefined ? undefined : JSON.parse(event) } } catch { return { sid, json: undefined } }
}

async function mcpSession(entry) {
  const opened = await mcpRpc(entry, undefined, 1, 'initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'fake-cli', version: '0' } })
  await mcpRpc(entry, opened.sid, undefined, 'notifications/initialized', {})
  return opened.sid
}

async function mcpCall(toolName, toolArgs) {
  const entry = mcpEntry()
  if (entry === undefined) return { ok: false, text: 'no mcp server in --mcp-config' }
  try {
    const sid = await mcpSession(entry)
    const { json } = await mcpRpc(entry, sid, 2, 'tools/call', { name: toolName, arguments: toolArgs })
    const text = (json?.result?.content ?? []).map(part => part?.text ?? '').join(' ') || JSON.stringify(json?.error ?? '')
    return { ok: json?.result !== undefined && json.result.isError !== true && json.error === undefined, text: text.slice(0, 400) }
  } catch (error) {
    return { ok: false, text: error instanceof Error ? error.message.slice(0, 200) : String(error) }
  }
}

/** `FAKE_CLI_TOOLS_PROBE=1`: list the tools the CLI was offered, once per process, and log their names and descriptions (the persona-facing text the product wrote). */
let toolsProbed = false
async function probeTools() {
  if (process.env.FAKE_CLI_TOOLS_PROBE !== '1' || toolsProbed) return
  const entry = mcpEntry()
  if (entry === undefined) return
  toolsProbed = true
  try {
    const sid = await mcpSession(entry)
    const { json } = await mcpRpc(entry, sid, 3, 'tools/list', {})
    const tools = (json?.result?.tools ?? []).map(item => ({ name: String(item.name), description: String(item.description ?? '').slice(0, 2000) }))
    logInvocation('tools', { proc: process.pid, seq: turnCounter, tools })
  } catch (error) {
    logInvocation('tools', { proc: process.pid, seq: turnCounter, error: error instanceof Error ? error.message.slice(0, 160) : String(error) })
  }
}

/**
 * `FAKE_CLI_TOOL_CALLS` (a JSON array of `{ match, once?, calls: [{ tool, args }] }`): when the prompt of a turn matches, call these tools of the product, in order, as the model would
 * (after the turn's writes). `once` makes a rule run in the first matching turn only. Every call is logged (`toolcall`: ok + the first words of the answer).
 */
async function runToolCalls(rawPrompt) {
  const raw = process.env.FAKE_CLI_TOOL_CALLS
  if (!raw || rawPrompt === undefined) return
  let rules
  try { rules = JSON.parse(raw) } catch { return }
  if (!Array.isArray(rules)) return
  const logText = process.env.FAKE_CLI_LOG && existsSync(process.env.FAKE_CLI_LOG) ? readFileSync(process.env.FAKE_CLI_LOG, 'utf8') : ''
  for (const [index, rule] of rules.entries()) {
    if (!rule || typeof rule.match !== 'string' || !Array.isArray(rule.calls) || !new RegExp(rule.match, 'iu').test(rawPrompt)) continue
    if (rule.once === true && logText.includes(`"event":"toolcall"`) && logText.includes(`"rule":${String(index)},`)) continue
    for (const call of rule.calls) {
      const result = await mcpCall(String(call.tool), call.args ?? {})
      logInvocation('toolcall', { rule: index, proc: process.pid, seq: turnCounter, cwd: process.cwd(), toolName: String(call.tool), ok: result.ok, text: result.text })
    }
  }
}

/** The text of a user turn (every text block joined with real line breaks), for rules that need `^`/`$` per line. */
function rawPromptOf(content) {
  const blocks = Array.isArray(content) ? content : [content]
  return blocks.map(block => (typeof block === 'string' ? block : (block && typeof block.text === 'string' ? block.text : ''))).join('\n')
}

function getReplyText(promptText) {
  const byRule = ruleReply(promptText)
  if (byRule !== undefined) return byRule
  const sequence = process.env.FAKE_CLI_REPLIES
  if (sequence) {
    try {
      const replies = JSON.parse(sequence)
      if (Array.isArray(replies) && replies.length > 0 && replies.every(item => typeof item === 'string')) {
        return replies[Math.min(turnNumber(), replies.length) - 1]
      }
    } catch {
      // A malformed sequence falls through to the single reply.
    }
  }
  return process.env.FAKE_CLI_REPLY ?? process.env.FAKE_CLI_RESPONSE ?? DEFAULT_REPLY
}

function getLatencyMs() {
  const env = process.env.FAKE_CLI_TURN_MS ?? process.env.FAKE_CLI_LATENCY_MS ?? process.env.FAKE_CLI_DELAY_MS
  if (env === undefined) return 0
  const n = Number(env)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

function getFailure() {
  const failFile = process.env.FAKE_CLI_FAIL_FILE
  if (failFile && existsSync(failFile)) {
    try {
      const text = readFileSync(failFile, 'utf8').trim()
      return text === '' ? '1' : text
    } catch {
      return '1'
    }
  }
  const fail = process.env.FAKE_CLI_FAIL
  if (!fail || fail === '0' || fail === 'false') return null
  return fail
}

/**
 * `FAKE_CLI_NEEDLES`: which of the configured strings the prompt of THIS turn contains, and the prompt length — never the prompt itself (the log stays small and private).
 * The text is every `text` block of the user message joined, so JSON escaping of quotes and line breaks cannot hide a needle.
 */
function promptReport(content) {
  const blocks = Array.isArray(content) ? content : [content]
  const text = blocks.map(block => (typeof block === 'string' ? block : (block && typeof block.text === 'string' ? block.text : ''))).join('\n')
  const report = { promptChars: text.length }
  const raw = process.env.FAKE_CLI_NEEDLES
  if (!raw) return report
  try {
    const needles = JSON.parse(raw)
    if (!Array.isArray(needles)) return report
    const found = {}
    for (const needle of needles) if (typeof needle === 'string' && needle !== '') found[needle] = text.includes(needle)
    return { ...report, needles: found }
  } catch {
    return report
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** `FAKE_CLI_INPUT_TOKENS`: fixed input-token floor reported per turn (default 120). */
function baseInputTokens() {
  const n = Number(process.env.FAKE_CLI_INPUT_TOKENS)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 120
}

// Session identity + running totals (one process = one session, like the real stream-json CLI).
const modelFlag = rawArgs.indexOf('--model')
const modelName = process.env.FAKE_CLI_MODEL ?? (modelFlag >= 0 && rawArgs[modelFlag + 1] ? rawArgs[modelFlag + 1] : 'claude-haiku-fake-persona-e2e')
const sessionId = `fake-session-${process.pid}`
const totals = { input: 0, output: 0, turns: 0 }

// 3. Codex app-server mode (JSON-RPC)
if (tool === 'codex' && rawArgs.includes('app-server')) {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
  rl.on('line', async (line) => {
    const trimmed = line.trim()
    if (!trimmed) return
    let msg
    try {
      msg = JSON.parse(trimmed)
    } catch {
      return
    }
    const { id, method, params } = msg
    if (method === 'initialize') {
      console.log(JSON.stringify({ id, result: { serverInfo: { name: 'codex-fake', version: '0.166.0' } } }))
      return
    }
    if (method === 'account/read') {
      console.log(JSON.stringify({ id, result: { account: { type: 'chatgpt', email: 'probe@persona.local', planType: 'pro' } } }))
      return
    }
    if (method === 'thread/start') {
      console.log(JSON.stringify({ id, result: { thread: { id: 'thread-fake-1' } } }))
      return
    }
    if (method === 'thread/read') {
      console.log(JSON.stringify({ id, result: { thread: { id: params?.threadId ?? 'thread-fake-1' } } }))
      return
    }
    if (method === 'turn/start') {
      logInvocation('turn')
      applyConfiguredWrites()
      console.log(JSON.stringify({ id, result: { turn: { id: 'turn-fake-1' } } }))
      const latency = getLatencyMs()
      if (latency > 0) await sleep(latency)
      const fail = getFailure()
      if (fail) {
        if (fail === 'crash') process.exit(1)
        console.log(JSON.stringify({
          method: 'turn/failed',
          params: {
            threadId: params?.threadId ?? 'thread-fake-1',
            turnId: 'turn-fake-1',
            error: { message: typeof fail === 'string' && fail !== '1' && fail !== 'true' ? fail : 'Simulated fake CLI failure' },
          },
        }))
        return
      }
      console.log(JSON.stringify({
        method: 'item/agentMessage/delta',
        params: {
          threadId: params?.threadId ?? 'thread-fake-1',
          turnId: 'turn-fake-1',
          itemId: 'msg-fake-1',
          delta: getReplyText(),
        },
      }))
      console.log(JSON.stringify({
        method: 'turn/completed',
        params: {
          threadId: params?.threadId ?? 'thread-fake-1',
          turnId: 'turn-fake-1',
          status: 'completed',
        },
      }))
      return
    }
    if (id !== undefined) {
      console.log(JSON.stringify({ id, result: {} }))
    }
  })
} else {
  // 4. Claude / stream-json mode
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
  // Diagnostics (04/11, installed exe): say what the host sent and why this session ended, so "0 turns" can be told apart from
  // "the host never wrote to stdin" and "stdin closed at once". New event names only; `turn` keeps its meaning.
  rl.on('close', () => { logInvocation('stdin-end') })
  process.on('exit', (code) => { logInvocation('exit', { code }) })

  rl.on('line', async (line) => {
    const trimmed = line.trim()
    if (!trimmed) return
    let msg
    try {
      msg = JSON.parse(trimmed)
    } catch {
      logInvocation('stdin-unparsed', { head: trimmed.slice(0, 80) })
      return
    }
    logInvocation('stdin', { type: String(msg.type), subtype: String(msg.request?.subtype ?? '') })

    if (msg.type === 'control_request') {
      const reqId = msg.request_id
      const subtype = msg.request?.subtype
      if (subtype === 'list_models') {
        const models = [
          { value: 'claude-3-5-haiku-20241022', displayName: 'Claude 3.5 Haiku', resolvedModel: 'claude-3-5-haiku-20241022' },
          { value: 'haiku', displayName: 'Haiku', resolvedModel: 'claude-3-5-haiku-20241022' },
          { value: 'claude-3-5-sonnet-20241022', displayName: 'Claude 3.5 Sonnet', resolvedModel: 'claude-3-5-sonnet-20241022' },
          { value: 'sonnet', displayName: 'Sonnet', resolvedModel: 'claude-3-5-sonnet-20241022' },
        ]
        console.log(JSON.stringify({
          type: 'control_response',
          response: {
            request_id: reqId,
            subtype: 'success',
            response: { models },
          },
        }))
        return
      }

      if (subtype === 'get_usage') {
        console.log(JSON.stringify({
          type: 'control_response',
          response: {
            request_id: reqId,
            subtype: 'success',
            response: {
              rate_limits_available: true,
              rate_limits: {
                five_hour: { utilization: 5, resets_at: new Date(Date.now() + 5 * 3600_000).toISOString() },
                seven_day: { utilization: 10, resets_at: new Date(Date.now() + 7 * 86400_000).toISOString() },
              },
            },
          },
        }))
        return
      }

      console.log(JSON.stringify({
        type: 'control_response',
        response: {
          request_id: reqId,
          subtype: 'success',
          response: {},
        },
      }))
      return
    }

    if (msg.type === 'user') {
      // TEAM-10 plumbing: say whether an IMAGE reached the CLI (content blocks of type "image", with their media types) — never the bytes.
      const blocks = Array.isArray(msg.message?.content) ? msg.message.content : []
      const images = blocks.filter(block => block?.type === 'image')
      const mentionsFile = /[A-Za-z0-9_\\/:.-]+\.(?:png|jpe?g|webp)\b/iu.exec(JSON.stringify(msg.message?.content ?? ''))
      turnCounter += 1
      const rawPrompt = rawPromptOf(msg.message?.content)
      logInvocation('turn', {
        // P0-1 (Tally 07/11): where the CLI ran — a persona with a project folder works in the Task's DRAFT directory, a text-only persona has none.
        cwd: process.cwd(),
        // P0-1 (Atlas 07/11, shared files): what the working directory held when the turn STARTED, and which of the files the prompt promises were there.
        proc: process.pid, seq: turnCounter, cwdFiles: listCwd(), promptPaths: promisedPaths(rawPrompt),
        ...promptReport(msg.message?.content),
        ...(images.length === 0 ? (mentionsFile === null ? {} : { imagePathInText: mentionsFile[0].slice(-80) }) : {
          images: images.length,
          imageTypes: images.map(block => String(block.source?.media_type ?? block.source?.mediaType ?? block.media_type ?? '')),
          imageSources: images.map(block => String(block.source?.type ?? '')),
        }),
      })
      applyConfiguredWrites(rawPrompt)
      await probeTools()
      await runToolCalls(rawPrompt)
      const promptText = JSON.stringify(msg.message?.content ?? '')
      const latency = getLatencyMs()
      if (latency > 0) await sleep(latency)

      const fail = getFailure()
      if (fail) {
        if (fail === 'crash') {
          process.exit(1)
        }
        if (fail === 'rate_limit' || fail === 'quota') {
          console.log(JSON.stringify({
            type: 'result',
            subtype: 'error_during_execution',
            is_error: true,
            terminal_reason: 'usage_limit_exceeded',
            errors: ['Simulated rate limit exceeded'],
          }))
          return
        }
        const errorMsg = typeof fail === 'string' && fail !== '1' && fail !== 'true' ? fail : 'Simulated fake CLI failure'
        console.log(JSON.stringify({
          type: 'result',
          subtype: 'error_during_execution',
          is_error: true,
          errors: [errorMsg],
        }))
        return
      }

      if (msg.uuid) {
        console.log(JSON.stringify({
          type: 'command_lifecycle',
          state: 'started',
          command_uuid: msg.uuid,
        }))
      }

      // What a real model says between its tool calls (see `ruleNarration`): each step is a text block + a tool call, answered by the tool's result.
      ruleNarration(promptText).forEach((narrated, index) => {
        const toolUseId = `toolu_fake_${String(turnCounter)}_${String(index)}`
        console.log(JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: narrated }, { type: 'tool_use', id: toolUseId, name: 'Glob', input: { pattern: '**/*' } }] } }))
        console.log(JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUseId, content: '(nenhum resultado)' }] } }))
      })

      console.log(JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            {
              type: 'text',
              text: getReplyText(promptText),
            },
          ],
        },
      }))

      // Real Claude stamps every success result with measured token counters (`usage` = this turn's main loop,
      // `modelUsage` = running total per model). Ledger/first-delivery evidence only counts those as `measured`.
      const replyText = getReplyText(promptText)
      const inputTokens = baseInputTokens() + Math.ceil(promptText.length / 4)
      const outputTokens = Math.max(1, Math.ceil(replyText.length / 4))
      totals.input += inputTokens
      totals.output += outputTokens
      totals.turns += 1
      console.log(JSON.stringify({
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: replyText,
        session_id: sessionId,
        num_turns: totals.turns,
        duration_ms: Math.max(1, latency),
        total_cost_usd: 0,
        usage: {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
        modelUsage: {
          [modelName]: {
            inputTokens: totals.input,
            outputTokens: totals.output,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 0,
            costUSD: 0,
          },
        },
      }))

      if (msg.uuid) {
        console.log(JSON.stringify({
          type: 'command_lifecycle',
          state: 'completed',
          command_uuid: msg.uuid,
        }))
      }
    }
  })

  rl.on('close', () => {
    process.exit(0)
  })
}

process.on('SIGTERM', () => process.exit(0))
process.on('SIGINT', () => process.exit(0))
