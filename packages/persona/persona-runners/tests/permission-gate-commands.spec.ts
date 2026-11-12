/**
 * COLHEITA 8 (Lumen): the Claude hook judges SHELL calls by their text and refuses reads of secret paths, with the verdicts of the one authority table. The gate only ever
 * NARROWS: a call the table allows gets no opinion (the CLI's own tool policy decides whether the tool exists); it never turns a refused tool into an allowed one.
 */
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { GATE_TOKEN_HEADER, PermissionGate } from '../src/resolve/permission-gate.ts'
import { argsHash } from '../src/resolve/tool-input.ts'

let base = ''
let draft = ''
beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), 'persona-gate-commands-'))
  draft = join(base, 'draft')
  mkdirSync(draft, { recursive: true })
})
afterAll(() => { rmSync(base, { recursive: true, force: true }) })

const gates: PermissionGate[] = []
afterEach(async () => { await Promise.all(gates.splice(0).map(async gate => gate.close())) })

async function start(options: { readonly askable?: boolean; readonly annotations?: (tool: string) => { readOnlyHint?: boolean } | undefined } = {}): Promise<PermissionGate> {
  const gate = await PermissionGate.start({ token: 'tok-1', ...options })
  gates.push(gate)
  return gate
}

async function decide(gate: PermissionGate, tool: string, input: Record<string, unknown>, cwd: string = draft): Promise<'allow' | 'deny' | 'no-opinion'> {
  const response = await fetch(gate.url, {
    method: 'POST', headers: { 'content-type': 'application/json', [GATE_TOKEN_HEADER]: 'tok-1' },
    body: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: tool, tool_input: input, tool_use_id: 'tu', cwd }),
  })
  const body = (await response.json()) as { hookSpecificOutput?: { permissionDecision?: 'allow' | 'deny' } }
  return body.hookSpecificOutput?.permissionDecision ?? 'no-opinion'
}

