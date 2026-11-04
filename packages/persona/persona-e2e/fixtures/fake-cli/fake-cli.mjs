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
 * - FAKE_CLI_REPLY / FAKE_CLI_RESPONSE: Custom response text for the turn.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
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
function applyConfiguredWrites() {
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
  if (tool === 'codex') {
    console.log('Logged in using ChatGPT (fake-persona-e2e)')
    process.exit(0)
  }
  console.log(JSON.stringify({
    loggedIn: true,
    authMethod: 'oauth',
    email: 'probe@persona.local',
    subscriptionType: 'pro',
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
function ruleReply(promptText) {
  const rules = process.env.FAKE_CLI_RULES
  if (!rules || promptText === undefined) return undefined
  try {
    const list = JSON.parse(rules)
    if (!Array.isArray(list)) return undefined
    for (const rule of list) {
      if (rule && typeof rule.match === 'string' && typeof rule.reply === 'string' && new RegExp(rule.match, 'iu').test(promptText)) return rule.reply
    }
  } catch {
    // A malformed rule list falls through to the sequence / single reply.
  }
  return undefined
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
  const fail = process.env.FAKE_CLI_FAIL
  if (!fail || fail === '0' || fail === 'false') return null
  return fail
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

  rl.on('line', async (line) => {
    const trimmed = line.trim()
    if (!trimmed) return
    let msg
    try {
      msg = JSON.parse(trimmed)
    } catch {
      return
    }

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
      logInvocation('turn')
      applyConfiguredWrites()
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
