/**
 * HT-8/HT-9 (D-084): the permission gate the CLI's PreToolUse HTTP hook calls. A real HTTP server on 127.0.0.1; the tests post what the
 * CLI posts (measured on 2.1.318, reports/ht89-permission-dry.md). The same behaviour was proven against the real CLI by
 * `scripts/ht89-dry.ts` (fake endpoint, zero model).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { GATE_TOKEN_HEADER, NEVER_PRE_ALLOWED, PermissionGate, annotationTable } from '../src/resolve/permission-gate.ts'
import { argsHash } from '../src/resolve/tool-input.ts'

const gates: PermissionGate[] = []
afterEach(async () => { await Promise.all(gates.splice(0).map(async gate => gate.close())) })

async function start(options: Parameters<typeof PermissionGate.start>[0] = {}): Promise<PermissionGate> {
  const gate = await PermissionGate.start({ token: 'tok-1', ...options })
  gates.push(gate)
  return gate
}

interface Reply { status: number; permission?: string; reason?: string; body: unknown }

/** Post what the CLI posts before a tool call. */
async function ask(gate: PermissionGate, event: Record<string, unknown>, headers: Record<string, string> = { [GATE_TOKEN_HEADER]: 'tok-1' }): Promise<Reply> {
  const response = await fetch(gate.url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(event) })
  const body = (await response.json()) as { hookSpecificOutput?: { permissionDecision?: string; permissionDecisionReason?: string } }
  return { status: response.status, body, ...(body.hookSpecificOutput?.permissionDecision === undefined ? {} : { permission: body.hookSpecificOutput.permissionDecision }), ...(body.hookSpecificOutput?.permissionDecisionReason === undefined ? {} : { reason: body.hookSpecificOutput.permissionDecisionReason }) }
}

const SEND = { hook_event_name: 'PreToolUse', tool_name: 'mcp__gmail__send_message', tool_input: { to: 'ana@x.com', body: 'oi' }, tool_use_id: 'toolu_1', mcp_server: 'gmail' }

describe('settings the CLI is started with', () => {
  it('installs an HTTP PreToolUse hook on MCP tools, with the token header, and allows exactly its own URL', async () => {
    const gate = await start()
    const settings = gate.settings() as { hooks: { PreToolUse: { matcher: string; hooks: { type: string; url: string; headers: Record<string, string> }[] }[] }; allowedHttpHookUrls: string[] }
    expect(gate.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/hook$/u)
    // P0-1: the hook also sees the built-in tools that write a file (to keep them inside the draft); COLHEITA 8: and the shell and the reads that can reach a secret.
    // Every other built-in tool is still not its business.
    expect(settings.hooks.PreToolUse[0]?.matcher).toBe('mcp__.*|Write|Edit|MultiEdit|NotebookEdit|Bash|PowerShell|Read|Grep|Glob')
    expect(settings.hooks.PreToolUse[0]?.hooks[0]).toEqual({ type: 'http', url: gate.url, headers: { [GATE_TOKEN_HEADER]: 'tok-1' } })
    expect(settings.allowedHttpHookUrls).toEqual([gate.url])
  })

  it('a random token per gate, never the same twice', async () => {
    const a = await PermissionGate.start()
    const b = await PermissionGate.start()
    gates.push(a, b)
    const tokenOf = (gate: PermissionGate): string => (gate.settings() as { hooks: { PreToolUse: { hooks: { headers: Record<string, string> }[] }[] } }).hooks.PreToolUse[0]?.hooks[0]?.headers[GATE_TOKEN_HEADER] ?? ''
    expect(tokenOf(a)).toMatch(/^[0-9a-f]{64}$/u)
    expect(tokenOf(a)).not.toBe(tokenOf(b))
  })
})

