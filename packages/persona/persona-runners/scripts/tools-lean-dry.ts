/**
 * D-097 (Keel 05/11 05:39): the team tools are offered to EVERY Task, so what their DEFINITIONS cost per request matters. ZERO model: the CLI counts the opening context itself
 * (`get_context_usage`), exactly like `tools-overhead-dry.ts`; this script measures the CURRENT definitions the gateway announces against LEAN versions of the same tools
 * (shorter descriptions and schemas, same names, same fields, same behaviour) and writes the numbers and the proposed text.
 *
 *   node --import tsx/esm packages/persona/persona-runners/scripts/tools-lean-dry.ts [--out <file.json>] [--proposal <file.json>]
 *
 * Two lean versions, so the owner can choose how far to go:
 *  - `lean-a`: shorter tool descriptions and a short note only on the fields whose name does not say it; every constraint of the schema stays (`required`, `enum`, `minItems`,
 *    `maxItems`, `additionalProperties: false`).
 *  - `lean-b`: `lean-a` without the size constraints (`minItems`, `maxItems`) and without `additionalProperties`: the host already validates what it reads, and the description keeps
 *    the limits in words ("2-8 options", "at most 6 points").
 *  - `lean-c` (structural, the one that reaches ~1.2 mil): `lean-b` AND `ask_colleague` + `pass_forward` merged into ONE tool, `hand_off`, with `kind: "ask" | "pass"` (the two have the
 *    same fields; today the schema is paid twice). It changes a tool NAME: the owner of the host handlers decides.
 * Prints counts and token numbers only.
 */

import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openClaudeControl } from '../src/oar/claude-control.ts'
import { CLAUDE_ISOLATION_ARGS, CLAUDE_ISOLATION_ENV } from '../src/oar/isolation.ts'
import { createMcpGateway } from '../src/mcp/gateway.ts'
import { HARNESS_TOOLS } from '../src/mcp/harness-tools.ts'

interface Definition {
  readonly name: string
  readonly description: string
  readonly inputSchema: unknown
}

const SERVER = `
const rl = require('node:readline').createInterface({ input: process.stdin })
const send = (m) => process.stdout.write(JSON.stringify(m) + '\\n')
const tools = JSON.parse(require('node:fs').readFileSync(process.env.TOOLS_FILE, 'utf8'))
rl.on('line', (line) => {
  let msg; try { msg = JSON.parse(line) } catch { return }
  if (msg.method === 'initialize') send({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: (msg.params && msg.params.protocolVersion) || '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'overhead', version: '1' } } })
  else if (msg.method === 'tools/list') send({ jsonrpc: '2.0', id: msg.id, result: { tools } })
  else if (msg.method === 'tools/call') send({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: 'ok' }] } })
  else if (msg.id !== undefined && msg.method !== undefined) send({ jsonrpc: '2.0', id: msg.id, result: {} })
})`

function argOf(name: string): string | undefined {
  const at = process.argv.indexOf(name)
  return at >= 0 ? process.argv[at + 1] : undefined
}

/** The definitions the gateway announces today (the current text), with every harness port wired. */
function currentDefinitions(): Definition[] {
  const gateway = createMcpGateway({
    hooks: { report: () => undefined, recall: () => '', ask: () => ({ ok: true, content: 'ok' }) } as never,
    harness: { tools: [...HARNESS_TOOLS], call: async () => '{"ok":true}' },
    onlyWired: true,
  })
  const lease = gateway.openTurn({ run: { personaId: 'nina', ticketId: 't1', assignmentId: 'a1' }, toolLevel: 'write', worktree: 'C:/tmp/x' })
  try {
    return gateway.describe(lease.token).map(item => ({ name: item.name, description: item.description, inputSchema: item.inputSchema }))
  } finally {
    gateway.closeTurn(lease.token)
  }
}

const STR = { type: 'string' } as const
const STRS = { type: 'array', items: STR } as const

/** The lean text of the five tools a Task is offered. Same names, same fields, same meaning. */
const LEAN_DESCRIPTION: Readonly<Record<string, string>> = {
  persona_ask: 'Ask the person a question: 2-8 short options if it is a choice, up to 5 questions. If it is not worth interrupting, go on and state your assumption.',
  ask_team_opinion: 'Ask the team for a short opinion on your draft (text and/or attached images); each reply is marked liked / suggestion / attention. Rounds cost the person time and money and are limited: use only when worth it, then decide and go on.',
  ask_colleague: 'Ask a colleague for help with part of YOUR task and wait for their delivery. Limited per task and per day; not someone already in this chain; two levels at most. After it succeeds, finish what you can and end your turn saying what you wait for; do not do their part.',
  pass_forward: 'Pass the work on to a colleague with a note: your part is done, the next is theirs, and you do not wait. Same limits as asking for help. Then deliver YOUR part; never theirs.',
  review_verdict: 'Verdict on the work you review: "approve", or "changes" with at most 6 short points. Review tasks only; end with one short sentence.',
}

