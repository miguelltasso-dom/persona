import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { SCOPE, it, openJourney, seedJourney } from './journeys/journey-host.ts'

/**
 * Complements `one-message-one-line.spec.ts` (P0, 04/11 21:40: a message of the person = ONE line): the routes that spec does not
 * take — the v1.1 flags ON (fan-out, board start), the live `followMessages` frames, the recovery sweep and the commands.
 */

const BODY = 'Olá do Alice · 8a9b6eb3'

const ofThePerson = (h: PersonaHost, body: string) =>
  h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events
    .filter(item => item.actorId === 'ana' && item.body === body)

async function framesOf(h: PersonaHost, body: string): Promise<number> {
  const abort = new AbortController()
  let count = 0
  const reading = (async () => {
    for await (const frame of h.followMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }, abort.signal)) {
      count += frame.events.filter(item => item.actorId === 'ana' && item.body === body).length
    }
  })()
  await new Promise(resolve => setTimeout(resolve, 200))
  abort.abort()
  await reading.catch(() => undefined)
  return count
}

const send = async (h: PersonaHost, id: string, body: string, extra: { fanout?: 'everyone' | 'relevant' } = {}): Promise<void> => {
  h.postMessage({ id, ...SCOPE, streamKind: 'channel', ownerId: 'geral', body, actorId: 'ana', subjectId: '', ...extra })
  await h.orchestration.flush('pp')
}

it('a fresh workspace with no team (as in the remote-team desk): stored once, and the live frames carry it once', async () => {
  const h = openJourney()
  seedJourney(h, [])
  await send(h, 'm1', BODY)
  expect(ofThePerson(h, BODY)).toHaveLength(1)
  expect(await framesOf(h, BODY)).toBe(1)
})

it('conversation, request, mention, courtesy and commands: ONE line each', async () => {
  const h = openJourney()
  seedJourney(h, [{ id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true }, { id: 'nina', name: 'Nina', title: 'Pesquisa' }])
  const bodies = [BODY, 'Faça a lista de preços novos', '@Nina bom dia, tudo bem?', 'valeu!', '/pausar', '/retomar']
  for (const [index, body] of bodies.entries()) await send(h, `m${String(index)}`, body)
  for (const body of bodies) expect(ofThePerson(h, body), body).toHaveLength(1)
})

it('with the v1.1 flags ON (fan-out and board start) the person\'s words are still written once, on every route', async () => {
  const h = openJourney()
  seedJourney(h, [{ id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true }, { id: 'nina', name: 'Nina', title: 'Pesquisa' }, { id: 'bento', name: 'Bento', title: 'Engenharia' }])
  h.orchestration.fanoutEnabled = true
  h.orchestration.startOnBoardMove = true
  const bodies = [BODY, '@Nina @Bento, vejam isso', '@Nina @Bento façam o relatório do mês']
  for (const [index, body] of bodies.entries()) await send(h, `f${String(index)}`, body)
  await send(h, 'f-all', 'Como estamos?', { fanout: 'everyone' })
  await send(h, 'f-rel', 'Quem cuida do site?', { fanout: 'relevant' })
  for (const body of [...bodies, 'Como estamos?', 'Quem cuida do site?']) expect(ofThePerson(h, body), body).toHaveLength(1)
  expect(await framesOf(h, 'Como estamos?')).toBe(1)
})

it('after a restart the recovery sweep never writes the person\'s words again', async () => {
  const h = openJourney()
  seedJourney(h, [{ id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true }])
  await send(h, 'r1', BODY)
  await (h.orchestration as unknown as { recoverTalks(rt: unknown, projectId: string): Promise<void> }).recoverTalks(h.orchestration.runtime('pp'), 'pp')
  await h.orchestration.flush('pp')
  expect(ofThePerson(h, BODY)).toHaveLength(1)
})