describe('only the CLI of this run can ask', () => {
  it('no token, a wrong token, or the wrong path/method gets a refusal and decides nothing', async () => {
    const gate = await start()
    gate.arm({ preAllow: ['read'] })
    expect((await ask(gate, SEND, {})).status).toBe(403)
    expect((await ask(gate, SEND, { [GATE_TOKEN_HEADER]: 'wrong' })).status).toBe(403)
    expect((await fetch(gate.url.replace('/hook', '/other'), { method: 'POST', headers: { [GATE_TOKEN_HEADER]: 'tok-1' } })).status).toBe(404)
    expect((await fetch(gate.url, { method: 'GET', headers: { [GATE_TOKEN_HEADER]: 'tok-1' } })).status).toBe(404)
    expect(gate.takeRequests()).toEqual([])
  })

  it('a body that is not JSON is refused', async () => {
    const gate = await start()
    gate.arm()
    const response = await fetch(gate.url, { method: 'POST', headers: { [GATE_TOKEN_HEADER]: 'tok-1' }, body: '{not json' })
    expect(response.status).toBe(400)
  })
})

describe('outside a turn nothing is decided (fail-closed)', () => {
  it('before the first turn, and after the turn ended, every MCP call is denied and nothing is recorded', async () => {
    const gate = await start()
    expect((await ask(gate, SEND)).permission).toBe('deny')
    gate.arm({ preAllow: ['send'], approved: [{ tool: SEND.tool_name, argsHash: argsHash(SEND.tool_input) }] })
    gate.disarm()
    expect((await ask(gate, SEND)).permission).toBe('deny')
    expect(gate.takeRequests()).toEqual([])
  })

  it('an approval armed for one turn does not survive into the next', async () => {
    const gate = await start()
    gate.arm({ approved: [{ tool: SEND.tool_name, argsHash: argsHash(SEND.tool_input) }] })
    gate.disarm()
    gate.arm()
    expect((await ask(gate, SEND)).permission).toBe('deny')
  })
})

