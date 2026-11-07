/**
 * The two runner ports the host needs for the read-only HT-9 (persona-spec/contracts/connector-ports.md):
 *  - `mcpStatusOf(cli)`: the pre-flight of the CLI with each tool's annotations, synchronous, filled by a zero-model refresh;
 *  - `cliIsolationProven(cli, …)`: the isolation level the product delivers NOW, counting the proof of the installed version.
 */
import { describe, expect, it } from 'vitest'
import { annotationTable } from '../src/resolve/permission-gate.ts'
import { cliIsolation } from '../src/oar/isolation.ts'
import { cliIsolationProven } from '../src/oar/isolation-gate.ts'
import { McpStatusCache, accountConnectorsOf, slimMcpStatus } from '../src/oar/mcp-status-cache.ts'
import type { ControlLaunch, ControlSession, OpenControl } from '../src/oar/claude-control.ts'

const RAW = [
  {
    name: 'claude_ai_Gmail', scope: 'claudeai', status: 'connected', config: { type: 'claudeai-proxy', url: 'https://proxy.example.test/v1/mcp/secret-id' },
    instructions: 'long instructions that must not stay', tools: [
      { name: 'list_labels', description: 'List labels', inputSchema: { type: 'object' }, annotations: { readOnly: true } },
      { name: 'delete_label', annotations: { destructive: true, readOnly: false } },
      { name: 'search_threads', annotations: { readOnly: true, openWorld: true } },
      { name: 'send_message' },
    ],
  },
  { name: 'plain', tools: 'not-a-list' },
  { scope: 'user', tools: [] },
  null,
  'junk',
  { name: '', tools: [] },
]

describe('slimMcpStatus: what the gate needs and nothing else', () => {
  const slim = slimMcpStatus(RAW)
  it('keeps the server name, scope, status and each tool\'s name with readOnly / destructive exactly true', () => {
    expect(slim).toEqual([
      {
        name: 'claude_ai_Gmail', scope: 'claudeai', status: 'connected',
        tools: [{ name: 'list_labels', annotations: { readOnly: true } }, { name: 'delete_label', annotations: { destructive: true } }, { name: 'search_threads', annotations: { readOnly: true } }, { name: 'send_message' }],
      },
      { name: 'plain', tools: [] },
    ])
  })
  it('drops every URL, instruction, schema, description and extra field (nothing personal stays in memory)', () => {
    const text = JSON.stringify(slim)
    expect(text).not.toMatch(/proxy\.example|secret-id|instructions|inputSchema|description|openWorld|config/u)
  })
  it('is exactly what annotationTable reads: a proven read is a read, a lying "readOnly: false" on a destructive tool is not', () => {
    const table = annotationTable(slim)
    expect(table('mcp__claude_ai_Gmail__list_labels')).toEqual({ readOnlyHint: true })
    expect(table('mcp__claude_ai_Gmail__delete_label')).toEqual({ destructiveHint: true })
    expect(table('mcp__claude_ai_Gmail__send_message')).toEqual({})
    expect(table('mcp__claude_ai_Gmail__unknown')).toBeUndefined()
  })
})

/** A control session that behaves like the CLI: the account connectors arrive late, one `pending` first. */
function fakeOpen(rounds: readonly unknown[][], log: string[] = []): OpenControl {
  return (_launch: ControlLaunch): ControlSession => {
    let asked = 0
    return {
      request: async (subtype) => {
        log.push(subtype)
        if (subtype === 'mcp_status') {
          const rows = rounds[Math.min(asked, rounds.length - 1)] ?? []
          asked += 1
          return { mcpServers: rows }
        }
        return {}
      },
      close: async () => { log.push('close') },
    }
  }
}