const HANDOFF_SCHEMA_A = {
  type: 'object', additionalProperties: false, required: ['colleague', 'title'],
  properties: {
    colleague: { type: 'string', description: 'Name or id' },
    title: { type: 'string', description: 'Short title (the person reads it)' },
    done: STRS, needed: STRS,
    files: { type: 'array', items: STR, description: 'Project-relative paths' },
    decisions: STRS,
  },
} as const

const LEAN_SCHEMA_A: Readonly<Record<string, unknown>> = {
  persona_ask: {
    type: 'object', additionalProperties: true,
    properties: {
      question: STR,
      options: { type: 'array', items: STR, minItems: 2, maxItems: 8 },
      multiple: { type: 'boolean' },
      questions: { type: 'array', maxItems: 5, items: { type: 'object', additionalProperties: false, required: ['question'], properties: { question: STR, options: { type: 'array', items: STR, minItems: 2, maxItems: 8 }, multiple: { type: 'boolean' } } } },
      assumption: STR,
    },
  },
  ask_team_opinion: {
    type: 'object', additionalProperties: false, required: ['question', 'draft'],
    properties: {
      question: STR,
      draft: { type: 'object', additionalProperties: false, description: 'Text and/or attached images (at least one)', properties: { text: STR, attachmentIds: STRS, alt: { type: 'string', description: 'Short image description' } } },
      audience: { description: "'team' (default) | 'everyone' | colleague ids", anyOf: [{ type: 'string', enum: ['team', 'everyone'] }, STRS] },
    },
  },
  ask_colleague: HANDOFF_SCHEMA_A,
  pass_forward: HANDOFF_SCHEMA_A,
  review_verdict: {
    type: 'object', additionalProperties: false, required: ['verdict'],
    properties: { verdict: { type: 'string', enum: ['approve', 'changes'] }, points: { type: 'array', items: STR, description: 'With "changes": what to adjust' } },
  },
}

/** `lean-b`: the same schema without the size constraints and without `additionalProperties` (the host validates; the description says the limits). */
function withoutConstraints(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(withoutConstraints)
  if (schema === null || typeof schema !== 'object') return schema
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'minItems' || key === 'maxItems' || key === 'additionalProperties') continue
    out[key] = withoutConstraints(value)
  }
  return out
}

/** `lean-c`: the two hand-over tools as one. */
const HAND_OFF: Definition = {
  name: 'hand_off',
  description: 'Hand work to a colleague with a note. kind "ask": help with part of YOUR task, you wait for their delivery (not someone already in this chain; two levels at most); finish what you can, end your turn saying what you wait for, and do not do their part. kind "pass": your part is done, the next is theirs, you do not wait; deliver YOUR part, never theirs. Limited per task and per day.',
  inputSchema: {
    type: 'object', required: ['kind', 'colleague', 'title'],
    properties: {
      kind: { type: 'string', enum: ['ask', 'pass'] },
      colleague: { type: 'string', description: 'Name or id' },
      title: { type: 'string', description: 'Short title (the person reads it)' },
      done: STRS, needed: STRS,
      files: { type: 'array', items: STR, description: 'Project-relative paths' },
      decisions: STRS,
    },
  },
}

function lean(definitions: readonly Definition[], version: 'lean-a' | 'lean-b'): Definition[] {
  return definitions.map((item) => {
    const description = LEAN_DESCRIPTION[item.name]
    const schema = LEAN_SCHEMA_A[item.name]
    if (description === undefined || schema === undefined) return item
    return { name: item.name, description, inputSchema: version === 'lean-a' ? schema : withoutConstraints(schema) }
  })
}

interface Reading {
  readonly connected: boolean
  readonly totalTokens: number | undefined
  readonly serverTools: number
}

async function measure(bin: string, definitions: readonly Definition[] | undefined, work: string): Promise<Reading> {
  const args = ['--permission-mode', 'dontAsk', '--tools', '', ...CLAUDE_ISOLATION_ARGS]
  if (definitions !== undefined) {
    const toolsFile = join(work, `tools-${String(definitions.length)}-${String(Math.random()).slice(2, 8)}.json`)
    writeFileSync(toolsFile, JSON.stringify(definitions))
    const serverFile = join(work, 'server.cjs')
    writeFileSync(serverFile, SERVER)
    args.push('--mcp-config', JSON.stringify({ mcpServers: { overhead: { command: process.execPath, args: [serverFile], env: { TOOLS_FILE: toolsFile } } } }))
  }
  const session = openClaudeControl(bin)({ args, env: { ...CLAUDE_ISOLATION_ENV }, cwd: work })
  try {
    await session.request('initialize')
    let connected = definitions === undefined
    let serverTools = 0
    for (let waited = 0; waited < 20_000 && !connected; waited += 500) {
      const status = await session.request('mcp_status')
      const rows = (Array.isArray(status.mcpServers) ? status.mcpServers : []) as { name?: unknown; status?: unknown; tools?: unknown }[]
      const row = rows.find(item => item.name === 'overhead')
      if (row?.status === 'connected') { connected = true; serverTools = Array.isArray(row.tools) ? row.tools.length : 0 }
      else await new Promise<void>((resolve) => { setTimeout(resolve, 500) })
    }
    const usage = await session.request('get_context_usage', { detail: 'summary' })
    return { connected, serverTools, totalTokens: typeof usage.totalTokens === 'number' ? usage.totalTokens : undefined }
  } finally {
    await session.close()
  }
}

