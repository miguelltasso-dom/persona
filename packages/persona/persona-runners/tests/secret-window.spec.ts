/**
 * Carbon P0-02 (colheita snapshot 1), the runners' half. RED first: the gateway had no way to mask what its tools answer, and the browser tools that read request bodies, the heap and the console
 * were plain `read` while a password the host just typed was still in the page.
 *
 *  - every answer of the gateway (the single funnel of the product's tools) goes through the host's `redact`;
 *  - while a typed secret is live (the host's mask window), the browser tools that carry raw page data are refused for everybody; a heap snapshot is never allowed;
 *  - a window that cannot be read is a closed one (fail closed).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { authorityCell } from '../src/authority/authority-table.ts'
import { judgeBrowserTool } from '../src/authority/browser-policy.ts'
import * as secretWindow from '../src/authority/secret-window.ts'
import { createMcpGateway, type HarnessCall, type HarnessMcpPorts, type PersonaToolHooks } from '../src/index.ts'
import { GATE_TOKEN_HEADER, PermissionGate } from '../src/resolve/permission-gate.ts'

const run = { personaId: 'nina', ticketId: 't1', assignmentId: 'a1' }
const hooks: PersonaToolHooks = { report: () => {}, recall: () => '', ask: () => {} }
const SECRET = 'Padaria#Lua-2026'

function leaky(seen: HarnessCall[] = []): HarnessMcpPorts {
  return { tools: ['board_list'], call: (input) => { seen.push(input); return Promise.resolve(`{"ok":true,"eco":"${SECRET}"}`) } }
}

describe('the gateway has one funnel for what its tools answer', () => {
  it('without a redact the answer is as the host wrote it (the old behaviour)', async () => {
    const gateway = createMcpGateway({ hooks, harness: leaky(), onlyWired: true })
    const lease = gateway.openTurn({ run, toolLevel: 'write', worktree: 'C:/tmp' })
    expect((await gateway.call(lease.token, 'board_list', {})).content).toContain(SECRET)
  })

  it('with a redact every answer passes through it, a tool of the harness and an approved call included', async () => {
    const redact = (text: string): string => text.split(SECRET).join('••••••')
    const gateway = createMcpGateway({ hooks, harness: leaky(), onlyWired: true, redact })
    const lease = gateway.openTurn({ run, toolLevel: 'write', worktree: 'C:/tmp' })
    const answer = await gateway.call(lease.token, 'board_list', {})
    expect(answer.content).not.toContain(SECRET)
    expect(answer.content).toContain('••••••')
    // The refusal sentence echoes a tool name the model chose: it is masked too.
    const refused = await gateway.call(lease.token, `tool_${SECRET}`, {})
    expect(JSON.stringify(refused)).not.toContain(SECRET)
  })
})

describe('browser tools that carry raw page data while a typed secret is live', () => {
  it('without a window nothing changes: the network and console reads are reads', () => {
    for (const tool of ['list_network_requests', 'get_network_request', 'list_console_messages', 'get_console_message']) {
      expect(judgeBrowserTool(tool).kind, tool).toBe('read')
      expect(judgeBrowserTool(tool, {}, { secretLive: false }).kind, tool).toBe('read')
    }
  })

  it('with a window the raw reads are refused for everybody (secret), and the page reads the persona needs still run', () => {
    for (const tool of ['list_network_requests', 'get_network_request', 'list_console_messages', 'get_console_message', 'performance_start_trace', 'performance_stop_trace', 'performance_analyze_insight', 'lighthouse_audit']) {
      const kind = judgeBrowserTool(tool, {}, { secretLive: true }).kind
      expect(kind, tool).toBe('secret')
      for (const authority of ['person', 'routine', 'unattended'] as const) expect(authorityCell(authority, kind), `${tool} ${authority}`).toBe('deny')
    }
    for (const tool of ['navigate_page', 'take_snapshot', 'take_screenshot', 'list_pages', 'wait_for', 'click']) {
      expect(judgeBrowserTool(tool, {}, { secretLive: true }).kind, tool).not.toBe('secret')
    }
  })

  it('a heap snapshot is never allowed: it holds every value the page ever had', () => {
    expect(judgeBrowserTool('take_memory_snapshot').kind).toBe('never')
    expect(judgeBrowserTool('take_memory_snapshot', {}, { secretLive: true }).kind).toBe('never')
  })
})

describe('the hook gate reads the window at every call', () => {
  const gates: PermissionGate[] = []
  afterEach(async () => {
    secretWindow.registerSecretWindow(undefined)
    await Promise.all(gates.splice(0).map(async gate => gate.close()))
  })

  async function decide(gate: PermissionGate, tool: string, input: Record<string, unknown> = {}): Promise<'allow' | 'deny' | 'no-opinion'> {
    const response = await fetch(gate.url, {
      method: 'POST', headers: { 'content-type': 'application/json', [GATE_TOKEN_HEADER]: 'tok-w' },
      body: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: tool, tool_input: input, tool_use_id: 'tu' }),
    })
    const body = (await response.json()) as { hookSpecificOutput?: { permissionDecision?: 'allow' | 'deny' } }
    return body.hookSpecificOutput?.permissionDecision ?? 'no-opinion'
  }

  async function armed(): Promise<PermissionGate> {
    const gate = await PermissionGate.start({ token: 'tok-w' })
    gate.configure({ browser: true })
    gate.arm({ allowedServers: [] })
    gates.push(gate)
    return gate
  }

  it('the host opens and closes the window; the same gate follows it without being re-armed', async () => {
    const gate = await armed()
    let open = false
    secretWindow.registerSecretWindow(() => open)
    expect(await decide(gate, 'mcp__browser__get_network_request', { reqid: 3 })).toBe('allow')
    open = true // the host typed a password: the mask is live
    expect(await decide(gate, 'mcp__browser__get_network_request', { reqid: 3 })).toBe('deny')
    expect(await decide(gate, 'mcp__browser__list_console_messages')).toBe('deny')
    expect(await decide(gate, 'mcp__browser__take_snapshot')).toBe('allow')
    expect(await decide(gate, 'mcp__browser__click', { uid: '1_2' })).toBe('allow')
    expect(gate.takeRefusals().map(item => [item.kind, item.verb])).toEqual([['secret', 'get_network_request'], ['secret', 'list_console_messages']])
    open = false // ten minutes later
    expect(await decide(gate, 'mcp__browser__get_network_request', { reqid: 3 })).toBe('allow')
  })

  it('a window that cannot be read is a closed one: the raw reads are refused', async () => {
    const gate = await armed()
    secretWindow.registerSecretWindow(() => { throw new Error('mask gone') })
    expect(secretWindow.secretWindowOpen()).toBe(true)
    expect(await decide(gate, 'mcp__browser__list_network_requests')).toBe('deny')
  })

  it('with nothing registered (a runner outside the host) there is no window', () => {
    expect(secretWindow.secretWindowOpen()).toBe(false)
  })
})

describe('what a browser tool answers is masked before the model reads it (PostToolUse)', () => {
  const gates: PermissionGate[] = []
  afterEach(async () => {
    secretWindow.registerSecretWindow(undefined)
    await Promise.all(gates.splice(0).map(async gate => gate.close()))
  })

  async function post(gate: PermissionGate, tool: string, response: unknown): Promise<{ hookSpecificOutput?: { hookEventName?: string; updatedToolOutput?: unknown } }> {
    const reply = await fetch(gate.url, {
      method: 'POST', headers: { 'content-type': 'application/json', [GATE_TOKEN_HEADER]: 'tok-p' },
      body: JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: tool, tool_input: {}, tool_response: response, tool_use_id: 'tu' }),
    })
    return (await reply.json()) as { hookSpecificOutput?: { hookEventName?: string; updatedToolOutput?: unknown } }
  }

  async function started(): Promise<PermissionGate> {
    const gate = await PermissionGate.start({ token: 'tok-p' })
    gates.push(gate)
    secretWindow.registerSecretWindow(() => true, text => text.split(SECRET).join('••••••'))
    return gate
  }

  it('the hook is installed for the browser server only, beside the PreToolUse gate', async () => {
    const gate = await started()
    const settings = gate.settings() as { hooks: { PreToolUse: unknown[]; PostToolUse: { matcher: string; hooks: { url: string }[] }[] } }
    expect(settings.hooks.PostToolUse).toHaveLength(1)
    expect(settings.hooks.PostToolUse[0]?.matcher).toBe('mcp__browser__.*')
    expect(settings.hooks.PostToolUse[0]?.hooks[0]?.url).toBe(gate.url)
    expect(settings.hooks.PreToolUse).toHaveLength(1)
  })

  it('a string, content blocks and nested objects are masked in place; what is not text is left as it came', async () => {
    const gate = await started()
    expect((await post(gate, 'mcp__browser__take_snapshot', `uid=1 value="${SECRET}"`)).hookSpecificOutput).toEqual({ hookEventName: 'PostToolUse', updatedToolOutput: 'uid=1 value="••••••"' })
    const blocks = [{ type: 'text', text: `pw=${SECRET}` }, { type: 'image', data: 'AAAA', mimeType: 'image/png' }]
    expect((await post(gate, 'mcp__browser__take_snapshot', blocks)).hookSpecificOutput?.updatedToolOutput).toEqual([{ type: 'text', text: 'pw=••••••' }, { type: 'image', data: 'AAAA', mimeType: 'image/png' }])
    expect((await post(gate, 'mcp__browser__list_network_requests', { content: [{ type: 'text', text: SECRET }], isError: false })).hookSpecificOutput?.updatedToolOutput).toEqual({ content: [{ type: 'text', text: '••••••' }], isError: false })
  })

  it('an output with nothing secret in it gets no opinion (the CLI keeps its own), and so does a tool that is not the browser\'s', async () => {
    const gate = await started()
    expect(await post(gate, 'mcp__browser__take_snapshot', 'uid=1 button "Entrar"')).toEqual({})
    expect(await post(gate, 'mcp__gmail__read_email', `corpo ${SECRET}`)).toEqual({})
  })

  it('with no redactor registered nothing is changed', async () => {
    const gate = await started()
    secretWindow.registerSecretWindow(undefined)
    expect(await post(gate, 'mcp__browser__take_snapshot', `uid=1 value="${SECRET}"`)).toEqual({})
  })

  it('a redactor that throws masks the whole text instead of letting it through', async () => {
    const gate = await started()
    secretWindow.registerSecretWindow(() => true, () => { throw new Error('mask gone') })
    expect((await post(gate, 'mcp__browser__take_snapshot', `uid=1 value="${SECRET}"`)).hookSpecificOutput?.updatedToolOutput).toBe('••••••')
  })
})
