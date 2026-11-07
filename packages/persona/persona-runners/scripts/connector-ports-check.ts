/**
 * HT-9 ports on the REAL CLI, ZERO model: refreshes the pre-flight cache (control requests only) and prints COUNTS (servers, connected, tools, read-only tools)
 * and the isolation level (plan vs proven). No name, URL or account is printed.
 *   node --import tsx/esm packages/persona/persona-runners/scripts/connector-ports-check.ts
 */
import { cliIsolation, cliIsolationProven, mcpStatusOf, refreshMcpStatus } from '../src/index.ts'
const oar = await import('@botiverse/oar')
const runtime = oar.defaultRuntimes.get('claude')
const installation = runtime?.installation === undefined ? undefined : await runtime.installation()
const version = installation?.kind === 'available' && installation.via === 'executable' ? installation.version : undefined
const t0 = Date.now()
const count = await refreshMcpStatus('claude')
const servers = (mcpStatusOf('claude') ?? []) as { status?: string; tools: { annotations?: { readOnly?: boolean; destructive?: boolean } }[] }[]
const tools = servers.flatMap(server => server.tools)
const needed = { ...process.env, PERSONA_CLI_ENV: 'needed' }
process.stdout.write(JSON.stringify({
  refreshMs: Date.now() - t0, servers: count, connected: servers.filter(s => s.status === 'connected').length, tools: tools.length,
  readOnlyTools: tools.filter(t => t.annotations?.readOnly === true).length, destructiveTools: tools.filter(t => t.annotations?.destructive === true).length,
  isolation: { plan: cliIsolation('claude', needed), proven: cliIsolationProven('claude', { env: needed, ...(version === undefined ? {} : { version }) }), provenWithoutVersion: cliIsolationProven('claude', { env: needed }) },
  modelCalls: 0,
}) + '\n')
