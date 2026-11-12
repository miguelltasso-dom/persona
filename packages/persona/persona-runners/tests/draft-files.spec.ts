/**
 * P0-1 "a arte vira arquivo" (runners side). A persona born with `tools: {}` is text-only on purpose; to let one SAVE a file in the draft of its Task (and nothing else) the pieces are:
 * the CLI policy (Edit/Write offered, Bash/PowerShell not), the gateway level of the Persona's own tools (must NOT rise with `files: write`) and the gate's path check (a write
 * outside the draft is denied). These are the acceptance guards: text-only stays text-only; a write outside the draft is DENIED; a shell is DENIED; the gateway level does not rise.
 */
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cliPolicyOf } from '../src/resolve/cli-policy.ts'
import { insideRoot } from '../src/resolve/draft-path.ts'
import { GATE_TOKEN_HEADER, PermissionGate } from '../src/resolve/permission-gate.ts'
import { classifyToolAccess, effectiveToolLevel, gatewayToolLevel } from '../src/resolve/tool-level.ts'

describe('the CLI policy: who may touch files and who may run commands', () => {
  it('a text-only persona (tools {}) stays text-only: no built-in tool at all', () => {
    const policy = cliPolicyOf('claude', {}, 'deny')
    expect(policy.launchArgs).toEqual(['--permission-mode', 'dontAsk', '--permission-prompts', 'none', '--tools', ''])
    expect(policy.toolLevel).toBe('none')
    for (const name of ['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Bash', 'PowerShell']) expect(policy.disallowedTools).toContain(name)
  })

  it('files: write (no shell) in a Task: Edit/Write are offered and edits are accepted; Bash, PowerShell and the web are NOT', () => {
    const policy = cliPolicyOf('claude', { files: 'write' }, 'allow-once')
    // exactly the built-in tools of the grant (no sub-agents, skills, workflows or scheduled wake-ups), plus the schema lookup connectors need
    expect(policy.launchArgs).toEqual(['--permission-mode', 'acceptEdits', '--tools', 'Read,Glob,Grep,Edit,Write,MultiEdit,NotebookEdit,ToolSearch'])
    expect(cliPolicyOf('claude', { files: 'write', web: 'read' }, 'allow-once').launchArgs).toEqual(['--permission-mode', 'acceptEdits', '--tools', 'Read,Glob,Grep,Edit,Write,MultiEdit,NotebookEdit,ToolSearch,WebFetch,WebSearch'])
    for (const name of ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']) expect(policy.disallowedTools).not.toContain(name)
    for (const name of ['Bash', 'PowerShell', 'WebFetch', 'WebSearch']) expect(policy.disallowedTools).toContain(name)
  })

  it('a shell grant keeps the CLI default tool set as before (no allow-list is invented for it)', () => {
    expect(cliPolicyOf('claude', { files: 'write', shell: 'write' }, 'allow-once').launchArgs).toEqual(['--permission-mode', 'acceptEdits'])
    expect(cliPolicyOf('claude', { files: 'read' }, 'allow-once').launchArgs).toEqual(['--permission-mode', 'dontAsk'])
  })

  it('a shell is only open with a shell grant, and then both command tools are', () => {
    expect(cliPolicyOf('claude', { files: 'write', shell: 'write' }, 'allow-once').disallowedTools).not.toEqual(expect.arrayContaining(['Bash']))
    const none = cliPolicyOf('claude', { files: 'write', shell: 'none' }, 'allow-once').disallowedTools
    expect(none).toEqual(expect.arrayContaining(['Bash', 'PowerShell']))
    expect(classifyToolAccess('PowerShell')).toBe('write')
  })
})

describe('the gateway level (the Persona\'s own tools) does not rise with the right to save files', () => {
  it('files: write alone leaves the gateway at none (coordination only) while the native level is write', () => {
    expect(effectiveToolLevel({ files: 'write' })).toBe('write')
    expect(gatewayToolLevel({ files: 'write' })).toBe('none')
    expect(gatewayToolLevel({ files: 'write', write: 'write', edit: 'write' })).toBe('none')
    expect(gatewayToolLevel({})).toBe('none')
  })

  it('any other grant still counts: shell/web/the Persona\'s own tools raise it as before', () => {
    expect(gatewayToolLevel({ files: 'write', shell: 'read' })).toBe('read')
    expect(gatewayToolLevel({ files: 'read', web: 'write' })).toBe('write')
    expect(gatewayToolLevel({ board: 'write' })).toBe('write')
  })
})

describe('insideRoot: a path is inside the draft only when it really is', () => {
  const dirs: string[] = []
  afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })
  const scratch = (): { root: string; outside: string } => {
    const base = mkdtempSync(join(tmpdir(), 'draft-'))
    dirs.push(base)
    const root = join(base, 'rascunho')
    const outside = join(base, 'pasta-real')
    mkdirSync(root)
    mkdirSync(outside)
    return { root, outside }
  }

  it('a file in the draft, a new subfolder in it and a relative path read from the working directory are inside', () => {
    const { root } = scratch()
    expect(insideRoot(root, join(root, 'cartaz.svg'))).toBe(true)
    expect(insideRoot(root, join(root, 'arte', 'v2', 'cartaz.svg'))).toBe(true)
    expect(insideRoot(root, 'cartaz.svg', root)).toBe(true)
    expect(insideRoot(root, root)).toBe(true)
  })

  it('`..`, a sibling folder, the real folder and another drive are outside', () => {
    const { root, outside } = scratch()
    expect(insideRoot(root, join(root, '..', 'pasta-real', 'cartaz.svg'))).toBe(false)
    expect(insideRoot(root, '../pasta-real/cartaz.svg', root)).toBe(false)
    expect(insideRoot(root, join(outside, 'cartaz.svg'))).toBe(false)
    expect(insideRoot(root, `${root}-irmao`)).toBe(false) // same prefix, different folder
    if (process.platform === 'win32') expect(insideRoot(root, 'Z:\\cartaz.svg')).toBe(false)
  })

  it('a symlink/junction inside the draft that points OUT of it does not let a write through', () => {
    const { root, outside } = scratch()
    try { symlinkSync(outside, join(root, 'atalho'), 'junction') } catch { return } // a platform that cannot link: nothing to prove here
    expect(insideRoot(root, join(root, 'atalho', 'cartaz.svg'))).toBe(false)
  })
})

