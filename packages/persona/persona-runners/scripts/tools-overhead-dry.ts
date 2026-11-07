/**
 * ZERO model: what the TOOLS a turn offers cost per request, measured by the CLI itself. The CLI computes the token cost of its opening context locally
 * (`get_context_usage`), so a control session launched with the product's own arguments (a gated task: no built-in tools, `--strict-mcp-config`, the project
 * setting source) and an MCP server that offers exactly some tool definitions gives the real vendor-token cost of those definitions: the difference
 * against the same launch with no server. No prompt is sent, nothing reaches a model.
 *
 *   node --import tsx/esm packages/persona/persona-runners/scripts/tools-overhead-dry.ts [--out <file.json>] [--gmail <tools>]
 *
 *  - the TEAM tools: the definitions the HT-0 gateway really announces (board, sprint, routine, hire, ask_team_opinion, ask_colleague, pass_forward,
 *    review_verdict, persona_ask, persona_recall, report), for a persona with the `write` grant and with the `read` grant;
 *  - a synthetic connector of N tools (default 30, the size of a real mail connector) for the OPT-10b fixture.
 * Prints counts and token numbers only.
 */

import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openClaudeControl } from '../src/oar/claude-control.ts'
import { CLAUDE_ISOLATION_ARGS, CLAUDE_ISOLATION_ENV } from '../src/oar/isolation.ts'
import { createMcpGateway } from '../src/mcp/gateway.ts'
import { connectorFixtureDefinitions } from '../src/mcp/connector-fixture.ts'
import { HARNESS_TOOLS } from '../src/mcp/harness-tools.ts'

interface Definition {
  readonly name: string
  readonly description: string
  readonly inputSchema: unknown
  readonly annotations?: unknown
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

/** The definitions the gateway announces to a turn with this grant, with every harness port wired (what the host serves a real persona). */
function teamDefinitions(level: 'read' | 'write'): Definition[] {
  const gateway = createMcpGateway({
    hooks: { report: () => undefined, recall: () => '', ask: () => ({ ok: true, content: 'ok' }) } as never,
    harness: { tools: [...HARNESS_TOOLS], call: async () => '{"ok":true}' },
    onlyWired: true,
  })
  const lease = gateway.openTurn({ run: { personaId: 'nina', ticketId: 't1', assignmentId: 'a1' }, toolLevel: level, worktree: 'C:/tmp/x' })
  try {
    return gateway.describe(lease.token).map(item => ({ name: item.name, description: item.description, inputSchema: item.inputSchema }))
  } finally {
    gateway.closeTurn(lease.token)
  }
}

interface Reading {
  readonly connected: boolean
  readonly totalTokens: number | undefined
  readonly categories: readonly { readonly name: string; readonly tokens: number }[]
  readonly serverTools: number
}

async function measure(bin: string, definitions: readonly Definition[] | undefined, work: string): Promise<Reading> {
  const args = ['--permission-mode', 'dontAsk', '--tools', '', ...CLAUDE_ISOLATION_ARGS]
  if (definitions !== undefined) {
    const toolsFile = join(work, `tools-${String(definitions.length)}.json`)
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
    const categories = (Array.isArray(usage.categories) ? usage.categories : []) as { name?: unknown; tokens?: unknown }[]
    return {
      connected, serverTools,
      totalTokens: typeof usage.totalTokens === 'number' ? usage.totalTokens : undefined,
      categories: categories.filter(item => typeof item.name === 'string' && typeof item.tokens === 'number').map(item => ({ name: String(item.name), tokens: Number(item.tokens) })),
    }
  } finally {
    await session.close()
  }
}

async function main(): Promise<void> {
  const bin = process.env.CLAUDE_BIN ?? 'claude'
  const version = spawnSync(bin, ['--version'], { encoding: 'utf8', windowsHide: true, shell: process.platform === 'win32' }).stdout.trim()
  const work = mkdtempSync(join(tmpdir(), 'persona-tools-overhead-'))
  try {
    const team = { write: teamDefinitions('write'), read: teamDefinitions('read') }
    const sizeOf = (definitions: readonly Definition[]): number => JSON.stringify(definitions).length
    const base = await measure(bin, undefined, work)
    const fixtureSize = Number(argOf('--gmail') ?? 30)
    const rows: Record<string, unknown> = {}
    // What a real turn is offered (`productToolsOpener`): only `persona_ask` always, plus the team tools the host rules give THAT turn, plus the board / sprint /
    // routine / hire tools when the request's words ask for them. These are the subsets a TEAM round sees.
    const pick = (names: readonly string[]): Definition[] => team.write.filter(item => names.includes(item.name))
    const subsets: readonly (readonly [string, readonly Definition[]])[] = [
      ['turn-ask-only', pick(['persona_ask'])],
      ['turn-worker-team', pick(['persona_ask', 'ask_colleague', 'pass_forward', 'ask_team_opinion'])],
      ['turn-reviewer', pick(['persona_ask', 'review_verdict'])],
      ['turn-worker-team-board', pick(['persona_ask', 'ask_colleague', 'pass_forward', 'ask_team_opinion', 'board_list', 'board_card_move'])],
    ]
    for (const [label, definitions] of [...subsets, ['team-write', team.write], ['team-read', team.read], [`connector-fixture-${String(fixtureSize)}`, connectorFixtureDefinitions(fixtureSize)]] as const) {
      const withServer = await measure(bin, definitions, work)
      const delta = withServer.totalTokens !== undefined && base.totalTokens !== undefined ? withServer.totalTokens - base.totalTokens : undefined
      const mcp = withServer.categories.filter(item => /mcp/iu.test(item.name)).reduce((total, item) => total + item.tokens, 0)
      rows[label] = {
        tools: definitions.length, definitionChars: sizeOf(definitions), connected: withServer.connected, serverTools: withServer.serverTools,
        totalTokens: withServer.totalTokens ?? null, deltaTokens: delta ?? null, mcpCategoryTokens: mcp,
        tokensPerTool: delta !== undefined && definitions.length > 0 ? Math.round(delta / definitions.length) : null,
        charsPerToken: delta !== undefined && delta > 0 ? Math.round((sizeOf(definitions) / delta) * 100) / 100 : null,
      }
    }
    const summary = {
      at: new Date().toISOString(), version,
      baseline: { totalTokens: base.totalTokens ?? null, categories: base.categories },
      teamToolNames: { write: team.write.map(item => item.name), read: team.read.map(item => item.name) },
      ...rows, modelCalls: 0,
    }
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
    const out = argOf('--out')
    if (out !== undefined) writeFileSync(out, `${JSON.stringify(summary, null, 2)}\n`)
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`tools-overhead-dry: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