describe('McpStatusCache: filled by a zero-model refresh, read synchronously', () => {
  const fast = { arriveMs: 60, pauseMs: 5 }
  it('is empty (so the gate fails closed) until a refresh ran; then answers at once, without asking again', async () => {
    const log: string[] = []
    const cache = new McpStatusCache({ ...fast, open: () => fakeOpen([RAW], log) })
    expect(cache.of('claude')).toBeUndefined()
    expect(cache.ageMs('claude')).toBeUndefined()
    expect(await cache.refresh('claude')).toBe(2)
    const before = log.length
    expect(cache.of('claude')?.map(row => row.name)).toEqual(['claude_ai_Gmail', 'plain'])
    expect(cache.of('claude')).toBe(cache.of('claude'))
    expect(log.length).toBe(before) // reading never talks to the CLI
    expect(log).toContain('initialize')
    expect(log).toContain('close')
    expect(log.every(entry => ['initialize', 'mcp_status', 'close'].includes(entry))).toBe(true) // control requests only: no prompt, no model
  })

  it('waits for the connectors that arrive late (a pending server first, the settled list after)', async () => {
    const cache = new McpStatusCache({ ...fast, open: () => fakeOpen([[{ name: 'late', status: 'pending', tools: [] }], [{ name: 'late', status: 'connected', tools: [{ name: 'list_labels', annotations: { readOnly: true } }] }]]) })
    expect(await cache.refresh('claude')).toBe(1)
    expect(cache.of('claude')?.[0]).toMatchObject({ name: 'late', status: 'connected' })
  })

  it('never throws: a CLI that cannot answer returns -1 and keeps what it had', async () => {
    const good = fakeOpen([RAW])
    let broken = false
    const cache = new McpStatusCache({ ...fast, open: () => (launch) => {
      if (broken) throw new Error('claude not found')
      return good(launch)
    } })
    expect(await cache.refresh('claude')).toBe(2)
    broken = true
    expect(await cache.refresh('claude')).toBe(-1)
    expect(cache.of('claude')).toHaveLength(2)
    const nothing = new McpStatusCache({ ...fast, open: () => undefined })
    expect(await nothing.refresh('codex')).toBe(-1)
    expect(nothing.of('codex')).toBeUndefined()
  })

  it('one refresh at a time per CLI: a second call waits for the first', async () => {
    const log: string[] = []
    const cache = new McpStatusCache({ ...fast, open: () => fakeOpen([RAW], log) })
    const [a, b] = await Promise.all([cache.refresh('claude'), cache.refresh('claude')])
    expect([a, b]).toEqual([2, 2])
    expect(log.filter(entry => entry === 'initialize')).toHaveLength(1)
  })

  it('age counts from the refresh; clear forgets one CLI or all', async () => {
    let now = 1_000
    const cache = new McpStatusCache({ ...fast, now: () => now, open: () => fakeOpen([RAW]) })
    await cache.refresh('claude')
    now = 4_000
    expect(cache.ageMs('claude')).toBe(3_000)
    cache.clear('claude')
    expect(cache.of('claude')).toBeUndefined()
  })

  it('a refresh that finds nothing is an answer too (an empty list), not an error', async () => {
    const cache = new McpStatusCache({ ...fast, open: () => fakeOpen([[]]) })
    expect(await cache.refresh('claude')).toBe(0)
    expect(cache.of('claude')).toEqual([])
  })
})

describe('accountsOf: the connected account connectors, from the SAME refresh, URL in memory only', () => {
  const ROWS = [
    { name: 'claude.ai Gmail', scope: 'claudeai', status: 'connected', config: { url: 'https://proxy.example.test/v1/mcp/aaa' }, tools: [] },
    { name: 'claude.ai Google Calendar', scope: 'claudeai', status: 'needs-auth', config: { url: 'https://proxy.example.test/v1/mcp/bbb' }, tools: [] },
    { name: 'claude.ai Drive', scope: 'claudeai', status: 'connected', config: { url: 'https://proxy.example.test/v1/mcp/ccc' }, tools: [] },
    { name: 'claude.ai Drive (again)', scope: 'claudeai', status: 'connected', config: { url: 'https://proxy.example.test/v1/mcp/ccc' }, tools: [] },
    { name: 'user-server', scope: 'user', status: 'connected', config: { url: 'https://elsewhere.example.test/mcp' }, tools: [] },
    { name: 'no-url', scope: 'claudeai', status: 'connected', config: {}, tools: [] },
    { name: '', scope: 'claudeai', status: 'connected', config: { url: 'https://proxy.example.test/v1/mcp/ddd' }, tools: [] },
    { name: 'pending', scope: 'claudeai', status: 'pending', config: { url: 'https://proxy.example.test/v1/mcp/eee' }, tools: [] },
    null, 'junk',
  ]

  it('lists only scope claudeai + status connected + a URL, one per URL, with the name as the CLI gives it', () => {
    expect(accountConnectorsOf(ROWS)).toEqual([
      { name: 'claude.ai Gmail', url: 'https://proxy.example.test/v1/mcp/aaa' },
      { name: 'claude.ai Drive', url: 'https://proxy.example.test/v1/mcp/ccc' },
    ])
  })

  it('is filled by the same refresh as mcpStatusOf (one session) and read synchronously; empty until a refresh ran', async () => {
    const log: string[] = []
    const cache = new McpStatusCache({ arriveMs: 60, pauseMs: 5, open: () => fakeOpen([ROWS], log) })
    expect(cache.accountsOf('claude')).toBeUndefined()
    await cache.refresh('claude')
    expect(cache.accountsOf('claude')?.map(row => row.name)).toEqual(['claude.ai Gmail', 'claude.ai Drive'])
    expect(log.filter(entry => entry === 'initialize')).toHaveLength(1)
    cache.clear('claude')
    expect(cache.accountsOf('claude')).toBeUndefined()
  })

  it('the URL lives ONLY in accountsOf: it is nowhere in what of() returns', async () => {
    const cache = new McpStatusCache({ arriveMs: 60, pauseMs: 5, open: () => fakeOpen([ROWS]) })
    await cache.refresh('claude')
    expect(JSON.stringify(cache.of('claude'))).not.toMatch(/proxy\.example|elsewhere|mcp\/aaa/u)
    expect(JSON.stringify(cache.accountsOf('claude'))).toContain('mcp/aaa')
  })

  it('a failed refresh keeps the previous list; a connector that disconnected leaves the list at the next refresh', async () => {
    let rows: unknown[] = ROWS
    const cache = new McpStatusCache({ arriveMs: 60, pauseMs: 5, open: () => fakeOpen([rows]) })
    await cache.refresh('claude')
    rows = [{ name: 'claude.ai Gmail', scope: 'claudeai', status: 'needs-auth', config: { url: 'https://proxy.example.test/v1/mcp/aaa' }, tools: [] }]
    await cache.refresh('claude')
    expect(cache.accountsOf('claude')).toEqual([])
    const broken = new McpStatusCache({ arriveMs: 60, pauseMs: 5, open: () => { throw new Error('no cli') } })
    expect(await broken.refresh('claude')).toBe(-1)
    expect(broken.accountsOf('claude')).toBeUndefined()
  })
})

