/**
 * R2-06 (Carbon review 2, Lumen): the mask that hides a DM-born Task's title from whoever is not in the DM asked WHERE the Task was born by reading the stored Trigger's channel and, with none,
 * fell back to `channel:geral` — so a Task whose Trigger row is missing was read as a #geral Task and showed the person's words to everyone (the mask failed OPEN). No path of today deletes a
 * Trigger and every message-born one stores its channel (`orchestration.ts` ~4429), so this is defence in depth: the message the Task came from still knows its stream, and that decides.
 * RED first (the Trigger is made to disappear, as a restored backup or a future cleanup could).
 */
import { describe, expect } from 'vitest'
import { CLOCK, it, openJourney, seedJourney, seedProject } from './journeys/journey-host.ts'

const SECRET = 'FESTA-SURPRESA-JOAO-4821'
const P = { workspaceId: 'ws', projectId: 'sh' } as const

describe('R2-06 a DM-born Task whose Trigger row is gone is still a private Task', () => {
  it('Gus (member outside the DM ana<->guia) reads the neutral title, not the words, when the Trigger is missing', async () => {
    const h = openJourney()
    seedJourney(h)
    seedProject(h, { id: 'sh', name: 'Loja', team: [{ id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true }, { id: 'bia', name: 'Bia', title: 'Texto' }] })
    h.createMember({ id: 'gus', ...P, displayName: 'Gus', handle: 'gus', role: 'member' })
    h.createDm({ id: 'dm-guia', ...P, participantA: 'ana', participantB: 'guia' })
    h.teamworkEnabled = true
    h.postMessage({ id: 'req', ...P, streamKind: 'dm', ownerId: 'dm-guia', body: `preciso de um plano da ${SECRET}, só entre nós dois`, actorId: 'ana', subjectId: 'req', occurredAt: CLOCK })
    for (let pass = 0; pass < 12; pass += 1) await h.orchestration.flush('sh')
    const rt = h.orchestration.runtime('sh')
    const task = rt.repo.tickets.list().find(row => row.origin.triggerId === 'req') ?? rt.repo.tickets.list()[0]!

    // control: with the Trigger in place the participant reads the words and the outsider reads the neutral title
    expect(JSON.stringify(h.listTasks({ ...P }))).toContain(SECRET)
    h.sessionMemberId = 'gus'
    expect(JSON.stringify(h.listTasks({ ...P }))).not.toContain(SECRET)

    // the Trigger row disappears (a restored backup, a future cleanup): the message the Task came from is still in the event store
    const triggers = rt.repo.triggers as unknown as { get: (id: string) => unknown }
    const original = triggers.get.bind(triggers)
    triggers.get = (id: string) => (id === task.origin.triggerId ? undefined : original(id))
    expect(rt.repo.triggers.get(task.origin.triggerId)).toBeUndefined()
    expect(JSON.stringify(h.listTasks({ ...P })), 'listTasks (Gus, Trigger gone)').not.toContain(SECRET)
    expect(JSON.stringify(h.listCanvas({ ...P })), 'listCanvas (Gus, Trigger gone)').not.toContain(SECRET)

    // and the participant still reads her own Task (the fallback is the message's stream, not "hide everything")
    h.sessionMemberId = 'ana'
    expect(JSON.stringify(h.listTasks({ ...P }))).toContain(SECRET)
  })

  it('a Task that was never born from a message (no Trigger, no event) is still read as a project Task, never hidden from everyone', async () => {
    const h = openJourney()
    seedJourney(h)
    seedProject(h, { id: 'sh', name: 'Loja', team: [{ id: 'bia', name: 'Bia', title: 'Texto' }] })
    h.teamworkEnabled = true
    h.postMessage({ id: 'ch1', ...P, streamKind: 'channel', ownerId: 'geral:sh', body: `@Bia escreva o cartaz da ${SECRET}`, actorId: 'ana', subjectId: 'ch1', occurredAt: CLOCK })
    for (let pass = 0; pass < 12; pass += 1) await h.orchestration.flush('sh')
    const rt = h.orchestration.runtime('sh')
    const triggers = rt.repo.triggers as unknown as { get: (id: string) => unknown }
    const original = triggers.get.bind(triggers)
    triggers.get = (id: string) => (id === 'ch1' ? undefined : original(id))
    h.sessionMemberId = 'ana'
    expect(JSON.stringify(h.listTasks({ ...P })), 'a channel Task whose Trigger is gone stays visible to the project').toContain(SECRET)
  })
})