describe('the decision', () => {
  it('a class in preAllow passes without asking; the others are denied and recorded', async () => {
    const gate = await start({ annotations: tool => (tool.endsWith('__list_threads') ? { readOnlyHint: true } : undefined) })
    gate.arm({ preAllow: ['read'] })
    expect((await ask(gate, { ...SEND, tool_name: 'mcp__gmail__list_threads', tool_input: {} })).permission).toBe('allow')
    const sent = await ask(gate, SEND)
    expect(sent.permission).toBe('deny')
    expect(sent.reason).toMatch(/approval/u)
    const [request] = gate.takeRequests()
    expect(request).toMatchObject({ tool: 'mcp__gmail__send_message', actionClass: 'send', verb: 'send', server: 'gmail', toolUseId: 'toolu_1', truncated: false, masked: false })
    expect(request?.requestedInput).toEqual({ to: 'ana@x.com', body: 'oi' })
    expect(request?.argsHash).toBe(argsHash(SEND.tool_input))
  })

  it('pay and delete are NEVER pre-allowed, even when the host lists them', async () => {
    expect(NEVER_PRE_ALLOWED).toEqual(['pay', 'delete'])
    const gate = await start()
    gate.arm({ preAllow: ['read', 'change', 'send', 'pay', 'delete'] })
    expect((await ask(gate, { ...SEND, tool_name: 'mcp__bank__transfer_funds', tool_input: { amount: 10 } })).permission).toBe('deny')
    expect((await ask(gate, { ...SEND, tool_name: 'mcp__drive__trash_file', tool_input: { id: 'f1' } })).permission).toBe('deny')
    expect((await ask(gate, { ...SEND, tool_name: 'mcp__gmail__send_message' })).permission).toBe('allow')
    expect(gate.takeRequests().map(row => row.actionClass)).toEqual(['pay', 'delete'])
  })

  it('an unannotated tool with no known verb fails closed: it is a send, so read-only pre-allow does not let it through', async () => {
    const gate = await start()
    gate.arm({ preAllow: ['read'] })
    expect((await ask(gate, { ...SEND, tool_name: 'mcp__x__get_inbox', tool_input: {} })).permission).toBe('deny')
    expect(gate.takeRequests()[0]?.actionClass).toBe('send')
  })

  it('approve = run again: the approved call passes ONCE, with exactly those arguments', async () => {
    const gate = await start()
    gate.arm({ approved: [{ tool: SEND.tool_name, argsHash: argsHash(SEND.tool_input) }] })
    expect((await ask(gate, SEND)).permission).toBe('allow')
    expect((await ask(gate, SEND)).permission).toBe('deny') // consumed
  })

  it('"I approved A, it sent B": the same tool with other arguments is denied and asks again', async () => {
    const gate = await start()
    gate.arm({ approved: [{ tool: SEND.tool_name, argsHash: argsHash(SEND.tool_input) }] })
    const other = await ask(gate, { ...SEND, tool_input: { to: 'bia@x.com', body: 'oi' } })
    expect(other.permission).toBe('deny')
    const [request] = gate.takeRequests()
    expect(request?.requestedInput).toEqual({ to: 'bia@x.com', body: 'oi' })
    expect(request?.argsHash).toBe(argsHash({ to: 'bia@x.com', body: 'oi' }))
    // and the approval for A is still there for A
    expect((await ask(gate, SEND)).permission).toBe('allow')
  })

  it('an approval for another TOOL with the same arguments does not apply', async () => {
    const gate = await start()
    gate.arm({ approved: [{ tool: 'mcp__gmail__send_message', argsHash: argsHash(SEND.tool_input) }] })
    expect((await ask(gate, { ...SEND, tool_name: 'mcp__slack__post_message' })).permission).toBe('deny')
  })

  it('the same blocked call asked twice is one request (the card is not duplicated)', async () => {
    const gate = await start()
    gate.arm()
    await ask(gate, SEND)
    await ask(gate, SEND)
    expect(gate.takeRequests()).toHaveLength(1)
  })

  it('built-in tools are not this gate\'s business: no opinion, the persona\'s own tool policy applies', async () => {
    const gate = await start()
    gate.arm()
    const reply = await ask(gate, { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls' } })
    expect(reply.status).toBe(200)
    expect(reply.body).toEqual({})
    expect(gate.takeRequests()).toEqual([])
  })
})

describe('takeReleased: the host learns which approved calls REALLY ran', () => {
  const SEND_TOOL = 'mcp__gmail__send_message'
  const call = async (gate: PermissionGate, tool: string, input: Record<string, unknown>): Promise<Reply> => ask(gate, { hook_event_name: 'PreToolUse', tool_name: tool, tool_input: input, tool_use_id: 'x' })

  it('lists an approved call that passed, once, in order; drains; and arm clears what was not taken', async () => {
    const gate = await start()
    const a = argsHash({ to: 'ana@x.com' })
    const b = argsHash({ to: 'bia@x.com' })
    gate.arm({ approved: [{ tool: SEND_TOOL, argsHash: a }, { tool: SEND_TOOL, argsHash: b }] })
    expect(gate.takeReleased()).toEqual([])
    await call(gate, SEND_TOOL, { to: 'bia@x.com' })
    await call(gate, SEND_TOOL, { to: 'ana@x.com' })
    expect(gate.takeReleased()).toEqual([{ tool: SEND_TOOL, argsHash: b }, { tool: SEND_TOOL, argsHash: a }])
    expect(gate.takeReleased()).toEqual([])
    gate.arm({ approved: [{ tool: SEND_TOOL, argsHash: a }] })
    await call(gate, SEND_TOOL, { to: 'ana@x.com' })
    gate.arm({ approved: [] }) // the next turn starts: what the host did not take is gone
    expect(gate.takeReleased()).toEqual([])
  })

  it('a refusal, a pre-allowed class and an approval that did not match are NOT released', async () => {
    const gate = await start()
    gate.arm({ preAllow: ['send'], approved: [{ tool: SEND_TOOL, argsHash: argsHash({ to: 'ana@x.com' }) }] })
    await call(gate, SEND_TOOL, { to: 'ana@x.com' }) // allowed by the class, so the approval stays unused
    gate.arm({ approved: [{ tool: SEND_TOOL, argsHash: argsHash({ to: 'ana@x.com' }) }] })
    await call(gate, SEND_TOOL, { to: 'other@x.com' }) // other arguments: refused
    await call(gate, 'mcp__gmail__forward_email', { to: 'ana@x.com' }) // other tool: refused
    expect(gate.takeReleased()).toEqual([])
    expect(gate.takeRequests()).toHaveLength(2)
  })

  it('the same approval cannot be released twice', async () => {
    const gate = await start()
    gate.arm({ approved: [{ tool: SEND_TOOL, argsHash: argsHash({ to: 'ana@x.com' }) }] })
    await call(gate, SEND_TOOL, { to: 'ana@x.com' })
    await call(gate, SEND_TOOL, { to: 'ana@x.com' })
    expect(gate.takeReleased()).toHaveLength(1)
  })

  it('after the turn ends (disarm) the host can still take what ran during it', async () => {
    const gate = await start()
    gate.arm({ approved: [{ tool: SEND_TOOL, argsHash: argsHash({ to: 'ana@x.com' }) }] })
    await call(gate, SEND_TOOL, { to: 'ana@x.com' })
    gate.disarm()
    expect(gate.takeReleased()).toHaveLength(1)
  })
})

describe('allowedServers: a persona never has more access than the person granted (D-081/D-083)', () => {
  const GMAIL_READ = 'mcp__claude_ai_Gmail__list_labels'
  const GMAIL_SEND = 'mcp__claude_ai_Gmail__send_message'
  const DRIVE_READ = 'mcp__claude_ai_Drive__search'
  const DRIVE_SEND = 'mcp__claude_ai_Drive__share_file'
  const annotations = annotationTable([
    { name: 'claude_ai_Gmail', tools: [{ name: 'list_labels', annotations: { readOnly: true } }] },
    { name: 'claude_ai_Drive', tools: [{ name: 'search', annotations: { readOnly: true } }] },
  ])
  const call = async (gate: PermissionGate, tool: string, input: Record<string, unknown> = { q: 'x' }): Promise<Reply> => ask(gate, { hook_event_name: 'PreToolUse', tool_name: tool, tool_input: input, tool_use_id: 'x' })

  it('a grant of the Gmail only: its tools are judged as before; a proven READ of the Drive is denied, with no request and no card', async () => {
    const gate = await start({ annotations })
    gate.arm({ preAllow: ['read'], allowedServers: ['claude_ai_Gmail'] })
    expect((await call(gate, GMAIL_READ)).permission).toBe('allow')
    const drive = await call(gate, DRIVE_READ)
    expect(drive.permission).toBe('deny')
    expect(drive.reason).toMatch(/outside what this persona was given/u)
    expect(drive.reason).not.toMatch(/approval|aprov/iu) // it does not tell the model to wait for a person: there is nobody to ask
    expect(gate.takeRequests()).toEqual([])
    expect(gate.pending()).toBe(0)
  })

  it('a SEND through the server that was not granted is DENIED, not turned into a card; a send through the granted one is still a card', async () => {
    const gate = await start({ annotations })
    gate.arm({ preAllow: ['read'], allowedServers: ['claude_ai_Gmail'] })
    expect((await call(gate, DRIVE_SEND)).permission).toBe('deny')
    expect(gate.takeRequests()).toEqual([])
    expect((await call(gate, GMAIL_SEND, { to: 'ana@x.com' })).permission).toBe('deny')
    expect(gate.takeRequests().map(request => request.tool)).toEqual([GMAIL_SEND])
  })

  it('"approved[] does not save a server outside the mandate": an approval of that very call is no approval, and nothing is released', async () => {
    const gate = await start({ annotations })
    const input = { fileId: 'f1', to: 'ana@x.com' }
    gate.arm({ allowedServers: ['claude_ai_Gmail'], approved: [{ tool: DRIVE_SEND, argsHash: argsHash(input) }] })
    expect((await call(gate, DRIVE_SEND, input)).permission).toBe('deny')
    expect(gate.takeReleased()).toEqual([])
    expect(gate.takeRequests()).toEqual([])
    // the same approval for a granted server still works
    gate.arm({ allowedServers: ['claude_ai_Gmail'], approved: [{ tool: GMAIL_SEND, argsHash: argsHash(input) }] })
    expect((await call(gate, GMAIL_SEND, input)).permission).toBe('allow')
    expect(gate.takeReleased()).toEqual([{ tool: GMAIL_SEND, argsHash: argsHash(input) }])
  })

  it('an EMPTY list denies every connector tool; the product\'s own servers keep "no opinion" in either case', async () => {
    const gate = await start({ annotations, ownServers: ['persona'] })
    gate.arm({ preAllow: ['read'], allowedServers: [] })
    expect((await call(gate, GMAIL_READ)).permission).toBe('deny')
    expect((await call(gate, DRIVE_READ)).permission).toBe('deny')
    const own = await call(gate, 'mcp__persona__persona_recall')
    expect(own.permission).toBeUndefined() // {}: no opinion
    expect(gate.takeRequests()).toEqual([])
  })

  it('absent = the old behaviour (compat): a proven read of ANY server passes with the read class pre-allowed', async () => {
    const gate = await start({ annotations })
    gate.arm({ preAllow: ['read'] })
    expect((await call(gate, GMAIL_READ)).permission).toBe('allow')
    expect((await call(gate, DRIVE_READ)).permission).toBe('allow')
    expect(gate.takeOutOfMandate()).toEqual([])
  })

  it('the server name is matched exactly as a prefix: a server that merely starts with a granted name is another server', async () => {
    const gate = await start({ annotations: () => ({ readOnlyHint: true }) })
    gate.arm({ preAllow: ['read'], allowedServers: ['gmail'] })
    expect((await call(gate, 'mcp__gmail__list')).permission).toBe('allow')
    expect((await call(gate, 'mcp__gmail_extra__list')).permission).toBe('deny')
    expect((await call(gate, 'mcp__gmailx__list')).permission).toBe('deny')
    expect((await call(gate, 'mcp__Gmail__list')).permission).toBe('deny') // exact, case included: the host sanitizes the name, the gate does not guess
  })

  it('takeOutOfMandate lists the names only, drains, is cleared by arm, and never carries an argument', async () => {
    const gate = await start({ annotations })
    gate.arm({ preAllow: ['read'], allowedServers: ['claude_ai_Gmail'] })
    await call(gate, DRIVE_READ, { q: 'segredo-do-usuario' })
    await call(gate, DRIVE_SEND, { to: 'alguem@x.com' })
    const taken = gate.takeOutOfMandate()
    expect(taken).toEqual([{ tool: DRIVE_READ }, { tool: DRIVE_SEND }])
    expect(JSON.stringify(taken)).not.toMatch(/segredo|alguem/u)
    expect(gate.takeOutOfMandate()).toEqual([])
    await call(gate, DRIVE_READ)
    gate.arm({ allowedServers: ['claude_ai_Drive'] })
    expect(gate.takeOutOfMandate()).toEqual([])
  })

  it('the mandate is per turn: disarm lifts it with the rest, and outside a turn everything is denied as before', async () => {
    const gate = await start({ annotations })
    gate.arm({ preAllow: ['read'], allowedServers: ['claude_ai_Gmail'] })
    gate.disarm()
    expect((await call(gate, GMAIL_READ)).permission).toBe('deny')
    gate.arm({ preAllow: ['read'] }) // the next turn gives no list: the old behaviour, not the previous list
    expect((await call(gate, DRIVE_READ)).permission).toBe('allow')
  })
})

describe('the product\'s own tools are left to their own ACL', () => {
  it('a server the host names as its own gets no opinion and no request; any other server with a similar name is still controlled', async () => {
    const gate = await start({ ownServers: ['persona'] })
    gate.arm()
    const own = await ask(gate, { ...SEND, tool_name: 'mcp__persona__create_card', tool_input: { title: 'x' } })
    expect(own.body).toEqual({})
    expect((await ask(gate, { ...SEND, tool_name: 'mcp__personal__send_message' })).permission).toBe('deny')
    expect((await ask(gate, { ...SEND, tool_name: 'mcp__persona2__send_message' })).permission).toBe('deny')
    expect(gate.takeRequests().map(row => row.tool)).toEqual(['mcp__personal__send_message', 'mcp__persona2__send_message'])
  })

  it('without the host naming it, a server called persona is controlled like any other', async () => {
    const gate = await start()
    gate.arm()
    expect((await ask(gate, { ...SEND, tool_name: 'mcp__persona__create_card', tool_input: {} })).permission).toBe('deny')
  })
})

describe('what leaves the gate carries no secret and is bounded', () => {
  it('masks credentials by field name and by shape, and says it did', async () => {
    const gate = await start()
    gate.arm()
    await ask(gate, { ...SEND, tool_input: { to: 'ana@x.com', apiKey: 'abc', note: 'use sk-abcdefghijklmnopqrstuv agora' } })
    const [request] = gate.takeRequests()
    expect(request?.masked).toBe(true)
    expect(JSON.stringify(request)).not.toMatch(/sk-abcdef|"abc"/u)
  })

  it('hashes the COMPLETE input while the preview is cut', async () => {
    const gate = await start()
    gate.arm()
    const long = 'x'.repeat(6000)
    await ask(gate, { ...SEND, tool_input: { to: 'ana@x.com', body: long } })
    const [request] = gate.takeRequests()
    expect(request?.truncated).toBe(true)
    expect(request?.argsHash).toBe(argsHash({ to: 'ana@x.com', body: long }))
    expect(String(request?.requestedInput.body).length).toBeLessThan(long.length)
  })

  it('uses the host\'s own secret detector as well', async () => {
    const gate = await start({ isSecret: value => value.includes('interno-123') })
    gate.arm()
    await ask(gate, { ...SEND, tool_input: { note: 'segredo interno-123' } })
    expect(gate.takeRequests()[0]?.requestedInput.note).toBe('[oculto]')
  })
})

describe('annotationTable: the pre-flight reading of mcp_status', () => {
  it('keys tools by the name the CLI uses and maps readOnly/destructive to hints', () => {
    const lookup = annotationTable([
      { name: 'claude.ai Gmail', tools: [{ name: 'list_threads', annotations: { readOnly: true } }, { name: 'send_message', annotations: {} }, { name: 'purge', annotations: { destructive: true } }] },
      { name: 42 },
      null,
    ])
    expect(lookup('mcp__claude_ai_Gmail__list_threads')).toEqual({ readOnlyHint: true })
    expect(lookup('mcp__claude_ai_Gmail__send_message')).toEqual({})
    expect(lookup('mcp__claude_ai_Gmail__purge')).toEqual({ destructiveHint: true })
    expect(lookup('mcp__other__x')).toBeUndefined()
  })
})

describe('lifecycle', () => {
  it('close is idempotent and stops answering', async () => {
    const gate = await start()
    const url = gate.url
    await gate.close()
    await gate.close()
    await expect(fetch(url, { method: 'POST', headers: { [GATE_TOKEN_HEADER]: 'tok-1' }, body: '{}' })).rejects.toThrow()
  })
})