describe('cliIsolationProven: "full" only when the launch is really applied', () => {
  const gateWith = (verdicts: Record<string, 'ok' | 'failed' | 'unknown'>): { verdict: (version: string, mode: string) => 'ok' | 'failed' | 'unknown' } => ({ verdict: (version, mode) => verdicts[`${version}|${mode}`] ?? 'unknown' })
  const needed = { PERSONA_CLI_ENV: 'needed' }
  const answerOnly = { PERSONA_CLI_ENV: 'answer-only' }

  it('the plan says full for Claude in needed; with the version PROVEN it stays full, unproven or failed it is none (the call runs native)', () => {
    expect(cliIsolation('claude', needed)).toBe('full')
    expect(cliIsolationProven('claude', { env: needed, version: '2.1.318', gate: gateWith({ '2.1.318|needed': 'ok' }) })).toBe('full')
    expect(cliIsolationProven('claude', { env: needed, version: '2.1.318', gate: gateWith({}) })).toBe('none')
    expect(cliIsolationProven('claude', { env: needed, version: '2.1.318', gate: gateWith({ '2.1.318|needed': 'failed' }) })).toBe('none')
    expect(cliIsolationProven('claude', { env: needed, version: '2.1.319', gate: gateWith({ '2.1.318|needed': 'ok' }) })).toBe('none') // a new version is unproven
  })

  it('without the installed version Claude cannot be proven', () => {
    expect(cliIsolationProven('claude', { env: needed, gate: gateWith({ '2.1.318|needed': 'ok' }) })).toBe('none')
  })

  it('native never isolates; answer-only does not isolate a call WITH tools (it runs native), proven or not', () => {
    expect(cliIsolationProven('claude', { env: { PERSONA_CLI_ENV: 'native' }, version: '2.1.318', gate: gateWith({ '2.1.318|answer-only': 'ok' }) })).toBe('none')
    expect(cliIsolationProven('claude', { env: answerOnly, version: '2.1.318', gate: gateWith({ '2.1.318|answer-only': 'ok' }) })).toBe('none')
  })

  it('a CLI with no probe is none even where the plan says full (OpenCode), and a plan that changes nothing keeps its level (Codex partial, Cursor none)', () => {
    expect(cliIsolation('opencode', needed)).toBe('full')
    expect(cliIsolationProven('opencode', { env: needed, version: '1.0.0', gate: gateWith({ '1.0.0|needed': 'ok' }) })).toBe('none')
    expect(cliIsolationProven('codex', { env: needed })).toBe('partial')
    expect(cliIsolationProven('cursor', { env: needed })).toBe('none')
  })

  it('it never claims more than the plan: it is never above cliIsolation', () => {
    const rank = { none: 0, partial: 1, full: 2 } as const
    for (const cli of ['claude', 'codex', 'opencode', 'cursor', 'other']) {
      for (const env of [needed, answerOnly, { PERSONA_CLI_ENV: 'native' }]) {
        const proven = cliIsolationProven(cli, { env, version: '2.1.318', gate: gateWith({ '2.1.318|needed': 'ok', '2.1.318|answer-only': 'ok' }) })
        expect(rank[proven]).toBeLessThanOrEqual(rank[cliIsolation(cli, env)])
      }
    }
  })
})
