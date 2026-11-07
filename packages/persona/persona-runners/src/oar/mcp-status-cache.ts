/**
 * HT-9 port for the host: `mcpStatusOf(cli)` — the pre-flight (`mcp_status.mcpServers`) of the CLI, each tool with the annotations its server declares, in
 * the shape `annotationTable` reads. The permission gate calls a tool a `read` ONLY when a server proved it here; without this answer every tool is a
 * `send` (fail closed).
 *
 * The host port is SYNCHRONOUS (the gate decides in microseconds), so the answer comes from a cache that an async, ZERO-MODEL refresh fills: the host calls
 * `refreshMcpStatus('claude')` when the CLI is detected / its version changes / the person connects a connector, and `mcpStatusOf('claude')` reads it. A
 * stale answer is safe: a tool added since is simply not proven yet (a `send`), and a tool that stopped being read-only is caught by its NAME (the strictest
 * of the annotation and the name wins).
 *
 * What `of()` keeps is deliberately slim: server name, scope, status and each tool's name and `readOnly` / `destructive`. No URL, no instructions, no schemas, no
 * tool descriptions, no account. The CLI's stderr (with the names of blocked connectors) is never read: the control client discards it.
 *
 * The SAME refresh also keeps the person's connected account connectors (`accountsOf`: name + the proxy URL that identifies it), in memory only, in a separate
 * list: the URL is what the host grants by, and it is personal data, so it is never part of `of()`, never logged and never written to disk.
 */

import { openClaudeControl, type ControlSession, type OpenControl } from './claude-control.ts'
import { probeCwd } from './isolation-run.ts'

/** One server of `mcp_status`, reduced to what the gate needs. */
export interface SlimMcpServer {
  readonly name: string
  readonly scope?: string
  readonly status?: string
  readonly tools: readonly { readonly name: string; readonly annotations?: { readonly readOnly?: true; readonly destructive?: true } }[]
}

/**
 * The slim form of `mcp_status.mcpServers`. Pure.
 * @param servers - The raw list from the CLI.
 * @returns Only servers with a name; per tool only its name and a `readOnly` / `destructive` that is exactly `true`.
 */
export function slimMcpStatus(servers: readonly unknown[]): SlimMcpServer[] {
  const out: SlimMcpServer[] = []
  for (const server of servers) {
    if (server === null || typeof server !== 'object') continue
    const row = server as { name?: unknown; scope?: unknown; status?: unknown; tools?: unknown }
    if (typeof row.name !== 'string' || row.name === '') continue
    const tools: SlimMcpServer['tools'][number][] = []
    for (const tool of Array.isArray(row.tools) ? row.tools : []) {
      if (tool === null || typeof tool !== 'object') continue
      const entry = tool as { name?: unknown; annotations?: { readOnly?: unknown; destructive?: unknown } }
      if (typeof entry.name !== 'string' || entry.name === '') continue
      const annotations: { readOnly?: true; destructive?: true } = {}
      if (entry.annotations?.readOnly === true) annotations.readOnly = true
      if (entry.annotations?.destructive === true) annotations.destructive = true
      tools.push(Object.keys(annotations).length === 0 ? { name: entry.name } : { name: entry.name, annotations })
    }
    out.push({
      name: row.name,
      ...(typeof row.scope === 'string' ? { scope: row.scope } : {}),
      ...(typeof row.status === 'string' ? { status: row.status } : {}),
      tools,
    })
  }
  return out
}

export interface McpStatusCacheDeps {
  /** Opens a control session for the CLI (injected in tests). */
  readonly open?: (cli: string) => OpenControl | undefined
  /** Longest wait for the account connectors to arrive (they come 1–3 s after `initialize`). Default 12 s. */
  readonly arriveMs?: number
  readonly pauseMs?: number
  readonly now?: () => number
}

interface Entry {
  readonly servers: readonly SlimMcpServer[]
  readonly accounts: readonly AccountConnector[]
  readonly at: number
}

/** A connector of the person's ACCOUNT (claude.ai) that is connected now: its name as the CLI gives it and the proxy URL that identifies it. In memory only. */
export interface AccountConnector {
  readonly name: string
  readonly url: string
}

/** The connected account connectors of a raw `mcp_status` list: scope `claudeai`, status `connected`, with a URL; one per URL. Pure. */
export function accountConnectorsOf(servers: readonly unknown[]): AccountConnector[] {
  const seen = new Set<string>()
  const out: AccountConnector[] = []
  for (const server of servers) {
    if (server === null || typeof server !== 'object') continue
    const row = server as { name?: unknown; scope?: unknown; status?: unknown; config?: { url?: unknown } }
    if (row.scope !== 'claudeai' || row.status !== 'connected' || typeof row.name !== 'string' || row.name === '' || typeof row.config?.url !== 'string' || row.config.url === '' || seen.has(row.config.url)) continue
    seen.add(row.config.url)
    out.push({ name: row.name, url: row.config.url })
  }
  return out
}

/** A per-CLI cache of the slim pre-flight. */
export class McpStatusCache {
  private readonly entries = new Map<string, Entry>()
  private readonly inflight = new Map<string, Promise<number>>()
  private readonly deps: McpStatusCacheDeps