async function main(): Promise<void> {
  const bin = process.env.CLAUDE_BIN ?? 'claude'
  const version = spawnSync(bin, ['--version'], { encoding: 'utf8', windowsHide: true, shell: process.platform === 'win32' }).stdout.trim()
  const work = mkdtempSync(join(tmpdir(), 'persona-tools-lean-'))
  try {
    const current = currentDefinitions()
    const versions: Readonly<Record<string, readonly Definition[]>> = { current, 'lean-a': lean(current, 'lean-a'), 'lean-b': lean(current, 'lean-b') }
    const base = await measure(bin, undefined, work)
    const pick = (defs: readonly Definition[], names: readonly string[]): Definition[] => defs.filter(item => names.includes(item.name))
    const sets: readonly (readonly [string, readonly string[]])[] = [
      ['persona_ask', ['persona_ask']],
      ['ask_team_opinion', ['ask_team_opinion']],
      ['ask_colleague', ['ask_colleague']],
      ['pass_forward', ['pass_forward']],
      ['review_verdict', ['review_verdict']],
      ['worker-team (persona_ask + ask_colleague + pass_forward + ask_team_opinion)', ['persona_ask', 'ask_colleague', 'pass_forward', 'ask_team_opinion']],
      ['reviewer (persona_ask + review_verdict)', ['persona_ask', 'review_verdict']],
    ]
    const rows: Record<string, Record<string, unknown>> = {}
    for (const [label, names] of sets) {
      rows[label] = {}
      for (const [name, defs] of Object.entries(versions)) {
        const chosen = pick(defs, names)
        const reading = await measure(bin, chosen, work)
        const extra = reading.totalTokens !== undefined && base.totalTokens !== undefined ? reading.totalTokens - base.totalTokens : undefined
        rows[label][name] = { tools: chosen.length, connected: reading.connected && reading.serverTools === chosen.length, chars: JSON.stringify(chosen).length, extraTokens: extra }
        process.stdout.write(`${label} | ${name}: ${extra === undefined ? '?' : `+${String(extra)}`} tokens (${String(JSON.stringify(chosen).length)} chars)\n`)
      }
    }
    // lean-c: the merged hand-over tool, measured alone and inside the worker's set (persona_ask + hand_off + ask_team_opinion, both lean-b).
    const leanB = versions['lean-b'] ?? []
    const merged: readonly (readonly [string, readonly Definition[]])[] = [
      ['hand_off (merged ask_colleague + pass_forward)', [HAND_OFF]],
      ['worker-team MERGED (persona_ask + hand_off + ask_team_opinion)', [...pick(leanB, ['persona_ask', 'ask_team_opinion']), HAND_OFF]],
    ]
    for (const [label, defs] of merged) {
      const reading = await measure(bin, defs, work)
      const extra = reading.totalTokens !== undefined && base.totalTokens !== undefined ? reading.totalTokens - base.totalTokens : undefined
      rows[label] = { 'lean-c': { tools: defs.length, connected: reading.connected && reading.serverTools === defs.length, chars: JSON.stringify(defs).length, extraTokens: extra } }
      process.stdout.write(`${label} | lean-c: ${extra === undefined ? '?' : `+${String(extra)}`} tokens (${String(JSON.stringify(defs).length)} chars)\n`)
    }
    const out = { cli: version, at: new Date().toISOString(), baseTokens: base.totalTokens, note: 'extraTokens = opening context with the tools minus the same launch with no server (CLI-counted, zero model)', rows }
    const outPath = argOf('--out')
    if (outPath !== undefined) writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`)
    const proposal = argOf('--proposal')
    if (proposal !== undefined) {
      const entries: [string, unknown][] = Object.keys(LEAN_DESCRIPTION).map(name => [name, { description: LEAN_DESCRIPTION[name], 'lean-a': LEAN_SCHEMA_A[name], 'lean-b': withoutConstraints(LEAN_SCHEMA_A[name]) }])
      entries.push(['hand_off', { description: HAND_OFF.description, 'lean-c': HAND_OFF.inputSchema }])
      writeFileSync(proposal, `${JSON.stringify(Object.fromEntries(entries), null, 2)}\n`)
    }
  } finally {
    try { rmSync(work, { recursive: true, force: true }) } catch (error) { void error }
  }
}

await main()
