/**
 * R2-05 (Carbon review 2, Lumen RED): two Task surfaces that never got the rule "a Task born in a DM is its participants' (the others read the neutral title)" of listTasks / getProjectBoard /
 * getTurnContext / getWhileAway: the approvals inbox (listApprovals: an open question becomes a card with the Task title) and the canvas (listCanvas: every Task is a node labelled with its title).
 * A DM-born Task title IS the person words. Same rig as persona-e2e/tests/regressao-dm-nao-vaza-superficies-2.spec.ts.
 */
import { describe, expect } from 'vitest'
import { CLOCK, it, openJourney, seedJourney, seedProject } from './journeys/journey-host.ts'

const SECRET = 'FESTA-SURPRESA-JOAO-4821'
const P = { workspaceId: 'ws', projectId: 'sh' } as const

describe('R2-05 Tasks born in a private DM do not show their title on the approvals inbox or the canvas', () => {
  it('Gus (member outside the DM ana<->guia) reads the secret in neither listApprovals nor listCanvas', async () => {
    const h = openJourney()
    seedJourney(h)
    seedProject(h, { id: 'sh', name: 'Loja', team: [{ id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true }, { id: 'bia', name: 'Bia', title: 'Texto' }] })
    h.createMember({ id: 'gus', ...P, displayName: 'Gus', handle: 'gus', role: 'member' })
    h.createDm({ id: 'dm-guia', ...P, participantA: 'ana', participantB: 'guia' })
    h.teamworkEnabled = true
    h.postMessage({ id: 'req', ...P, streamKind: 'dm', ownerId: 'dm-guia', body: `preciso de um plano da ${SECRET}, só entre nós dois`, actorId: 'ana', subjectId: 'req', occurredAt: CLOCK })
    for (let pass = 0; pass < 12; pass += 1) await h.orchestration.flush('sh')

    // control: the Task exists and the owner (participant) sees the words on the canvas
    const tickets = h.orchestration.runtime('sh').repo.tickets.list()
    expect(tickets.length, 'the DM request became a Task').toBeGreaterThan(0)
    // the Task waits for the person (an open question): that is what puts a card on the approvals inbox
    const dmTask = tickets.find(row => row.origin.triggerId === 'req') ?? tickets[0]!
    h.orchestration.runtime('sh').engine.report(dmTask.id, { state: 'waiting', summary: 'Esperando você', question: 'Posso seguir?' })
    expect(JSON.stringify(h.listCanvas({ ...P }))).toContain(SECRET)
    expect(JSON.stringify(h.listApprovals({ ...P })), 'control: the owner reads the Task that waits for her on the approvals inbox').toContain(SECRET)
    expect(JSON.stringify(h.getOverviewNow({ ...P })), 'control: the owner reads what her team is on, on the Visão geral').toContain(SECRET)
    // the Task drafted an e-mail from the DM: its card on the inbox shows the REAL content (to, subject, body)
    h.externalActions.record({
      projectId: 'sh', personaId: 'bia', ticketId: dmTask.id, connector: { cli: 'claude', id: 'gmail', name: 'Gmail' }, tool: 'send_email', actionClass: 'send', verb: 'send',
      requestedInput: { to: 'maria@exemplo.com', subject: `Plano ${SECRET}`, body: `Oi Maria, ${SECRET}` }, truncated: false, masked: false, argsHash: 'h-r2-05', requestedByPerson: true,
    })
    expect(JSON.stringify(h.listApprovals({ ...P }).filter(card => card.kind === 'action')), 'control: the owner reads the e-mail of her own Task on the approvals inbox').toContain(SECRET)

    h.sessionMemberId = 'gus'
    expect(JSON.stringify(h.listCanvas({ ...P })), 'listCanvas').not.toContain(SECRET)
    expect(JSON.stringify(h.listApprovals({ ...P })), 'listApprovals').not.toContain(SECRET)
    expect(JSON.stringify(h.getOverviewNow({ ...P })), 'getOverviewNow (currentTask)').not.toContain(SECRET)
    expect(JSON.stringify(h.listApprovals({ ...P }).filter(card => card.kind === 'action')), 'listApprovals (action card of a DM Task: to, subject, body)').not.toContain(SECRET)
  })
})
