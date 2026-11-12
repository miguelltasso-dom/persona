import { describe, expect, it } from 'vitest'
import { ACTION_KINDS, AUTHORITY_KINDS, authorityCell, authorityRow, preAllowAfterOrigin, verdictFor, worstOf, type ActionKind, type AuthorityKind } from '../src/authority/authority-table.ts'
import { CLI_GATES, cliAuthorityReport, gateOf, hasBrowserGate, hasCommandGate, hasDraftWriteGate } from '../src/authority/cli-gates.ts'

describe('the one authority table', () => {
  it('has a verdict for every authority and every kind of action', () => {
    for (const kind of ACTION_KINDS) {
      for (const authority of AUTHORITY_KINDS) expect(['allow', 'ask', 'deny']).toContain(authorityCell(authority, kind))
    }
  })

  it('a person is asked about what leaves, destroys or cannot be read; a routine and an unattended run are never asked: refused', () => {
    for (const kind of ['send', 'delete', 'unknown'] as const) {
      expect(authorityCell('person', kind)).toBe('ask')
      expect(authorityCell('routine', kind)).toBe('deny')
      expect(authorityCell('unattended', kind)).toBe('deny')
    }
  })

  it('nobody — no authority, no card — may write outside the draft, read a secret or run the never list', () => {
    for (const authority of AUTHORITY_KINDS) {
      for (const kind of ['outside-change', 'secret', 'never'] as const) expect(authorityCell(authority, kind)).toBe('deny')
    }
  })

  it('reads and draft changes pass for everyone', () => {
    for (const authority of AUTHORITY_KINDS) {
      expect(authorityCell(authority, 'read')).toBe('allow')
      expect(authorityCell(authority, 'draft-change')).toBe('allow')
    }
  })

  it('no authority is ever asked about something the table refuses for the others: `ask` only exists in the person column', () => {
    for (const kind of ACTION_KINDS) {
      const row = authorityRow(kind)
      for (const authority of AUTHORITY_KINDS) if (authority !== 'person') expect(row[authority]).not.toBe('ask')
    }
  })

  it('the shell grant narrows the table: none runs nothing, read runs only reads, write follows the table', () => {
    for (const authority of AUTHORITY_KINDS) {
      for (const kind of ACTION_KINDS) {
        expect(verdictFor(authority, kind, 'none')).toBe('deny')
        expect(verdictFor(authority, kind, 'read')).toBe(kind === 'read' ? 'allow' : 'deny')
        expect(verdictFor(authority, kind, 'write')).toBe(authorityCell(authority, kind))
      }
    }
  })

  it('the grant never widens the table: a verdict under `write` is never looser than the table for any grant', () => {
    const rank = { allow: 0, ask: 1, deny: 2 } as const
    for (const authority of AUTHORITY_KINDS as readonly AuthorityKind[]) {
      for (const kind of ACTION_KINDS as readonly ActionKind[]) {
        for (const grant of ['none', 'read'] as const) expect(rank[verdictFor(authority, kind, grant)]).toBeGreaterThanOrEqual(rank[authorityCell(authority, kind)])
      }
    }
  })

  it('a command line is as bad as its worst command; nothing read is unproved', () => {
    expect(worstOf(['read', 'draft-change'])).toBe('draft-change')
    expect(worstOf(['read', 'send', 'draft-change'])).toBe('send')
    expect(worstOf(['read', 'never', 'send'])).toBe('never')
    expect(worstOf([])).toBe('unknown')
  })
})

describe('the origin rule: a run started by a received e-mail never sends on its own', () => {
  it('takes `send` out of what may run without asking, and only `send`', () => {
    expect(preAllowAfterOrigin(['read', 'change', 'send'], { viaEmail: true })).toEqual(['read', 'change'])
    expect(preAllowAfterOrigin(['read', 'change', 'send'], { viaEmail: false })).toEqual(['read', 'change', 'send'])
    expect(preAllowAfterOrigin(['read', 'change', 'send'])).toEqual(['read', 'change', 'send'])
    expect(preAllowAfterOrigin([], { viaEmail: true })).toEqual([])
  })

  it('does not mutate the list it is given', () => {
    const given = ['send', 'read'] as const
    preAllowAfterOrigin(given, { viaEmail: true })
    expect(given).toEqual(['send', 'read'])
  })
})

describe('the gate of each CLI (fail closed where nothing is proven)', () => {
  it('Claude has the hook; Codex only the sandbox of the system; OpenCode only a static block; Cursor and unknown CLIs nothing', () => {
    expect(CLI_GATES.claude).toEqual({ commands: 'hook', draftWrites: 'hook', secretReads: 'hook', browser: 'hook' })
    expect(CLI_GATES.codex.commands).toBe('sandbox')
    expect(CLI_GATES.opencode.commands).toBe('static')
    expect(gateOf('cursor')).toEqual({ commands: 'none', draftWrites: 'none', secretReads: 'none', browser: 'none' })
    expect(gateOf('some-new-cli')).toEqual({ commands: 'none', draftWrites: 'none', secretReads: 'none', browser: 'none' })
    expect(hasCommandGate('cursor')).toBe(false)
    expect(hasDraftWriteGate('cursor')).toBe(false)
    expect(hasCommandGate('claude')).toBe(true)
    // The browser of the personas needs the hook: only Claude has it, so the others are 'sem navegador' (explicit, never a silent failure).
    expect(hasBrowserGate('claude')).toBe(true)
    for (const cli of ['codex', 'opencode', 'cursor', 'mystery']) expect(hasBrowserGate(cli)).toBe(false)
  })

  it('the screen line says what an engine cannot hold back, and says nothing on the engine whose gates are all proven', () => {
    expect(cliAuthorityReport('claude').line).toBeUndefined()
    expect(cliAuthorityReport('cursor').line).toMatch(/Cursor ainda não tem a trava/u)
    expect(cliAuthorityReport('codex').line).toMatch(/sem acesso à internet/u)
    expect(cliAuthorityReport('opencode').line).toMatch(/não roda comandos/u)
    expect(cliAuthorityReport('mystery').line).toMatch(/mystery ainda não tem a trava/u)
    for (const cli of ['codex', 'opencode', 'cursor']) expect(cliAuthorityReport(cli).line).toMatch(/O navegador das personas fica só no Claude./u)
    expect(cliAuthorityReport('claude').line).toBeUndefined()
  })
})
