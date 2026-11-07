import { describe, expect, it } from 'vitest'
import { createMcpGateway, openTurnTools, type PendingApproval } from '../src/index.ts'

const run = { personaId: 'nina', ticketId: 't-1', assignmentId: 'a-1' }

function gatewayWith(extra: { approvals?: PendingApproval[]; wired?: boolean } = {}) {
  const reports: string[] = []
  const gateway = createMcpGateway({
    hooks: {
      report: ({ summary }) => { reports.push(summary) },
      recall: ({ query }) => `memória sobre ${query}`,
      ask: () => undefined,
    },
    onlyWired: extra.wired ?? true,
    ...(extra.approvals === undefined ? {} : { onApproval: (approval: PendingApproval) => { extra.approvals?.push(approval) } }),
  })
  return { gateway, reports }
}

describe('HT-0: the gateway lease of one turn, as the tools a CLI may call', () => {
  it('offers exactly what the grant allows, with the schemas the CLI lists', () => {
    const { gateway } = gatewayWith()
    const read = openTurnTools(gateway, { run, toolLevel: 'read', worktree: 'C:/tmp/t-1' })
    const write = openTurnTools(gateway, { run: { ...run, assignmentId: 'a-2' }, toolLevel: 'write', worktree: 'C:/tmp/t-1' })
    // asking the person a question writes nothing into the world: it is available at the read grant (the host caps it per task)
    expect(read?.tools.map(tool => tool.name)).toEqual(['persona_recall', 'persona_ask'])
    expect(write?.tools.map(tool => tool.name).sort()).toEqual(['persona_ask', 'persona_recall', 'persona_report'])
    expect(read?.server).toBe('persona')
    expect(read?.tools[0]).toMatchObject({ description: expect.any(String), inputSchema: { type: 'object' } })
    expect(gateway.describe('not-a-token')).toEqual([])
  })

  it('does not announce a tool whose host port is not wired (the model would plan around a capability that is not there)', () => {
    const open = gatewayWith({ wired: false })
    const all = openTurnTools(open.gateway, { run, toolLevel: 'read', worktree: 'C:/tmp/t-1' })!
    expect(all.tools.map(tool => tool.name)).toContain('brain_search')
    const wired = gatewayWith()
    const some = openTurnTools(wired.gateway, { run, toolLevel: 'read', worktree: 'C:/tmp/t-1' })!
    expect(some.tools.map(tool => tool.name)).toEqual(['persona_recall', 'persona_ask'])
  })

  it('offers nothing (and holds no lease) when the grant leaves no tool', () => {
    const { gateway } = gatewayWith()
    expect(openTurnTools(gateway, { run, toolLevel: 'none', worktree: 'C:/tmp/t-1' })).toBeUndefined()
  })

  it('runs a read tool through the gateway as the turn, and a forged identity in the arguments is refused', async () => {
    const { gateway, reports } = gatewayWith()
    const set = openTurnTools(gateway, { run, toolLevel: 'write', worktree: 'C:/tmp/t-1' })!
    const recall = set.tools.find(tool => tool.name === 'persona_recall')!
    expect(await recall.handler({ query: 'entrega' })).toEqual({ content: 'memória sobre entrega' })
    const report = set.tools.find(tool => tool.name === 'persona_report')!
    expect(await report.handler({ state: 'progress', summary: 'feito' })).toEqual({ content: 'reported' })
    expect(reports).toEqual(['feito'])
    // The gateway keeps identity = the turn: a forged ticket in the arguments does not act as another ticket.
    expect(await report.handler({ summary: 'outra', ticketId: 't-OUTRO' })).toEqual({ content: 'forged actor refused' })
    expect(reports).toEqual(['feito'])
  })

  it('a tool above the grant is not callable even by name (refused as an error result)', async () => {
    const { gateway } = gatewayWith()
    const set = openTurnTools(gateway, { run, toolLevel: 'read', worktree: 'C:/tmp/t-1' })!
    expect(set.tools.map(tool => tool.name)).not.toContain('persona_report')
    // Forge a handler for a tool this lease never announced: the gateway refuses it.
    const lease = gateway.openTurn({ run: { ...run, assignmentId: 'a-9' }, toolLevel: 'read', worktree: 'C:/tmp/t-1' })
    const refused = await gateway.call(lease.token, 'persona_report', { summary: 'x' })
    expect(refused.refused).toBe(true)
  })

  it('a sensitive call pauses for the person (host notified) and tells the model not to retry', async () => {
    const approvals: PendingApproval[] = []
    const set = openTurnTools(
      createMcpGateway({
        hooks: { report: () => undefined, recall: () => 'x', ask: () => undefined },
        outbound: { emailSend: async () => 'sent' },
        onlyWired: true,
        onApproval: (approval) => { approvals.push(approval) },
      }),
      { run, toolLevel: 'write', worktree: 'C:/tmp/t-1' },
    )!
    const send = set.tools.find(tool => tool.name === 'persona_email_send')!
    const outcome = await send.handler({ to: 'a@b.c' })
    expect(outcome.isError).toBeUndefined()
    expect(outcome.content).toMatch(/Aprovação pedida: outbound_message/u)
    expect(outcome.content).toMatch(/espera a decisão da pessoa/u)
    expect(approvals).toHaveLength(1)
    expect(approvals[0]).toMatchObject({ name: 'persona_email_send', kind: 'outbound_message' })
  })

  it('close releases the lease: the same tool is refused afterwards', async () => {
    const { gateway } = gatewayWith()
    const set = openTurnTools(gateway, { run, toolLevel: 'read', worktree: 'C:/tmp/t-1' })!
    const recall = set.tools[0]!
    expect((await recall.handler({ query: 'a' })).isError).toBeUndefined()
    await set.close?.()
    expect(await recall.handler({ query: 'b' })).toMatchObject({ isError: true, content: expect.stringContaining('turno desconhecido') })
  })
})