describe('the hook covers the shell and the reads that can reach a secret', () => {
  it('installs on Bash, PowerShell, Read, Grep and Glob next to the MCP tools and the file writers', async () => {
    const gate = await start()
    const settings = gate.settings() as { hooks: { PreToolUse: { matcher: string }[] } }
    const matcher = settings.hooks.PreToolUse[0]?.matcher ?? ''
    for (const tool of ['mcp__.*', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash', 'PowerShell', 'Read', 'Grep', 'Glob']) expect(matcher.split('|')).toContain(tool)
  })
})

describe('a shell call of a person\'s run', () => {
  it('a read or a change inside the draft gets no opinion (the CLI\'s own tool policy decides); the gate never allows a tool by itself', async () => {
    const gate = await start()
    gate.arm({ draftRoot: draft })
    expect(await decide(gate, 'Bash', { command: 'git status' })).toBe('no-opinion')
    expect(await decide(gate, 'Bash', { command: 'mkdir art && echo hi > art/a.txt' })).toBe('no-opinion')
    expect(await decide(gate, 'PowerShell', { command: 'Get-ChildItem -Recurse' })).toBe('no-opinion')
    expect(gate.takeRequests()).toEqual([])
  })

  it('a push waits for the person: denied, recorded for the card with the class, the word and the bounded command', async () => {
    const gate = await start()
    gate.arm({ draftRoot: draft })
    expect(await decide(gate, 'Bash', { command: 'git push origin main', description: 'publish' })).toBe('deny')
    const [request] = gate.takeRequests()
    expect(request).toMatchObject({ tool: 'Bash', actionClass: 'send', verb: 'git push', truncated: false, masked: false })
    expect(request?.requestedInput.command).toBe('git push origin main')
    expect(request?.argsHash).toBe(argsHash({ command: 'git push origin main' }))
  })

  it('an unreadable command also waits (class change); a deletion outside the draft waits (class delete)', async () => {
    const gate = await start()
    gate.arm({ draftRoot: draft })
    expect(await decide(gate, 'Bash', { command: 'node build.js' })).toBe('deny')
    expect(await decide(gate, 'Bash', { command: `rm ${join(base, 'person-file.txt').replace(/\\/gu, '/')}` })).toBe('deny')
    expect(gate.takeRequests().map(item => [item.verb, item.actionClass])).toEqual([['node', 'change'], ['rm', 'delete']])
  })

  it('approve = run again: exactly that command, once; the description the model gives it does not matter; another command does not ride on it', async () => {
    const gate = await start()
    const command = 'git push origin feature'
    gate.arm({ draftRoot: draft, approved: [{ tool: 'Bash', argsHash: argsHash({ command }) }] })
    expect(await decide(gate, 'Bash', { command: 'git push origin other' })).toBe('deny')
    expect(await decide(gate, 'Bash', { command, description: 'reworded by the model', timeout: 5000 })).toBe('allow')
    expect(await decide(gate, 'Bash', { command })).toBe('deny') // spent
    expect(gate.takeReleased()).toEqual([{ tool: 'Bash', argsHash: argsHash({ command }) }])
  })

  it('what no card can lift is refused outright and not recorded: a secret, a write outside the draft, the never list', async () => {
    const gate = await start()
    gate.arm({ draftRoot: draft, approved: [{ tool: 'Bash', argsHash: argsHash({ command: 'cat .env' }) }] })
    expect(await decide(gate, 'Bash', { command: 'cat .env' })).toBe('deny') // an "approval" of a secret read is no approval
    expect(await decide(gate, 'Bash', { command: 'echo x > ../escape.txt' })).toBe('deny')
    expect(await decide(gate, 'Bash', { command: 'sudo rm -rf /' })).toBe('deny')
    expect(gate.takeRequests()).toEqual([])
    expect(gate.takeRefusals().map(item => item.kind)).toEqual(['secret', 'outside-change', 'never'])
    expect(gate.takeRefusals()).toEqual([]) // drained
  })

  it('a call with no command text is refused', async () => {
    const gate = await start()
    gate.arm({ draftRoot: draft })
    expect(await decide(gate, 'Bash', {})).toBe('deny')
  })

  it('outside an armed turn every shell call is refused (a stray background call never rides on the last approval)', async () => {
    const gate = await start()
    expect(await decide(gate, 'Bash', { command: 'ls' })).toBe('deny')
    gate.arm({ draftRoot: draft })
    gate.disarm()
    expect(await decide(gate, 'Bash', { command: 'ls' })).toBe('deny')
  })

  it('`noDraft`: this turn has no draft, so nothing can be changed anywhere (the turn\'s directory is NOT the root); reads still pass', async () => {
    const gate = await start()
    gate.arm({ noDraft: true })
    expect(await decide(gate, 'Bash', { command: 'touch a.txt' }, draft)).toBe('deny')
    expect(await decide(gate, 'Bash', { command: 'git status' }, draft)).toBe('no-opinion')
    expect(await decide(gate, 'Write', { file_path: join(draft, 'a.svg') }, draft)).toBe('deny')
    gate.arm({})
    expect(await decide(gate, 'Write', { file_path: join(draft, 'a.svg') }, draft)).toBe('no-opinion') // not inherited
  })

  it('no draft anywhere: the working directory of the turn is the root', async () => {
    const gate = await start()
    gate.arm({})
    expect(await decide(gate, 'Bash', { command: 'touch a.txt' }, draft)).toBe('no-opinion')
    expect(await decide(gate, 'Bash', { command: 'touch ../a.txt' }, draft)).toBe('deny')
  })
})

describe('the same table for the other authorities and for the persona\'s own shell grant', () => {
  it('a routine and an unattended run are never asked: a push is refused, not recorded', async () => {
    for (const authority of ['routine', 'unattended'] as const) {
      const gate = await start()
      gate.arm({ draftRoot: draft, authority })
      expect(await decide(gate, 'Bash', { command: 'git push origin main' })).toBe('deny')
      expect(await decide(gate, 'Bash', { command: 'git status' })).toBe('no-opinion')
      expect(gate.takeRequests()).toEqual([])
      expect(gate.takeRefusals()).toEqual([{ tool: 'Bash', kind: 'send', verb: 'git push' }])
    }
  })

  it('the authority of one turn is not inherited by the next', async () => {
    const gate = await start()
    gate.arm({ draftRoot: draft, authority: 'routine' })
    gate.arm({ draftRoot: draft })
    expect(await decide(gate, 'Bash', { command: 'git push origin main' })).toBe('deny')
    expect(gate.takeRequests()).toHaveLength(1)
  })

  it('a persona with a read-only shell runs reads only and is never asked for more; with none, nothing runs', async () => {
    const reader = await start()
    reader.configure({ shell: 'read' })
    reader.arm({ draftRoot: draft })
    expect(await decide(reader, 'Bash', { command: 'git log --oneline' })).toBe('no-opinion')
    expect(await decide(reader, 'Bash', { command: 'mkdir x' })).toBe('deny')
    expect(await decide(reader, 'Bash', { command: 'git push origin main' })).toBe('deny')
    expect(reader.takeRequests()).toEqual([])
    const none = await start()
    none.configure({ shell: 'none' })
    none.arm({ draftRoot: draft })
    expect(await decide(none, 'Bash', { command: 'git status' })).toBe('deny')
  })

  it('a gate with no card to show (the runner\'s own gate) refuses what would be asked instead of recording it', async () => {
    const gate = await start({ askable: false })
    gate.arm({ draftRoot: draft })
    expect(await decide(gate, 'Bash', { command: 'git push origin main' })).toBe('deny')
    expect(gate.takeRequests()).toEqual([])
    expect(gate.takeRefusals()).toEqual([{ tool: 'Bash', kind: 'send', verb: 'git push' }])
    expect(gate.pending()).toBe(0) // the turn is not reported "blocked, waiting for an approval" that nobody can give
  })
})

describe('a run started by a received e-mail never sends on its own (Keel, item 8 + conectores)', () => {
  const send = 'mcp__gmail__send_email'
  const read = 'mcp__gmail__list_labels'
  const input = { to: 'cliente@example.com', body: 'Segue o orçamento.' }

  it('with `send` pre-allowed by the persona\'s standing permission, an ordinary run sends; a run started by an e-mail is held for the card', async () => {
    const ordinary = await start()
    ordinary.arm({ preAllow: ['read', 'send'] })
    expect(await decide(ordinary, send, input)).toBe('allow')
    const fromEmail = await start({ annotations: tool => (tool === read ? { readOnlyHint: true } : undefined) })
    fromEmail.arm({ preAllow: ['read', 'send'], viaEmail: true })
    expect(await decide(fromEmail, read, {})).toBe('allow') // looking stays free
    expect(await decide(fromEmail, send, input)).toBe('deny')
    expect(fromEmail.takeRequests().map(item => [item.tool, item.actionClass])).toEqual([[send, 'send']])
  })

  it('only the person\'s decision lets it through: the exact call, once', async () => {
    const gate = await start()
    gate.arm({ preAllow: ['read', 'send'], viaEmail: true, approved: [{ tool: send, argsHash: argsHash(input) }] })
    expect(await decide(gate, send, { ...input, body: 'Outro texto.' })).toBe('deny')
    expect(await decide(gate, send, input)).toBe('allow')
    expect(await decide(gate, send, input)).toBe('deny')
    expect(gate.takeReleased()).toEqual([{ tool: send, argsHash: argsHash(input) }])
  })

  it('the origin is not inherited by the next turn', async () => {
    const gate = await start()
    gate.arm({ preAllow: ['send'], viaEmail: true })
    expect(await decide(gate, send, input)).toBe('deny')
    gate.arm({ preAllow: ['send'] })
    expect(await decide(gate, send, input)).toBe('allow')
  })

  it('Keel 12/11: the standing waiver sends in a person\'s turn and in a routine the owner scheduled, never in an unattended run (initiative, plan, external event): that one waits for the card', async () => {
    const gate = await start()
    gate.arm({ preAllow: ['send'], authority: 'person' })
    expect(await decide(gate, send, input)).toBe('allow')
    gate.arm({ preAllow: ['send'], authority: 'routine' })
    expect(await decide(gate, send, input)).toBe('allow') // the owner scheduled it: the waiver is her explicit consent
    gate.arm({ preAllow: ['send'], authority: 'unattended' })
    expect(await decide(gate, send, input)).toBe('deny')
    expect(gate.takeRequests().map(item => [item.tool, item.actionClass])).toEqual([[send, 'send']]) // the person's card decides
  })
})

describe('reading a secret', () => {
  it('Read, Grep and Glob of a credentials path are refused, armed or not; any other read gets no opinion', async () => {
    const gate = await start()
    expect(await decide(gate, 'Read', { file_path: 'C:\\Users\\x\\.ssh\\id_rsa' })).toBe('deny')
    expect(await decide(gate, 'Read', { file_path: join(draft, 'notes.md') })).toBe('no-opinion')
    gate.arm({ draftRoot: draft })
    expect(await decide(gate, 'Grep', { pattern: 'token', path: '/home/x/.aws' })).toBe('deny')
    expect(await decide(gate, 'Glob', { pattern: '*.md', path: draft })).toBe('no-opinion')
    expect(await decide(gate, 'Read', { file_path: join(draft, '.env') })).toBe('deny')
    expect(gate.takeRefusals().map(item => item.kind)).toEqual(['secret', 'secret']) // the unarmed refusal belongs to no turn: `arm` cleared it
  })
})

describe('Carbon P1-01: a call the gate refused is on record, so the host never takes it for proof', () => {
  it('a file write outside the draft (or with nothing to judge) is listed in the turn\'s refusals; the one inside the draft is not', async () => {
    const gate = await start()
    gate.arm({ draftRoot: draft })
    expect(await decide(gate, 'Write', { file_path: join(draft, 'a.svg') })).toBe('no-opinion')
    expect(gate.takeRefusals()).toEqual([])
    expect(await decide(gate, 'Write', { file_path: join(base, 'outside.svg') })).toBe('deny')
    expect(await decide(gate, 'Edit', { file_path: join(base, 'outside.txt') })).toBe('deny')
    expect(gate.takeRefusals().map(item => `${item.tool}:${item.kind}`)).toEqual(['Write:file', 'Edit:file'])
    expect(gate.takeRefusals()).toEqual([]) // drained
  })
})

describe('what was already true stays true', () => {
  it('a file write outside the draft is still denied, inside it still has no opinion, and the MCP mandate still holds', async () => {
    const gate = await start()
    gate.arm({ draftRoot: draft, allowedServers: [] })
    expect(await decide(gate, 'Write', { file_path: join(draft, 'a.svg') })).toBe('no-opinion')
    expect(await decide(gate, 'Write', { file_path: join(base, 'outside.svg') })).toBe('deny')
    expect(await decide(gate, 'mcp__gmail__list_labels', {})).toBe('deny')
  })
})
