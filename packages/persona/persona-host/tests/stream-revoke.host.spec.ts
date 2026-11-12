/**
 * Carbon section 11, #5 (Gauge 12/11): "revoked access stops working". `followMessages` and `attentionEvents` checked who was on the other side ONCE, when they opened, and then pushed
 * frames until the tab closed: a member demoted or removed went on receiving. An open stream now asks again — for the SAME member who opened it, never for whoever the host's session is
 * at that instant — before every frame it pushes (and about once a second while it is quiet), and ends with `forbidden` when the access is gone. The messages stream is Gauge's RED
 * (`.maestri/tmp/Gauge/sec11-5-revoke-stream.red.ts`); the attention stream and the controls (a member who keeps the access keeps receiving) are the same rig.
 */
import { describe, expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { geralChannelId, it, openJourney, sayOn, seedJourney, seedProject } from './journeys/journey-host.ts'

const SP = { workspaceId: 'ws', projectId: 'sp' } as const
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))
const until = async (condition: () => boolean, what: string, ms = 8000): Promise<void> => {
  const deadline = Date.now() + ms
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`timeout: ${what}`)
    await sleep(20)
  }
}

function rig(): PersonaHost {
  const h = openJourney('2026-11-12T12:00:00.000Z')
  seedJourney(h, [])
  seedProject(h, { id: 'sp', name: 'Equipe', team: [{ id: 'lia', name: 'Lia', title: 'Coordenação', coordination: true }] })
  h.sessionMemberId = 'ana'
  h.createMember({ id: 'bob', ...SP, displayName: 'Bob', handle: 'bob', role: 'member' })
  return h
}

/** Open the #geral stream as `member` and collect what it delivers; `end` says how it ended. (The host's session is that member only while the stream opens.) */
function followAs(h: PersonaHost, member: string) {
  h.sessionMemberId = member
  const abort = new AbortController()
  const frames: string[] = []
  const end: { error?: unknown; done: boolean } = { done: false }
  const stream = h.followMessages({ ...SP, streamKind: 'channel', ownerId: geralChannelId(h, 'sp'), actorId: member, afterSeq: 0, limit: 50 }, abort.signal)
  const reading = (async () => {
    try {
      for await (const frame of stream) frames.push(JSON.stringify(frame))
    } catch (error) {
      end.error = error
    } finally {
      end.done = true
    }
  })()
  return { frames, end, stop: async () => { abort.abort(); await reading } }
}

const followAsBob = (h: PersonaHost) => followAs(h, 'bob')

describe('followMessages: an open stream asks again before every frame', () => {
  it('RED #5: after the member is REVOKED (demoted to guest) the stream he already had open delivers nothing more, and ends with "forbidden"', async () => {
    const h = rig()
    const follow = followAsBob(h)
    await until(() => follow.frames.length >= 1, 'the baseline frame')
    h.sessionMemberId = 'ana' // the owner writes (the host session is now Ana: the stream must keep asking about BOB)
    sayOn(h, 'sp', 'm1', 'mensagem ANTES da revogação 7781')
    await until(() => follow.frames.some(frame => frame.includes('ANTES da revogação 7781')), 'the stream delivers the message from before (control)')
    h.product.updateMember('bob', { role: 'guest' }) // the revocation: a guest reads nothing
    sayOn(h, 'sp', 'm2', 'segredo DEPOIS da revogação 5521')
    await sleep(500)
    await follow.stop()
    expect(follow.frames.filter(frame => frame.includes('DEPOIS da revogação 5521')), 'the stream of the revoked member delivered the new message').toEqual([])
    expect(String(follow.end.error)).toContain('forbidden') // it ended by itself, saying why
  })

  it('a demoted member is cut even when nothing new is said (the quiet check ends the stream by itself)', async () => {
    const h = rig()
    const follow = followAsBob(h)
    await until(() => follow.frames.length >= 1, 'the baseline frame')
    h.sessionMemberId = 'ana'
    h.product.updateMember('bob', { role: 'guest' }) // and nobody writes anything after it
    await until(() => follow.end.done, 'the stream of a demoted member to end by itself', 4000)
    expect(String(follow.end.error)).toContain('forbidden')
    await follow.stop()
  })

  it('control: demoting ONE member cuts only his stream: the owner\'s stream (open at the same time) keeps receiving', async () => {
    const h = rig()
    const ana = followAs(h, 'ana')
    const bob = followAs(h, 'bob')
    await until(() => ana.frames.length >= 1 && bob.frames.length >= 1, 'both baseline frames')
    h.sessionMemberId = 'ana'
    h.product.updateMember('bob', { role: 'guest' })
    sayOn(h, 'sp', 'm0', 'depois do rebaixamento 9901')
    await until(() => ana.frames.some(frame => frame.includes('depois do rebaixamento 9901')), 'the owner\'s stream still delivers')
    await until(() => bob.end.done, 'the demoted member\'s stream to end', 4000)
    expect(bob.frames.some(frame => frame.includes('depois do rebaixamento 9901'))).toBe(false)
    expect(ana.end.done).toBe(false) // "cut everybody when somebody is demoted" is the bug this catches
    await ana.stop()
    await bob.stop()
  })

  it('control: a member who KEEPS the access keeps receiving, quiet checks and all', async () => {
    const h = rig()
    const follow = followAsBob(h)
    await until(() => follow.frames.length >= 1, 'the baseline frame')
    h.sessionMemberId = 'ana'
    sayOn(h, 'sp', 'm1', 'primeira 3301')
    await until(() => follow.frames.some(frame => frame.includes('primeira 3301')), 'the first message')
    await sleep(1300) // longer than the quiet check
    sayOn(h, 'sp', 'm2', 'segunda 3302')
    await until(() => follow.frames.some(frame => frame.includes('segunda 3302')), 'the second message, after a quiet check went by')
    expect(follow.end.done).toBe(false)
    await follow.stop()
    expect(follow.end.error).toBeUndefined()
  })
})

describe('attentionEvents: the same rule on a one-second poll', () => {
  it('a member demoted while the attention stream is open is cut within a few seconds, with "forbidden"', async () => {
    const h = rig()
    h.sessionMemberId = 'bob'
    const abort = new AbortController()
    const frames: string[] = []
    const end: { error?: unknown; done: boolean } = { done: false }
    const reading = (async () => {
      try {
        for await (const frame of h.attentionEvents({ ...SP }, abort.signal)) frames.push(JSON.stringify(frame))
      } catch (error) {
        end.error = error
      } finally {
        end.done = true
      }
    })()
    await until(() => frames.length >= 1, 'the baseline frame')
    h.sessionMemberId = 'ana'
    h.product.updateMember('bob', { role: 'guest' })
    await until(() => end.done, 'the attention stream of a demoted member to end by itself', 5000)
    expect(String(end.error)).toContain('forbidden')
    abort.abort()
    await reading
  })
})
