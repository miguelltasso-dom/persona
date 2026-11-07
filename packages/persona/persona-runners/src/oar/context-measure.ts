/**
 * ZERO model: what the opening context of a CLI launch costs, counted by the CLI itself. A control session (`initialize`, `mcp_status`, `get_context_usage`) never
 * sends a user message, and `get_context_usage` is computed locally; with a stdio MCP server that offers exactly some tool definitions, the difference against
 * the same launch without it is the vendor-token cost of those definitions. Used by the measurement scripts (tools overhead, OPT-10b); not part of the
 * product's path.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { OpenControl } from './claude-control.ts'

export interface ContextReading {
  /** The MCP server (when one was offered) came up `connected`. */
  readonly connected: boolean
  /** How many tools the CLI lists for it. */
  readonly serverTools: number
  readonly totalTokens: number | undefined
  /** The CLI's own categories (System prompt, MCP tools, …), name and tokens. */
  readonly categories: readonly { readonly name: string; readonly tokens: number }[]
}

const SERVER = `
const rl = require('node:readline').createInterface({ input: process.stdin })
const send = (m) => process.stdout.write(JSON.stringify(m) + '\\n')
const tools = JSON.parse(require('node:fs').readFileSync(process.env.TOOLS_FILE, 'utf8'))
rl.on('line', (line) => {
  let msg; try { msg = JSON.parse(line) } catch { return }
  if (msg.method === 'initialize') send({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: (msg.params && msg.params.protocolVersion) || '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'measure', version: '1' } } })
  else if (msg.method === 'tools/list') send({ jsonrpc: '2.0', id: msg.id, result: { tools } })
  else if (msg.method === 'tools/call') send({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: 'ok' }] } })
  else if (msg.id !== undefined && msg.method !== undefined) send({ jsonrpc: '2.0', id: msg.id, result: {} })
})`

/**
 * Count the opening context of one launch.
 * @param open - The control client (the real one, or a fake in tests).
 * @param input - The vendor arguments and env of the launch (the product's own), the cwd, and optionally the tool definitions an MCP server offers.
 */
export async function measureContext(open: OpenControl, input: {
  readonly args: readonly string[]
  readonly env: Readonly<Record<string, string | null>>
  readonly cwd: string
  /** An MCP server that offers exactly these definitions (`name`, `description`, `inputSchema`, optional `annotations`), written under `work`. */
  readonly server?: { readonly name: string; readonly definitions: readonly object[]; readonly work: string; readonly nodeBinary?: string }
  readonly arriveMs?: number
  readonly pauseMs?: number
}): Promise<ContextReading> {
  const args = [...input.args]
  if (input.server !== undefined) {
    mkdirSync(input.server.work, { recursive: true })
    const toolsFile = join(input.server.work, `tools-${String(input.server.definitions.length)}.json`)
    const serverFile = join(input.server.work, 'measure-server.cjs')
    writeFileSync(toolsFile, JSON.stringify(input.server.definitions))
    writeFileSync(serverFile, SERVER)
    args.push('--mcp-config', JSON.stringify({ mcpServers: { [input.server.name]: { command: input.server.nodeBinary ?? process.execPath, args: [serverFile], env: { TOOLS_FILE: toolsFile } } } }))
  }
  const session = open({ args, env: input.env, cwd: input.cwd })
  try {
    await session.request('initialize')
    let connected = input.server === undefined
    let serverTools = 0
    const arriveMs = input.arriveMs ?? 20_000
    const pauseMs = input.pauseMs ?? 500
    for (let waited = 0; waited < arriveMs && !connected; waited += pauseMs) {
      const status = await session.request('mcp_status')
      const rows = (Array.isArray(status.mcpServers) ? status.mcpServers : []) as { name?: unknown; status?: unknown; tools?: unknown }[]
      const row = rows.find(item => item.name === input.server?.name)
      if (row?.status === 'connected') {
        connected = true
        serverTools = Array.isArray(row.tools) ? row.tools.length : 0
      } else {
        await new Promise<void>((resolve) => { setTimeout(resolve, pauseMs) })
      }
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

/**
 * The cost in tokens of what a launch adds over a baseline, by the CLI's own count.
 * @param withServer - A reading with the server.
 * @param baseline - The same launch without it.
 * @returns `undefined` when either total is missing.
 */
export function contextDelta(withServer: ContextReading, baseline: ContextReading): number | undefined {
  return withServer.totalTokens !== undefined && baseline.totalTokens !== undefined ? withServer.totalTokens - baseline.totalTokens : undefined
}
