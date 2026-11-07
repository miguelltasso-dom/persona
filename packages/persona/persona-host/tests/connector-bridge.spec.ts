/**
 * HT-8/HT-9: the bridge that gives the host its connector ports, as an adapter over the runners' pre-flight cache (`McpStatusCache`). The CLI's
 * control client is a FAKE here (no process, no model); the real `claude` is exercised, control requests only and counts only, by
 * scripts/connector-bridge-dry.ts.
 */
import { McpStatusCache, annotationTable, classifyTool, type ControlSession } from '@deepseek-ai/dsh-persona-runners'
import { expect } from 'vitest'
import { ConnectorBridge } from '../src/connector-bridge.ts'
import { it } from './host-harness.ts'

const GMAIL_URL = 'https://proxy.example.test/v1/mcp/0f0f0f0f0f0f0f0f'
const DRIVE_URL = 'https://proxy.example.test/v1/mcp/aaaaaaaaaaaaaaaa'

/** What `mcp_status` returns for a person who has Gmail connected, Drive waiting for a login and a server of their own. */
const SERVERS = [
  {
    name: 'claude.ai Gmail', scope: 'claudeai', status: 'connected', config: { url: GMAIL_URL },
    tools: [
      { name: 'search_threads', annotations: { readOnly: true } },
      { name: 'send_message', annotations: {} },
      { name: 'delete_thread', annotations: { destructive: true } },
      { name: 'summarize', annotations: {} },
    ],
  },
  { name: 'claude.ai Google Drive', scope: 'claudeai', status: 'needs-auth', config: { url: DRIVE_URL }, tools: [] },
  { name: 'my-notes', scope: 'user', status: 'connected', tools: [{ name: 'read_note', annotations: { readOnly: true } }] },
]

interface Rig {
  readonly bridge: ConnectorBridge
  readonly opened: () => number
  readonly closed: () => number
  readonly requests: string[]
}

function rig(options: { servers?: () => unknown[][]; failOpen?: boolean; clock?: { now: number } } = {}): Rig {
  let opened = 0
  let closed = 0
  const requests: string[] = []
  const steps = options.servers ?? (() => [SERVERS])
  const clock = options.clock ?? { now: 0 }
  const cache = new McpStatusCache({
    open: () => () => {
      opened += 1
      if (options.failOpen === true) throw new Error('claude: command not found')
      const script = steps()
      let seen = 0
      const session: ControlSession = {
        request: (subtype) => {
          requests.push(subtype)
          if (subtype === 'mcp_status') {
            const mcpServers = script[Math.min(seen, script.length - 1)] ?? []
            seen += 1
            return Promise.resolve({ mcpServers })
          }
          return Promise.resolve({ account: { email: 'x' } })
        },
        close: () => { closed += 1; return Promise.resolve() },
      }
      return session
    },
    arriveMs: 50,
    pauseMs: 1,
    now: () => clock.now,
  })
  const bridge = new ConnectorBridge({ cache, now: () => clock.now, staleMs: 1000, retryMs: 500 })
  return { bridge, opened: () => opened, closed: () => closed, requests }
}

it('lists the CONNECTED connectors of the account by name and proxy URL; a connector waiting for a login and a server of the person\'s own are not offered', async () => {
  const r = rig()
  await r.bridge.refresh()
  const ports = r.bridge.ports()
  expect(ports.availableConnectors?.('claude')).toEqual([{ cli: 'claude', id: GMAIL_URL, name: 'Gmail', source: 'claudeai' }])
  expect(ports.availableConnectors?.('codex')).toEqual([])
  expect(ports.connectorDefinitionOf?.('claude', GMAIL_URL)).toBe('account')
  expect(ports.connectorDefinitionOf?.('claude', DRIVE_URL)).toBe('missing') // not connected: nothing to grant
  expect(ports.connectorDefinitionOf?.('claude', 'my-notes')).toBe('missing') // not an account connector
  expect(ports.connectorDefinitionOf?.('codex', GMAIL_URL)).toBe('missing')
  expect(r.bridge.connected).toBe(1)
  expect(r.bridge.ready).toBe(true)
  expect(r.requests.filter(request => request === 'initialize')).toHaveLength(1) // control requests only: no user message, so no model
  expect(r.requests.every(request => request === 'initialize' || request === 'mcp_status')).toBe(true)
  expect(r.closed()).toBe(1)
})