  constructor(deps: McpStatusCacheDeps = {}) {
    this.deps = deps
  }

  /** The last pre-flight of this CLI, or `undefined` when none was taken (then the gate fails closed). Synchronous. */
  of(cli: string): readonly SlimMcpServer[] | undefined {
    return this.entries.get(cli)?.servers
  }

  /**
   * The connected account connectors of this CLI as of the last refresh (name + URL), or `undefined` when none was taken. Synchronous. The URL is personal data:
   * it lives only in this list, which the host uses to grant and to name connectors; it is never logged or written by this module.
   */
  accountsOf(cli: string): readonly AccountConnector[] | undefined {
    return this.entries.get(cli)?.accounts
  }

  /** How old the answer is, in ms; `undefined` when there is none. */
  ageMs(cli: string): number | undefined {
    const entry = this.entries.get(cli)
    return entry === undefined ? undefined : (this.deps.now ?? Date.now)() - entry.at
  }

  /** Forget one CLI, or all of them. */
  clear(cli?: string): void {
    if (cli === undefined) this.entries.clear()
    else this.entries.delete(cli)
  }

  /**
   * Take the pre-flight now: control requests only, ZERO model. One refresh at a time per CLI (a second call waits for the first). Never throws: a CLI that
   * cannot answer leaves the previous answer as it was and returns -1.
   * @param cli - The CLI id (only `claude` has a control client).
   * @returns How many servers the pre-flight found, or -1 when it could not run.
   */
  async refresh(cli: string): Promise<number> {
    const running = this.inflight.get(cli)
    if (running !== undefined) return running
    const job = this.take(cli).finally(() => { this.inflight.delete(cli) })
    this.inflight.set(cli, job)
    return job
  }

  private async take(cli: string): Promise<number> {
    let open: OpenControl | undefined
    try {
      open = this.deps.open?.(cli) ?? (cli === 'claude' ? await realOpen() : undefined)
    } catch (error) {
      void error // the factory itself can fail (no executable): the refresh never throws
      return -1
    }
    if (open === undefined) return -1
    const cwd = probeCwd()
    let session: ControlSession | undefined
    try {
      session = open({ args: [], env: {}, cwd: cwd.dir }) // spawning can throw (no executable): inside the try, so refresh never throws
      await session.request('initialize')
      let servers: SlimMcpServer[] = []
      let accounts: AccountConnector[] = []
      const arriveMs = this.deps.arriveMs ?? 12_000
      const pauseMs = this.deps.pauseMs ?? 600
      for (let waited = 0; waited < arriveMs; waited += pauseMs) {
        const status = await session.request('mcp_status')
        const rows = Array.isArray(status.mcpServers) ? status.mcpServers : []
        servers = slimMcpStatus(rows)
        accounts = accountConnectorsOf(rows)
        if (servers.length > 0 && !servers.some(row => row.status === 'pending')) break
        await new Promise<void>((resolve) => { setTimeout(resolve, pauseMs) })
      }
      this.entries.set(cli, { servers, accounts, at: (this.deps.now ?? Date.now)() })
      return servers.length
    } catch (error) {
      void error // the CLI could not answer: keep what we had
      return -1
    } finally {
      try { await session?.close() } catch (error) { void error }
      cwd.dispose()
    }
  }
}

async function realOpen(): Promise<OpenControl | undefined> {
  try {
    const oar = await import('@botiverse/oar')
    const runtime = oar.defaultRuntimes.get('claude')
    const installation = runtime?.installation === undefined ? undefined : await runtime.installation()
    if (installation === undefined || installation.kind !== 'available' || installation.via !== 'executable') return undefined
    return openClaudeControl(installation.command)
  } catch (error) {
    void error
    return undefined
  }
}

/** The process-wide cache the host port reads. */
export const defaultMcpStatusCache = new McpStatusCache()

/**
 * The host port `ConnectorPorts.mcpStatusOf`: synchronous, from the default cache. `undefined` until {@link refreshMcpStatus} has run for this CLI.
 * @param cli - The CLI id.
 */
export function mcpStatusOf(cli: string): readonly unknown[] | undefined {
  return defaultMcpStatusCache.of(cli)
}

/**
 * The host port `ConnectorPorts.availableConnectors` (as `{ name, url }`): the person's connected account connectors of this CLI, from the same refresh as
 * {@link mcpStatusOf}. `undefined` until a refresh ran. The URL is personal data: keep it in memory.
 * @param cli - The CLI id.
 */
export function availableConnectorsOf(cli: string): readonly AccountConnector[] | undefined {
  return defaultMcpStatusCache.accountsOf(cli)
}

/**
 * Fill the default cache (zero model). Call it when the CLI is detected, when its version changes and when the person connects a connector.
 * @param cli - The CLI id (default `claude`).
 * @returns How many servers were found, or -1 when the pre-flight could not run.
 */
export async function refreshMcpStatus(cli: string = 'claude'): Promise<number> {
  return defaultMcpStatusCache.refresh(cli)
}
