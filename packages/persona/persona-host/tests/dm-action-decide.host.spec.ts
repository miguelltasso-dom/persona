/**
 * Policy (Keel, 12/11 11:42), follow-up of R2-05: a Task born in a DM is its participants'. (1) An ACTION card (a connector e-mail, post, payment) born in a DM is decided ONLY by who is in the DM
 * (the one who asked; the workspace owner when she is in it); the owner who is NOT in the DM reads the neutral card and cannot approve or refuse it ("Esta aprovação é de quem pediu na conversa.").
 * (2) A CONNECTOR card (a persona asks to use a connector) of a Task born in a DM is masked the same way (the reason may quote the DM).
 */
import { describe, expect } from 'vitest'
import { CLOCK, it, openJourney, seedJourney, seedProject } from './journeys/journey-host.ts'

const SECRET = 'FESTA-SURPRESA-JOAO-4821'
const P = { workspaceId: 'ws', projectId: 'sh' } as const

describe('who decides what was born in a private DM (Keel policy 12/11)', () => {
  it('the owner outside the DM reads neutral cards and cannot decide the action; the member who asked in the DM reads and decides it', async () => {
    const h = openJourney()
    seedJourney(h)
    seedProject(h, { id: 'sh', name: 'Loja', team: [{ id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true }, { id: 'bia', name: 'Bia', title: 'Texto' }] })
    h.createMember({ id: 'gus', ...P, displayName: 'Gus', handle: 'gus', role: 'member' })
    h.createDm({ id: 'dm-gus', ...P, participantA: 'gus', participantB: 'guia' })
    h.teamworkEnabled = true
    h.sessionMemberId = 'gus'
    h.postMessage({ id: 'req', ...P, streamKind: 'dm', ownerId: 'dm-gus', body: `preciso do e-mail da ${SECRET}, só entre nós dois`, actorId: 'gus', subjectId: 'req', occurredAt: CLOCK })
    for (let pass = 0; pass < 12; pass += 1) await h.orchestration.flush('sh')
    const task = h.orchestration.runtime('sh').repo.tickets.list().find(row => row.origin.triggerId === 'req')
    expect(task, 'the DM request became a Task').toBeDefined()
    const action = h.externalActions.record({
      projectId: 'sh', personaId: 'bia', ticketId: task!.id, connector: { cli: 'claude', id: 'gmail', name: 'Gmail' }, tool: 'send_email', actionClass: 'send', verb: 'send',
      requestedInput: { to: 'maria@exemplo.com', subject: `Plano ${SECRET}`, body: `Oi Maria, ${SECRET}` }, truncated: false, masked: false, argsHash: 'h-dm-decide', requestedByPerson: true,
    })
    expect(action, 'the e-mail card was opened').toBeDefined()
    h.connectorAsks.open({ id: 'ask-dm', projectId: 'sh', reason: 'initiative', personaId: 'bia', connector: { cli: 'claude', id: 'drive', name: 'Drive' }, taskId: task!.id, taskTitle: task!.title, purpose: `guardar o plano da ${SECRET}` })

    // control: the one who asked reads the real cards and may decide
    h.sessionMemberId = 'gus'
    expect(JSON.stringify(h.listApprovals({ ...P })), 'control: the DM participant reads the cards').toContain(SECRET)

    // the owner of the workspace is NOT in this DM
    h.sessionMemberId = 'ana'
    const asOwner = h.listApprovals({ ...P })
    expect(asOwner.some(card => card.kind === 'action'), 'the action card is listed (neutral)').toBe(true)
    expect(asOwner.some(card => card.kind === 'connector'), 'the connector card is listed (neutral)').toBe(true)
    expect(JSON.stringify(asOwner), 'listApprovals as the owner outside the DM').not.toContain(SECRET) // RED today for the connector card (question/purpose/taskTitle)
    // RED today: the owner approves or refuses what she cannot read
    expect(() => h.decideApproval({ ...P, id: action!.id, kind: 'action', choice: 'cancel' })).toThrow('Esta aprovação é de quem pediu na conversa.')

    // the one who asked decides (today only the workspace owner may: RED for him)
    h.sessionMemberId = 'gus'
    expect(h.decideApproval({ ...P, id: action!.id, kind: 'action', choice: 'cancel' }).status).toBe('rejected')
  })

  it('a card of a Task that was not born in a DM keeps the old rule (only the workspace owner decides an action); and the owner who IS in the DM decides what was born there', async () => {
    const h = openJourney()
    seedJourney(h)
    seedProject(h, { id: 'sh', name: 'Loja', team: [{ id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true }, { id: 'bia', name: 'Bia', title: 'Texto' }] })
    h.createMember({ id: 'gus', ...P, displayName: 'Gus', handle: 'gus', role: 'member' })
    const input = { projectId: 'sh', personaId: 'bia', connector: { cli: 'claude', id: 'gmail', name: 'Gmail' }, tool: 'send_email', actionClass: 'send', verb: 'send', truncated: false, masked: false, requestedByPerson: true } as const
    // a Task of a channel (no DM conversation): the old rule
    const channel = h.externalActions.record({ ...input, ticketId: 'task-de-canal', requestedInput: { to: 'maria@exemplo.com', subject: 'Cardápio', body: 'Segue' }, argsHash: 'h-channel' })
    h.sessionMemberId = 'gus'
    expect(() => h.decideApproval({ ...P, id: channel!.id, kind: 'action', choice: 'cancel' })).toThrow('forbidden')
    h.sessionMemberId = 'ana'
    expect(h.decideApproval({ ...P, id: channel!.id, kind: 'action', choice: 'cancel' }).status).toBe('rejected')

    // a Task born in the DM ana<->guia: the owner is IN it, she decides; the member outside it cannot
    h.createDm({ id: 'dm-guia', ...P, participantA: 'ana', participantB: 'guia' })
    h.teamworkEnabled = true
    h.postMessage({ id: 'req-ana', ...P, streamKind: 'dm', ownerId: 'dm-guia', body: 'preciso de um plano da loja, só entre nós dois', actorId: 'ana', subjectId: 'req-ana', occurredAt: CLOCK })
    for (let pass = 0; pass < 12; pass += 1) await h.orchestration.flush('sh')
    const task = h.orchestration.runtime('sh').repo.tickets.list().find(row => row.origin.triggerId === 'req-ana')
    expect(task, 'the DM request became a Task').toBeDefined()
    const inDm = h.externalActions.record({ ...input, ticketId: task!.id, requestedInput: { to: 'maria@exemplo.com', subject: 'Plano', body: 'Segue' }, argsHash: 'h-in-dm' })
    h.sessionMemberId = 'gus'
    expect(() => h.decideApproval({ ...P, id: inDm!.id, kind: 'action', choice: 'cancel' })).toThrow('Esta aprovação é de quem pediu na conversa.')
    h.sessionMemberId = 'ana'
    expect(h.decideApproval({ ...P, id: inDm!.id, kind: 'action', choice: 'cancel' }).status).toBe('rejected')
  })
})
