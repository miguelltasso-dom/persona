/**
 * A fake CLI control client and a fake account for the connector tests (D-096): it behaves like the CLI measured on 2.1.318 (reports/iso5-dry.md). No real CLI, no model.
 * Shared by the runner guard tests and by the host guard test of the fallback (Anvil): `unreachedWorld()` + `fakeOpen()` -> `new IsolationRuntime({ gate, open: fakeOpen(world), ... })`.
 */
import type { ControlLaunch, ControlSession, OpenControl } from '../../src/oar/claude-control.ts'

export const URL_A = 'https://proxy.example/v1/mcp/aaaa'
export const URL_B = 'https://proxy.example/v1/mcp/bbbb'

export interface Account { url: string; status: 'connected' | 'needs-auth' | 'failed' }
export interface UnreachedWorld {
  loggedIn: boolean
  accounts: Account[]
  opened: ControlLaunch[]
  ignoreAllowList: boolean
  /** The connector pre-flight session never answers (the 40 s timeout in production). */
  hangConnector: boolean
  /** The isolation does not isolate (a CLI version whose proof must fail): servers show up under the isolated launch. */
  isolationBroken: boolean
}
/** A fake account: both connectors connected unless told otherwise. */
export const unreachedWorld = (over: Partial<UnreachedWorld> = {}): UnreachedWorld => ({
  loggedIn: true, accounts: [{ url: URL_A, status: 'connected' }, { url: URL_B, status: 'connected' }], opened: [], ignoreAllowList: false, hangConnector: false, isolationBroken: false, ...over,
})

/** Behaves like the CLI measured on 2.1.318 (reports/iso5-dry.md): strict/project = no MCP; local + allow-list = only the listed URLs; native = every account connector. */
export function fakeOpen(state: UnreachedWorld): OpenControl {
  return (launch): ControlSession => {
    state.opened.push(launch)
    const args = launch.args
    const after = (flag: string): string | undefined => { const at = args.indexOf(flag); return at >= 0 ? args[at + 1] : undefined }
    const sources = after('--setting-sources')
    const settings = JSON.parse(after('--settings') ?? '{}') as { allowedMcpServers?: { serverUrl?: string }[] }
    const allowed = settings.allowedMcpServers?.map(row => row.serverUrl)
    const servers = !state.isolationBroken && (args.includes('--strict-mcp-config') || sources === 'project') ? []
      : sources?.startsWith('local') === true ? state.accounts.filter(row => state.ignoreAllowList || allowed === undefined || allowed.includes(row.url)) : state.accounts
    return {
      request: async (subtype) => {
        if (subtype === 'initialize') return { account: state.loggedIn ? { subscriptionType: 'x' } : null, commands: args.includes('--disable-slash-commands') ? [] : ['a'] }
        if (subtype === 'mcp_status') {
          if (state.hangConnector && allowed !== undefined) await new Promise<never>(() => undefined)
          return { mcpServers: servers.map(row => ({ status: row.status, config: { url: row.url } })) }
        }
        if (subtype === 'get_context_usage') return { totalTokens: 32_114 + servers.filter(row => row.status === 'connected').length * 1464, categories: [{ name: 'System tools', tokens: args.includes('--tools') ? 0 : 1 }] }
        if (subtype === 'get_settings') return { applied: { model: 'claude-opus-5-5', effort: 'medium' } }
        return {}
      },
      close: async () => undefined,
    }
  }
}