it('the pre-flight feeds the gate: only the server\'s own readOnly makes a tool a read; send and delete ask; an unknown tool is a send; no URL in what the gate sees', async () => {
  const r = rig()
  await r.bridge.refresh()
  const servers = r.bridge.ports().mcpStatusOf?.('claude') ?? []
  const lookup = annotationTable(servers)
  const kind = (tool: string): string => classifyTool(tool, lookup(tool)).actionClass
  expect(kind('mcp__claude_ai_Gmail__search_threads')).toBe('read') // "list_emails sem cartão"
  expect(kind('mcp__claude_ai_Gmail__send_message')).toBe('send') // "send com cartão"
  expect(kind('mcp__claude_ai_Gmail__delete_thread')).toBe('delete')
  expect(kind('mcp__claude_ai_Gmail__summarize')).toBe('send') // harmless-looking and unproven: fail closed
  expect(kind('mcp__claude_ai_Gmail__not_in_the_list')).toBe('send')
  expect(JSON.stringify(servers)).not.toContain('proxy.example.test') // the URL stays in the bridge's memory, never in the table the gate reads
  expect(r.bridge.ports().mcpStatusOf?.('codex')).toBeUndefined()
})

it('waits for the account connectors that arrive after initialize (pending first, connected later)', async () => {
  const pending = [{ name: 'claude.ai Gmail', scope: 'claudeai', status: 'pending', config: { url: GMAIL_URL }, tools: [] }]
  const r = rig({ servers: () => [[], pending, SERVERS] })
  await r.bridge.refresh()
  expect(r.bridge.ports().availableConnectors?.('claude').map(item => item.name)).toEqual(['Gmail'])
  expect(r.requests.filter(request => request === 'mcp_status').length).toBeGreaterThanOrEqual(3)
})

it('routes a request to the connector it needs with the engine\'s pure rule: e-mail → Gmail, a cake → nothing', async () => {
  const r = rig()
  await r.bridge.refresh()
  const ports = r.bridge.ports()
  const available = ports.availableConnectors?.('claude') ?? []
  expect(ports.connectorsNeededBy?.('leia meus e-mails de hoje e me diga o que é urgente', available).map(item => item.name)).toEqual(['Gmail'])
  expect(ports.connectorsNeededBy?.('faça um bolo de cenoura', available)).toEqual([])
  expect(ports.connectorsNeededBy?.('envie um email para a Ana', [])).toEqual([])
})

it('isolation is what the product DELIVERS (cliIsolationProven): no installed version means no proof, so Claude is "none"; a CLI with no isolation stays "none"', () => {
  const r = rig()
  const ports = r.bridge.ports()
  expect(ports.cliIsolation?.('claude')).toBe('none') // the card then says the connector is loaded always
  expect(ports.cliIsolation?.('cursor')).toBe('none')
})

it('a CLI that is missing or not logged in leaves NO connector (fail closed), says nothing, and is not hammered', async () => {
  const clock = { now: 0 }
  const r = rig({ failOpen: true, clock })
  await r.bridge.refresh() // does not throw
  const ports = r.bridge.ports()
  expect(ports.availableConnectors?.('claude')).toEqual([])
  expect(r.bridge.ready).toBe(false)
  const tries = r.opened()
  clock.now += 100 // inside the retry pause: asking a port does not try again
  ports.availableConnectors?.('claude')
  ports.mcpStatusOf?.('claude')
  await r.bridge.refresh()
  expect(r.opened()).toBe(tries + 1) // only the explicit refresh opened one
  expect(r.closed()).toBe(0)
})

it('a failed refresh keeps the last good snapshot; a stale snapshot is refreshed in the background by the next question, once', async () => {
  const clock = { now: 0 }
  let healthy = true
  const r = rig({ clock, servers: () => healthy ? [SERVERS] : [[]] })
  await r.bridge.refresh()
  expect(r.bridge.connected).toBe(1)
  clock.now = 500
  r.bridge.ports().availableConnectors?.('claude')
  expect(r.opened()).toBe(1) // fresh enough: nothing started
  clock.now = 5000 // stale
  healthy = false
  r.bridge.ports().availableConnectors?.('claude')
  r.bridge.ports().mcpStatusOf?.('claude') // a second question while the first refresh runs joins it
  await r.bridge.refresh()
  expect(r.opened()).toBe(2)
  expect(r.bridge.connected).toBe(0) // the CLI now reports none: that is the truth, not an error
})
