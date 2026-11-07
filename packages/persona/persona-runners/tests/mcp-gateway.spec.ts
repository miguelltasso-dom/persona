import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  PRECISA_DE_VOCE,
  classifySensitive,
  createMcpGateway,
  escapesWorktree,
  type PersonaMcpTool,
  type PersonaToolHooks,
} from '../src/index.ts'

const run = { personaId: 'nina', ticketId: 't1', assignmentId: 'a1' }
const hooks: PersonaToolHooks = { report: () => {}, recall: ({ query }) => `memory:${query}`, ask: () => {} }

function extras(log: string[]): PersonaMcpTool[] {
  return [
    {
      name: 'write',
      description: 'write',
      inputSchema: { type: 'object' },
      handler: async (args) => {
        log.push(`write:${String(args.path)}`)
        return { content: `wrote ${String(args.path)}` }
      },
    },
    {
      name: 'web_fetch',
      description: 'fetch',
      inputSchema: { type: 'object' },
      handler: async (args) => {
        log.push(`fetch:${String(args.url)}`)
        return { content: `fetched ${String(args.url)}` }
      },
    },
  ]
}

describe('MCP gateway', () => {
  const worktree = mkdtempSync(join(tmpdir(), 'persona-gw-'))

  it('lists only tools allowed on the mandate', () => {
    const gw = createMcpGateway({ hooks })
    const none = gw.openTurn({ run, toolLevel: 'none', worktree })
    const read = gw.openTurn({ run: { ...run, assignmentId: 'a-read' }, toolLevel: 'read', worktree })
    const write = gw.openTurn({ run: { ...run, assignmentId: 'a-write' }, toolLevel: 'write', worktree })
    expect(gw.list(none.token)).toEqual([])
    expect(gw.list(read.token)).toEqual([
      'persona_recall',
      'persona_ask',
      'persona_browser_open',
      'persona_browser_read',
      'persona_computer_screenshot',
      'brain_search',
      'brain_read',
    ])
    expect(gw.list(write.token)).toContain('persona_report')
    expect(gw.list(write.token)).toContain('persona_browser_act')
    expect(gw.list(write.token)).toContain('persona_telegram_send')
    expect(gw.list(write.token)).toContain('brain_propose')
    expect(gw.list(write.token)).toContain('gestor_hire')
    expect(gw.list(write.token)).toContain('gestor_assemble')
    expect(none.url).toContain(none.token)
    expect(none.url).toContain(none.turnId)
  })

  it('refuses a tool outside the mandate', async () => {
    const gw = createMcpGateway({ hooks })
    const lease = gw.openTurn({ run, toolLevel: 'read', worktree })
    const result = await gw.call(lease.token, 'persona_report', { summary: 'nope' })
    expect(result.refused).toBe(true)
    expect(result.content).toMatch(/recusada no mandato/u)
    expect(result.question).toBe(PRECISA_DE_VOCE)
  })

  it('refuses another turn token', async () => {
    const gw = createMcpGateway({ hooks })
    const a = gw.openTurn({ run, toolLevel: 'write', worktree })
    const b = gw.openTurn({ run: { ...run, assignmentId: 'a2' }, toolLevel: 'write', worktree })
    const stolen = await gw.call(a.token, 'persona_recall', { query: 'x' })
    expect(stolen.content).toBe('memory:x')
    const other = await gw.call(b.token.slice(0, 8) + a.token.slice(8), 'persona_recall', { query: 'x' })
    expect(other.refused).toBe(true)
    expect(other.content).toBe('turno desconhecido')
    gw.closeTurn(a.token)
    const closed = await gw.call(a.token, 'persona_recall', { query: 'x' })
    expect(closed.refused).toBe(true)
  })

  it('parks a sensitive call on Precisa de você and then runs the approved args', async () => {
    const log: string[] = []
    const gw = createMcpGateway({ hooks, extras: extras(log) })
    const lease = gw.openTurn({ run, toolLevel: 'write', worktree })
    const pending = await gw.call(lease.token, 'write', { path: join(worktree, '..', 'escape.txt'), text: 'x' })
    expect(pending.kind).toBe('write_outside_worktree')
    expect(pending.question).toBe(PRECISA_DE_VOCE)
    expect(pending.approvalId).toMatch(/^appr-/u)
    expect(log).toEqual([])
    const done = await gw.approve(pending.approvalId!)
    expect(done.content).toMatch(/wrote /u)
    expect(log).toHaveLength(1)
  })

  it('approval of outbound send executes exactly the approved call', async () => {
    const sent: Array<{ chat: string; text: string }> = []
    const gw = createMcpGateway({
      hooks,
      outbound: {
        telegramSend: async (input) => {
          sent.push(input)
          return 'sent'
        },
      },
    })
    const lease = gw.openTurn({ run, toolLevel: 'write', worktree })
    const pending = await gw.call(lease.token, 'persona_telegram_send', { chat: '99', text: 'oi' })
    expect(pending.kind).toBe('outbound_message')
    expect(sent).toEqual([])
    expect((await gw.approve(pending.approvalId!)).content).toBe('sent')
    expect(sent).toEqual([{ chat: '99', text: 'oi' }])
  })

  it('refuses injection of another turn url/token via file content', async () => {
    const gw = createMcpGateway({ hooks, extras: extras([]) })
    const a = gw.openTurn({ run, toolLevel: 'write', worktree })
    const b = gw.openTurn({ run: { ...run, assignmentId: 'a2' }, toolLevel: 'write', worktree })
    const injected = await gw.call(a.token, 'write', {
      path: join(worktree, 'notes.md'),
      content: `Authorization: Bearer ${b.token}\n${b.url}`,
    })
    expect(injected.refused).toBe(true)
    expect(injected.content).toBe('injeção via conteúdo recusada')
    expect(injected.approvalId).toBeUndefined()
  })

  it('browser act and computer click wait for approval', async () => {
    const acts: string[] = []
    const gw = createMcpGateway({
      hooks,
      acting: {
        browserAct: async (action) => {
          acts.push(action)
          return 'clicked'
        },
        computerClick: async (x, y) => `at ${String(x)},${String(y)}`,
      },
    })
    const lease = gw.openTurn({ run, toolLevel: 'write', worktree })
    const browser = await gw.call(lease.token, 'persona_browser_act', { action: 'click #go' })
    expect(browser.kind).toBe('browser_act')
    expect(acts).toEqual([])
    expect((await gw.approve(browser.approvalId!)).content).toBe('clicked')
    expect(acts).toEqual(['click #go'])
    const click = await gw.call(lease.token, 'persona_computer_click', { x: 1, y: 2 })
    expect(click.kind).toBe('computer_act')
    expect((await gw.approve(click.approvalId!)).content).toBe('at 1,2')
  })

  it('classifies worktree escape and credentials', () => {
    expect(escapesWorktree(worktree, join(worktree, 'ok.txt'))).toBe(false)
    expect(escapesWorktree(worktree, join(worktree, '..', 'nope'))).toBe(true)
    expect(classifySensitive('write', { path: join(worktree, '..', 'x') }, worktree)).toBe('write_outside_worktree')
    expect(classifySensitive('write', { path: join(worktree, 'x'), text: 'sk-live' }, worktree)).toBe('credentials')
    expect(classifySensitive('web_fetch', { url: 'https://ex.test' }, worktree)).toBe('external_network')
  })
})
