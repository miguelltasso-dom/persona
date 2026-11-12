/**
 * Lumen's internal review, R2-01/02/03 (12/11): the conversation a request names was never bound to the project the request names, and a DM that was still empty had no ACL at all.
 *  - R2-03: `EventRepos` lets any workspace member read any channel stream, and the host only validated the project IN THE REQUEST. A member of the shared project `sh` asked for
 *    `projectId: 'sh'` with `ownerId: 'geral'` (the id of the owner's "Pessoal" #geral, predictable) and read the owner's notes. Same shape in `listMessages`, `followMessages`, `listPinned`.
 *  - R2-02: `followMessages` on a DM whose stream has no row yet passed (the empty page came before the ACL) and then received every line written later.
 *  - R2-01: `listPinned` only called `requireProject`: the pinned lines of a DM he is not in left to any member.
 * Rule now: the conversation must belong to the project of the request, and a DM opens only to its two participants — at open, on every page and before every frame of a stream.
 * (REDs: `.maestri/tmp/lumen/review2/R2-0{1,2,3}.red.spec.ts`.)
 */
import { describe, expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { CLOCK, it, openJourney, say, seedJourney, seedProject } from './journeys/journey-host.ts'

const SECRET = 'NOTA-PESSOAL-DA-ANA-7731'
const DM_SECRET = 'FESTA-SURPRESA-JOAO-4821'
const SH = { workspaceId: 'ws', projectId: 'sh' } as const
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

/** The owner's Pessoal (`pp`, #geral = `geral`) and a shared project `sh` where Gus is a plain member. */
function rig(): PersonaHost {
  const h = openJourney()
  seedJourney(h, [])
  seedProject(h, { id: 'sh', name: 'Loja', team: [{ id: 'bia', name: 'Bia', title: 'Texto' }] })
  h.createMember({ id: 'gus', ...SH, displayName: 'Gus', handle: 'gus', role: 'member' })
  return h
}

function followAs(h: PersonaHost, member: string, request: { projectId: string; streamKind: 'channel' | 'dm'; ownerId: string }) {
  h.sessionMemberId = member
  const abort = new AbortController()
  const frames: string[] = []
  const end: { error?: unknown; done: boolean } = { done: false }
  const reading = (async () => {
    try {
      for await (const frame of h.followMessages({ workspaceId: 'ws', ...request, actorId: member, afterSeq: 0, limit: 50 }, abort.signal)) frames.push(JSON.stringify(frame))
    } catch (error) {
      end.error = error
    } finally {
      end.done = true
    }
  })()
  return { frames, end, stop: async () => { abort.abort(); await reading } }
}

describe('R2-03: a channel of a project the member cannot read is not read through another project id', () => {
  it('listMessages: Gus asks projectId=sh (his) with ownerId=geral (the owner\'s Pessoal #geral) and reads nothing', () => {
    const h = rig()
    say(h, 'p1', SECRET) // the owner writes in Pessoal, where Gus has no access
    h.sessionMemberId = 'gus'
    const own = h.listMessages({ workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral', actorId: 'gus', afterSeq: 0, limit: 50 }) // control: by its own project id
    expect(own.events).toEqual([])
    const bypass = h.listMessages({ ...SH, streamKind: 'channel', ownerId: 'geral', actorId: 'gus', afterSeq: 0, limit: 50 })
    expect(JSON.stringify(bypass.events)).not.toContain(SECRET)
  })

  it('followMessages: the same bypass on a stream is refused, and nothing written later reaches him either', async () => {
    const h = rig()
    const follow = followAs(h, 'gus', { projectId: 'sh', streamKind: 'channel', ownerId: 'geral' })
    await sleep(80)
    h.sessionMemberId = undefined
    say(h, 'p1', SECRET)
    await sleep(300)
    await follow.stop()
    expect(follow.frames.filter(frame => frame.includes(SECRET)), 'the owner\'s Pessoal reached a member of another project').toEqual([])
  })

  it('listPinned: the pinned lines of the owner\'s Pessoal do not leave through the shared project\'s id', () => {
    const h = rig()
    say(h, 'p1', SECRET)
    h.pinMessage({ workspaceId: 'ws', projectId: 'pp', eventId: 'p1' })
    expect(JSON.stringify(h.listPinned({ workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 50 }))).toContain(SECRET) // control: the owner, by its own id
    h.sessionMemberId = 'gus'
    const seen = (() => { try { return h.listPinned({ ...SH, streamKind: 'channel', ownerId: 'geral', actorId: 'gus', afterSeq: 0, limit: 50 }) } catch { return [] } })()
    expect(JSON.stringify(seen)).not.toContain(SECRET)
  })

  it('control: a member reads the channel of HIS project by its own id (nothing that worked stops working)', () => {
    const h = rig()
    h.sessionMemberId = 'ana'
    h.postMessage({ id: 'sh1', ...SH, streamKind: 'channel', ownerId: 'geral:sh', body: 'bom dia, loja', actorId: 'ana', subjectId: 'sh1', occurredAt: CLOCK })
    h.sessionMemberId = 'gus'
    const page = h.listMessages({ ...SH, streamKind: 'channel', ownerId: 'geral:sh', actorId: 'gus', afterSeq: 0, limit: 50 })
    expect(page.events.map(event => event.body)).toContain('bom dia, loja')
  })
})

describe('R2-02: a stream opened on a DM that is still empty does not deliver it later', () => {
  it('Gus opens the follow on dm-bia (the DM exists, no line yet); Ana then writes: Gus gets nothing, and the stream ends', async () => {
    const h = rig()
    h.sessionMemberId = 'ana'
    h.createDm({ id: 'dm-bia', ...SH, participantA: 'ana', participantB: 'bia' })
    const follow = followAs(h, 'gus', { projectId: 'sh', streamKind: 'dm', ownerId: 'dm-bia' })
    await sleep(100)
    h.sessionMemberId = 'ana'
    h.postMessage({ id: 'dm1', ...SH, streamKind: 'dm', ownerId: 'dm-bia', body: `Bia, ${DM_SECRET}`, actorId: 'ana', subjectId: 'dm1', occurredAt: CLOCK })
    await sleep(400)
    await follow.stop()
    expect(follow.frames.filter(frame => frame.includes(DM_SECRET)), 'the DM line reached a member who is not in the DM').toEqual([])
  })

  it('control: a PARTICIPANT who follows an empty DM receives what is written', async () => {
    const h = rig()
    h.sessionMemberId = 'ana'
    h.createDm({ id: 'dm-bia', ...SH, participantA: 'ana', participantB: 'bia' })
    const follow = followAs(h, 'ana', { projectId: 'sh', streamKind: 'dm', ownerId: 'dm-bia' })
    await sleep(100)
    h.sessionMemberId = 'ana'
    h.postMessage({ id: 'dm1', ...SH, streamKind: 'dm', ownerId: 'dm-bia', body: 'oi, Bia', actorId: 'ana', subjectId: 'dm1', occurredAt: CLOCK })
    for (let round = 0; round < 100 && !follow.frames.some(frame => frame.includes('oi, Bia')); round += 1) await sleep(20)
    await follow.stop()
    expect(follow.frames.some(frame => frame.includes('oi, Bia'))).toBe(true)
  })
})

describe('R2-01: listPinned does not hand a DM to someone outside it', () => {
  it('Gus (member, not in the DM ana<->bia) reads nothing of the pinned DM line; the participant reads it', () => {
    const h = rig()
    h.createDm({ id: 'dm-bia', ...SH, participantA: 'ana', participantB: 'bia' })
    h.postMessage({ id: 'dm1', ...SH, streamKind: 'dm', ownerId: 'dm-bia', body: `Bia, ${DM_SECRET}`, actorId: 'ana', subjectId: 'dm1', occurredAt: CLOCK })
    h.pinMessage({ ...SH, eventId: 'dm1' })
    expect(JSON.stringify(h.listPinned({ ...SH, streamKind: 'dm', ownerId: 'dm-bia', actorId: 'ana', afterSeq: 0, limit: 50 }))).toContain(DM_SECRET) // control
    h.sessionMemberId = 'gus'
    const seen = (() => { try { return h.listPinned({ ...SH, streamKind: 'dm', ownerId: 'dm-bia', actorId: 'gus', afterSeq: 0, limit: 50 }) } catch { return [] } })()
    expect(JSON.stringify(seen)).not.toContain(DM_SECRET)
  })
})
