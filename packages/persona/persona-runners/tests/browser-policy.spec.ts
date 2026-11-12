/**
 * COLHEITA 8 + 17 (Lumen, for Onyx): the authority row of the browser tools. The persona navigates, reads and captures; clicking and typing need a person behind the run; a script and
 * an upload are refused by default; a credential-shaped value is never typed; a tool nobody classified does not run.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { authorityCell, type AuthorityKind } from '../src/authority/authority-table.ts'
import { BROWSER_SERVER, browserToolOf, judgeBrowserTool } from '../src/authority/browser-policy.ts'
import { GATE_TOKEN_HEADER, PermissionGate } from '../src/resolve/permission-gate.ts'

describe('judgeBrowserTool', () => {
  it.each(['navigate_page', 'new_page', 'list_pages', 'select_page', 'close_page', 'wait_for', 'take_snapshot', 'take_screenshot', 'list_console_messages', 'list_network_requests', 'get_network_request', 'resize_page', 'emulate'])(
    'navigate, read, capture: %s is a read', (tool) => {
      expect(judgeBrowserTool(tool).kind).toBe('read')
    })

  it.each(['click', 'hover', 'drag', 'press_key', 'handle_dialog'])('acting in the page: %s is an interaction', (tool) => {
    expect(judgeBrowserTool(tool).kind).toBe('interact')
  })

  it('typing is an interaction, unless what is typed has the shape of a credential', () => {
    expect(judgeBrowserTool('fill', { uid: '1_4', value: 'Pão de queijo 2 por R$ 9' }).kind).toBe('interact')
    expect(judgeBrowserTool('fill_form', { elements: [{ uid: '1_2', value: 'ana@x.com' }, { uid: '1_3', value: 'Rua das Flores, 10' }] }).kind).toBe('interact')
    expect(judgeBrowserTool('fill', { uid: '1_4', value: 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789' }).kind).toBe('secret')
    expect(judgeBrowserTool('type_text', { text: 'ghp_abcdefghijklmnopqrstuvwxyz0123456789ABCD' }).kind).toBe('secret')
    expect(judgeBrowserTool('fill_form', { elements: [{ uid: '1_2', value: 'ok' }, { uid: '1_3', value: '-----BEGIN OPENSSH PRIVATE KEY-----\nabc' }] }).kind).toBe('secret')
    expect(judgeBrowserTool('fill', { value: 'AKIAIOSFODNN7EXAMPLE' }).kind).toBe('secret')
  })

  it('a script and an upload are never allowed by default, and neither is a tool nobody classified', () => {
    expect(judgeBrowserTool('evaluate_script', { function: '() => document.cookie' }).kind).toBe('never')
    expect(judgeBrowserTool('upload_file', { uid: '1_9', filePath: 'C:\\x\\a.png' }).kind).toBe('never')
    expect(judgeBrowserTool('some_tool_of_a_newer_server').kind).toBe('never')
    expect(judgeBrowserTool('').kind).toBe('never')
    expect(judgeBrowserTool('  Evaluate_Script ').kind).toBe('never') // spelling does not matter
  })

  it('reads the tool name off the CLI\'s name for it', () => {
    expect(BROWSER_SERVER).toBe('browser')
    expect(browserToolOf('mcp__browser__click')).toBe('click')
    expect(browserToolOf('mcp__browser2__click')).toBeUndefined()
    expect(browserToolOf('mcp__gmail__send_email')).toBeUndefined()
    expect(browserToolOf('Bash')).toBeUndefined()
  })
})

describe('the verdict of the one table for the browser', () => {
  const verdict = (tool: string, authority: AuthorityKind, input?: unknown): string => authorityCell(authority, judgeBrowserTool(tool, input).kind)

  it('with a person behind the run: reads and interactions pass; script, upload, credential and unknown tools are refused', () => {
    expect(verdict('navigate_page', 'person')).toBe('allow')
    expect(verdict('take_snapshot', 'person')).toBe('allow')
    expect(verdict('click', 'person')).toBe('allow')
    expect(verdict('evaluate_script', 'person')).toBe('deny')
    expect(verdict('upload_file', 'person')).toBe('deny')
    expect(verdict('fill', 'person', { value: 'sk-abcdefghijklmnopqrstuvwxyz0123' })).toBe('deny')
    expect(verdict('brand_new_tool', 'person')).toBe('deny')
  })

  it('a routine and an unattended run may look but never act in a page', () => {
    for (const authority of ['routine', 'unattended'] as const) {
      expect(verdict('navigate_page', authority)).toBe('allow')
      expect(verdict('take_screenshot', authority)).toBe('allow')
      expect(verdict('click', authority)).toBe('deny')
      expect(verdict('fill', authority, { value: 'oi' })).toBe('deny')
    }
  })
})

describe('the hook gate applies the browser row to mcp__browser__* when the runner may carry the browser', () => {
  const gates: PermissionGate[] = []
  afterEach(async () => { await Promise.all(gates.splice(0).map(async gate => gate.close())) })

  async function start(browser: boolean): Promise<PermissionGate> {
    const gate = await PermissionGate.start({ token: 'tok-1' })
    gate.configure({ browser })
    gates.push(gate)
    return gate
  }

  async function decide(gate: PermissionGate, tool: string, input: Record<string, unknown> = {}): Promise<'allow' | 'deny' | 'no-opinion'> {
    const response = await fetch(gate.url, {
      method: 'POST', headers: { 'content-type': 'application/json', [GATE_TOKEN_HEADER]: 'tok-1' },
      body: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: tool, tool_input: input, tool_use_id: 'tu' }),
    })
    const body = (await response.json()) as { hookSpecificOutput?: { permissionDecision?: 'allow' | 'deny' } }
    return body.hookSpecificOutput?.permissionDecision ?? 'no-opinion'
  }

  it('a person\'s run: navigate and click are allowed explicitly (the server is attached only with the grant and the turn); script and upload are refused and noted', async () => {
    const gate = await start(true)
    gate.arm({ allowedServers: [] }) // no connector was granted: the browser is the product's own server, not a connector
    expect(await decide(gate, 'mcp__browser__navigate_page', { url: 'https://example.com' })).toBe('allow')
    expect(await decide(gate, 'mcp__browser__take_snapshot')).toBe('allow')
    expect(await decide(gate, 'mcp__browser__click', { uid: '1_2' })).toBe('allow')
    expect(await decide(gate, 'mcp__browser__evaluate_script', { function: '() => 1' })).toBe('deny')
    expect(await decide(gate, 'mcp__browser__upload_file', { uid: '1_9', filePath: 'C:\\x\\a.png' })).toBe('deny')
    expect(await decide(gate, 'mcp__browser__fill', { uid: '1_4', value: 'sk-abcdefghijklmnopqrstuvwxyz0123' })).toBe('deny')
    expect(gate.takeRefusals().map(item => [item.kind, item.verb])).toEqual([['never', 'evaluate_script'], ['never', 'upload_file'], ['secret', 'fill']])
    expect(gate.takeRequests()).toEqual([]) // nothing here is for a card: it is refused
  })

  it('every allowed interaction is written down for the activity book: the tool word and the site, never a typed value (Keel, 12/11)', async () => {
    const gate = await start(true)
    gate.arm({})
    expect(await decide(gate, 'mcp__browser__navigate_page', { url: 'https://www.padarialua.com.br/pedido?x=1' })).toBe('allow')
    expect(await decide(gate, 'mcp__browser__click', { uid: '1_2' })).toBe('allow')
    expect(await decide(gate, 'mcp__browser__fill', { uid: '1_4', value: 'Maria Souza, 11 99999-0000' })).toBe('allow')
    expect(await decide(gate, 'mcp__browser__take_snapshot')).toBe('allow') // a read is not an interaction
    expect(await decide(gate, 'mcp__browser__upload_file', { uid: '1_9', filePath: 'C:\\x\\a.png' })).toBe('deny') // a refusal is not an interaction
    const seen = gate.takeInteractions()
    expect(seen).toEqual([
      { tool: 'mcp__browser__click', verb: 'click', site: 'www.padarialua.com.br' },
      { tool: 'mcp__browser__fill', verb: 'fill', site: 'www.padarialua.com.br' },
    ])
    expect(JSON.stringify(seen)).not.toContain('Maria') // what was typed is not in the book
    expect(gate.takeInteractions()).toEqual([]) // drained
  })

  it('the site is kept between turns (the page outlives a turn) and is simply absent when the gate never saw a page open', async () => {
    const gate = await start(true)
    gate.arm({})
    expect(await decide(gate, 'mcp__browser__click', { uid: '1_2' })).toBe('allow')
    expect(gate.takeInteractions()).toEqual([{ tool: 'mcp__browser__click', verb: 'click' }])
    expect(await decide(gate, 'mcp__browser__new_page', { url: 'https://exemplo.com/a' })).toBe('allow')
    gate.arm({}) // next turn: the interactions of the last one are gone, the page is not
    expect(await decide(gate, 'mcp__browser__hover', { uid: '1_5' })).toBe('allow')
    expect(gate.takeInteractions()).toEqual([{ tool: 'mcp__browser__hover', verb: 'hover', site: 'exemplo.com' }])
    expect(await decide(gate, 'mcp__browser__navigate_page', { url: 'about:blank' })).toBe('allow') // no site in it: the last one stays
    expect(await decide(gate, 'mcp__browser__click', { uid: '1_6' })).toBe('allow')
    expect(gate.takeInteractions()).toEqual([{ tool: 'mcp__browser__click', verb: 'click', site: 'exemplo.com' }])
  })

  it('a routine looks but does not act', async () => {
    const gate = await start(true)
    gate.arm({ authority: 'routine' })
    expect(await decide(gate, 'mcp__browser__list_pages')).toBe('allow')
    expect(await decide(gate, 'mcp__browser__click', { uid: '1_2' })).toBe('deny')
  })

  it('outside an armed turn the browser is refused too', async () => {
    const gate = await start(true)
    expect(await decide(gate, 'mcp__browser__navigate_page')).toBe('deny')
  })

  it('a runner that may NOT carry the browser keeps judging that name as any other connector (out of the mandate: refused)', async () => {
    const gate = await start(false)
    gate.arm({ allowedServers: [] })
    expect(await decide(gate, 'mcp__browser__navigate_page')).toBe('deny')
    expect(gate.takeOutOfMandate()).toEqual([{ tool: 'mcp__browser__navigate_page' }])
  })
})
