import { expect } from 'vitest'
import { RemoteFault } from '../src/remote-guard.ts'
import { MAX_PAGE_LIMIT } from '../src/index.ts'
import type PersonaHost from '../src/index.ts'
import { SCOPE, it, openJourney, say, seedJourney } from './journeys/journey-host.ts'

/**
 * A page request the host cannot honour is an ERROR the client can see (a `limit` above the bound used to come back as an empty
 * conversation, indistinguishable from "nothing was said"); "you may not read it" and "there is no such conversation" stay an empty
 * page (nothing leaks). Reading more than one page is done with `nextSeq`.
 */

const TEAM = [
  { id: 'lia', name: 'Lia', title: 'Coordenação', coordination: true },
  { id: 'bia', name: 'Bia', title: 'Redação' },
]

const page = (h: PersonaHost, extra: Partial<Parameters<PersonaHost['listMessages']>[0]> = {}) =>
  h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 50, ...extra })

function rig(): PersonaHost {
  const h = openJourney('2026-11-04T12:00:00.000Z')
  seedJourney(h, TEAM)
  h.sessionMemberId = 'ana'
  for (let n = 1; n <= 5; n += 1) say(h, `u${String(n)}`, `Mensagem ${String(n)}`)
  return h
}

const fault = (run: () => unknown): RemoteFault => {
  try { run() } catch (error) { if (error instanceof RemoteFault) return error; throw error }
  throw new Error('expected a RemoteFault')
}

it('a limit above the bound (or zero, fractional, NaN) is refused with an invalid-payload fault that names the bound', () => {
  const h = rig()
  for (const limit of [MAX_PAGE_LIMIT + 1, 400, 0, -3, 1.5, Number.NaN]) {
    const failure = fault(() => page(h, { limit }))
    expect(failure.code, `limit ${String(limit)}`).toBe('invalid-payload')
    expect(failure.message).toMatch(/limit deve ser um inteiro de 1 a 200/u)
  }
})

it('a negative or fractional cursor is refused too', () => {
  const h = rig()
  for (const afterSeq of [-1, 0.5, Number.NaN]) expect(fault(() => page(h, { afterSeq })).code).toBe('invalid-payload')
})

it('the bound itself works and paging with nextSeq reads everything once', () => {
  const h = rig()
  expect(page(h, { limit: MAX_PAGE_LIMIT }).events.length).toBeGreaterThanOrEqual(5)
  const seen: string[] = []
  let after = 0
  for (let turn = 0; turn < 20; turn += 1) {
    const got = page(h, { afterSeq: after, limit: 2 })
    seen.push(...got.events.map(event => event.id))
    if (got.events.length < 2 || got.nextSeq <= after) break
    after = got.nextSeq
  }
  expect(new Set(seen).size).toBe(seen.length) // no message twice
  expect(seen).toEqual(expect.arrayContaining(['u1', 'u2', 'u3', 'u4', 'u5']))
})

it('a conversation that does not exist (or the actor may not read) is still an empty page, not an error', () => {
  const h = rig()
  expect(page(h, { ownerId: 'nao-existe' })).toEqual({ events: [], nextSeq: 0 })
  const dm = h.createDm({ id: 'dm-x', workspaceId: 'ws', projectId: 'pp', participantA: 'lia', participantB: 'bia' })
  expect(page(h, { streamKind: 'dm', ownerId: dm.id })).toEqual({ events: [], nextSeq: 0 }) // a DM between two others
})
