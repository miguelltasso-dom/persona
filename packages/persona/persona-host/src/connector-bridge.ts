/**
 * HT-8/HT-9 (D-084, D-083), the BRIDGE that gives the host its connector ports. Until now nobody installed them (`PersonaHost.connectorPorts` was
 * `{}`), so the app offered no connector at all, not even to read. This is only an ADAPTER: the one pre-flight of the CLI (control requests,
 * `initialize` + `mcp_status`: no user message, so NO model and no spend) lives in `persona-runners` (`McpStatusCache`, Tally) and fills both the
 * slim tool table the gate reads and the account connectors with their proxy URL (in memory only). The host's ports answer from it:
 *
 *   availableConnectors   the connected connectors of the ACCOUNT (scope `claudeai`), by name and proxy URL (the id; never shown to the person);
 *   connectorDefinitionOf `account` for those (grantable by URL policy, no credential copied); anything else is not grantable here;
 *   mcpStatusOf           the tools of each server with the annotations the server itself reports: the gate calls a tool `read` ONLY on the
 *                         server's own `readOnly` proof, so `list_emails` goes through without a card and `send_*` always asks;
 *   cliIsolation          what the product DELIVERS (`cliIsolationProven`): the plan, but only if the installed version was proven;
 *   connectorsNeededBy    the engine's pure routing (no model), only ever fed text the PERSON wrote.
 *
 * The ports are SYNCHRONOUS (the host asks them inside a request), so a refresh is background work: once at boot and again, stale-while-revalidate,
 * when the snapshot is old. A CLI that is missing, not logged in or slow leaves the snapshot as it was (empty at first): the persona then simply has
 * no connector. Names and URLs are personal data: never logged, never written. Fail closed.
 */

import { asHumanText, connectorsNeededBy } from '@deepseek-ai/dsh-persona-engine'
import { cliIsolationProven, defaultMcpStatusCache, type McpStatusCache } from '@deepseek-ai/dsh-persona-runners'
import type { ConnectorPorts } from './connector-grants-host.ts'
import type { ConnectorRef } from './types.ts'

/** What the bridge needs from outside. Tests inject a cache with a fake control client and a clock. */
export interface ConnectorBridgeDeps {
  /** The pre-flight cache (default: the process-wide one). */
  readonly cache?: Pick<McpStatusCache, 'refresh' | 'of' | 'accountsOf' | 'ageMs'>
  /** The installed version of a CLI (from the host's connection probe); without it nothing can be called proven. */
  readonly versionOf?: (cli: string) => string | undefined
  readonly now?: () => number
  /** A snapshot older than this is refreshed in the background the next time a port is asked. Default 15 min. */
  readonly staleMs?: number
  /** After a failure, how long to leave the CLI alone. Default 2 min. */
  readonly retryMs?: number
}

/** `claude.ai Gmail` → `Gmail`: what the person calls it. */
const shownName = (name: string): string => name.replace(/^claude\.ai\s+/iu, '').trim() || name

/** The account-connector bridge. */
export class ConnectorBridge {
  private failedAt: number | undefined
  private inflight: Promise<void> | undefined

  /** @param deps - The cache and timings. */
  constructor(private readonly deps: ConnectorBridgeDeps = {}) {}

  private get cache(): NonNullable<ConnectorBridgeDeps['cache']> {
    return this.deps.cache ?? defaultMcpStatusCache
  }

  /** @returns How many account connectors are connected right now (a count, for diagnostics). */
  get connected(): number {
    return this.cache.accountsOf('claude')?.length ?? 0
  }

  /** @returns Whether a pre-flight was ever read. */
  get ready(): boolean {
    return this.cache.of('claude') !== undefined
  }

  /**
   * Take the pre-flight now (control requests only, zero model). One at a time; a second call joins the first. Never throws: a CLI that is not
   * there, not logged in or too slow leaves the previous snapshot.
   */
  refresh(): Promise<void> {
    this.inflight ??= this.read().finally(() => { this.inflight = undefined })
    return this.inflight
  }

  private async read(): Promise<void> {
    const found = await this.cache.refresh('claude').catch(() => -1)
    this.failedAt = found < 0 ? (this.deps.now ?? Date.now)() : undefined
  }

  /** The snapshot is old (or never read) and the CLI was not tried just now: refresh it in the background. */
  private touch(): void {
    if (this.inflight !== undefined) return
    const now = (this.deps.now ?? Date.now)()
    if (this.failedAt !== undefined && now - this.failedAt < (this.deps.retryMs ?? 120_000)) return
    const age = this.cache.ageMs('claude')
    if (age !== undefined && age < (this.deps.staleMs ?? 900_000)) return
    void this.refresh()
  }

  /** @returns The ports this bridge answers. Synchronous and read-only; asking them may start a background refresh. */
  ports(): Pick<ConnectorPorts, 'availableConnectors' | 'connectorDefinitionOf' | 'mcpStatusOf' | 'mcpServerNameOf' | 'cliIsolation' | 'connectorsNeededBy'> {
    return {
      availableConnectors: (cli) => {
        if (cli !== 'claude') return []
        this.touch()
        return (this.cache.accountsOf('claude') ?? []).map((row): ConnectorRef => ({ cli: 'claude', id: row.url, name: shownName(row.name), source: 'claudeai' }))
      },
      connectorDefinitionOf: (cli, id) => (cli === 'claude' && (this.cache.accountsOf('claude') ?? []).some(row => row.url === id) ? 'account' : 'missing'),
      // The server name the CLI uses for this connector (the raw `claude.ai <Name>`): what the gate's mandate is made of.
      mcpServerNameOf: (cli, id) => cli === 'claude' ? (this.cache.accountsOf('claude') ?? []).find(row => row.url === id)?.name : undefined,
      // The gate reads the tools of every server it may see; only the server's own `readOnly` makes a tool a read. Never read = fail closed.
      mcpStatusOf: (cli) => {
        if (cli !== 'claude') return undefined
        this.touch()
        return this.cache.of('claude')
      },
      // What the product DELIVERS, not what the plan says: a launch that runs native loads the connectors always, and the card says so.
      cliIsolation: (cli) => {
        const version = this.deps.versionOf?.(cli)
        return cliIsolationProven(cli, version === undefined ? {} : { version })
      },
      // Only the text the PERSON wrote reaches here (the grants host guarantees it); the routing is the engine's pure one, no model.
      connectorsNeededBy: (text, list) => {
        const needed = connectorsNeededBy(asHumanText(text), list.map(item => ({ id: item.id, name: item.name })))
        return list.filter(item => needed.chosen.some(choice => choice.id === item.id))
      },
    }
  }
}

/**
 * The real bridge: the `claude` the person has on this computer, found the way the runners find it.
 * @param versionOf - The installed version of a CLI (the host's connection probe).
 */
export function claudeConnectorBridge(versionOf?: (cli: string) => string | undefined): ConnectorBridge {
  return new ConnectorBridge(versionOf === undefined ? {} : { versionOf })
}