describe('the gate keeps file-writing tools inside the draft (real HTTP, what the CLI posts)', () => {
  const gates: PermissionGate[] = []
  const dirs: string[] = []
  afterEach(async () => {
    await Promise.all(gates.splice(0).map(async gate => gate.close()))
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })
  async function armed(arming: Parameters<PermissionGate['arm']>[0]): Promise<{ gate: PermissionGate; root: string; outside: string }> {
    const base = mkdtempSync(join(tmpdir(), 'gate-draft-'))
    dirs.push(base)
    const root = join(base, 'rascunho')
    const outside = join(base, 'pasta-real')
    mkdirSync(root)
    mkdirSync(outside)
    const gate = await PermissionGate.start({ token: 'tok-1' })
    gates.push(gate)
    gate.arm(arming)
    return { gate, root, outside }
  }
  async function permission(gate: PermissionGate, tool: string, input: unknown, cwd?: string): Promise<string | undefined> {
    const response = await fetch(gate.url, {
      method: 'POST', headers: { 'content-type': 'application/json', [GATE_TOKEN_HEADER]: 'tok-1' },
      body: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: tool, tool_input: input, ...(cwd === undefined ? {} : { cwd }) }),
    })
    const body = (await response.json()) as { hookSpecificOutput?: { permissionDecision?: string } }
    return body.hookSpecificOutput?.permissionDecision
  }

  it('Write/Edit/MultiEdit/NotebookEdit inside the armed draft: the gate gives no opinion (the CLI\'s own mode decides)', async () => {
    const base = mkdtempSync(join(tmpdir(), 'gate-draft-'))
    dirs.push(base)
    const root = join(base, 'rascunho')
    mkdirSync(root)
    const gate = await PermissionGate.start({ token: 'tok-1' })
    gates.push(gate)
    gate.arm({ draftRoot: root })
    expect(await permission(gate, 'Write', { file_path: join(root, 'cartaz.svg'), content: '<svg/>' }, root)).toBeUndefined()
    expect(await permission(gate, 'Edit', { file_path: 'cartaz.svg', old_string: 'a', new_string: 'b' }, root)).toBeUndefined()
    expect(await permission(gate, 'MultiEdit', { file_path: join(root, 'a', 'b.txt'), edits: [] }, root)).toBeUndefined()
    expect(await permission(gate, 'NotebookEdit', { notebook_path: join(root, 'n.ipynb') }, root)).toBeUndefined()
  })

  it('a write OUTSIDE the draft is DENIED (the real folder, `..`, an absolute path elsewhere), and so is a call with no path to judge', async () => {
    const base = mkdtempSync(join(tmpdir(), 'gate-draft-'))
    dirs.push(base)
    const root = join(base, 'rascunho')
    const outside = join(base, 'pasta-real')
    mkdirSync(root)
    mkdirSync(outside)
    const gate = await PermissionGate.start({ token: 'tok-1' })
    gates.push(gate)
    gate.arm({ draftRoot: root })
    expect(await permission(gate, 'Write', { file_path: join(outside, 'cartaz.svg'), content: 'x' }, root)).toBe('deny')
    expect(await permission(gate, 'Write', { file_path: '../pasta-real/cartaz.svg', content: 'x' }, root)).toBe('deny')
    expect(await permission(gate, 'Edit', { file_path: join(root, '..', 'pasta-real', 'a.txt'), old_string: 'a', new_string: 'b' }, root)).toBe('deny')
    expect(await permission(gate, 'Write', { content: 'no path' }, root)).toBe('deny')
    expect(await permission(gate, 'Write', 'not an object', root)).toBe('deny')
  })

  it('without an armed draft the root is the turn\'s working directory; outside an armed turn every write is denied', async () => {
    const { gate, root, outside } = await armed({})
    expect(await permission(gate, 'Write', { file_path: join(root, 'a.svg') }, root)).toBeUndefined()
    expect(await permission(gate, 'Write', { file_path: join(outside, 'a.svg') }, root)).toBe('deny')
    expect(await permission(gate, 'Write', { file_path: join(root, 'a.svg') })).toBe('deny') // no cwd and no draft: nothing to judge against
    gate.disarm()
    expect(await permission(gate, 'Write', { file_path: join(root, 'a.svg') }, root)).toBe('deny')
  })

  it('the gate gives no opinion on the other built-in tools, and on a shell call that the authority table allows (COLHEITA 8: the shell is judged now; see permission-gate-commands.spec)', async () => {
    const { gate, root } = await armed({})
    for (const tool of ['Read', 'Glob', 'Grep', 'WebFetch']) expect(await permission(gate, tool, { command: 'x' }, root)).toBeUndefined()
    for (const tool of ['Bash', 'PowerShell']) expect(await permission(gate, tool, { command: 'ls' }, root)).toBeUndefined()
    // what the table does not allow is not "no opinion" any more: a shell call it cannot read waits, it never rides on the persona's tool policy alone
    expect(await permission(gate, 'Bash', { command: 'x' }, root)).toBe('deny')
  })
})
