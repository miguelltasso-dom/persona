import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { RemoteFault } from '../src/remote-guard.ts'
import { SCOPE, it, openJourney, seedJourney } from './journeys/journey-host.ts'

/** The end-of-turn choice card (colheita item 11): read from the persona's message, answered by a short message of the person. */

const CLOCK = '2026-11-11T15:00:00.000Z'
const OFFER = 'Fiz as duas versões do post.\n[[escolha: Qual delas publicamos? | Post para o Instagram | Post para o Facebook | Nenhuma, refaça]]'

function setup(): PersonaHost {
  const h = openJourney(CLOCK)
  seedJourney(h, [
    { id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true },
    { id: 'nina', name: 'Nina', title: 'Redação' },
  ])
  return h
}

function say(h: PersonaHost, id: string, actorId: string, body: string): void {
  h.events.append({ id, workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral', type: 'message', body, actorId, subjectId: '', occurredAt: CLOCK })
}

function geral(h: PersonaHost) {
  return h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events
}

function fault(run: () => unknown): RemoteFault {
  try {
    run()
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(RemoteFault)
    return error as RemoteFault
  }
  throw new Error('expected a RemoteFault')
}

it('a persona message that ends offering paths shows its words WITHOUT the marker and carries ONE end-of-turn card with the letters', () => {
  const h = setup()
  say(h, 'm-offer', 'nina', OFFER)
  const row = geral(h).find(item => item.id === 'm-offer')!
  expect(row.body).toBe('Fiz as duas versões do post.')
  expect(row.personaAsk).toEqual({
    kind: 'fimDoTurno', askId: 'choice:m-offer', ticketId: '', personaId: 'nina', personaName: 'Nina',
    question: 'Qual delas publicamos?', multiple: false,
    options: [{ id: 'a', label: 'Post para o Instagram' }, { id: 'b', label: 'Post para o Facebook' }, { id: 'c', label: 'Nenhuma, refaça' }],
  })
  // what is stored is what she wrote (the card is read, never stored)
  expect(h.events.get('m-offer')!.body).toBe(OFFER)
  // nothing is open anywhere: no Task waits for the card
  expect(h.listPersonaAsks(SCOPE)).toEqual([])
})

it('a card from the person herself (not a persona) is plain text, and a marker over 300 characters shows the question and the options as words', () => {
  const h = setup()
  say(h, 'm-human', 'ana', OFFER)
  const human = geral(h).find(item => item.id === 'm-human')!
  expect(human.body).toBe(OFFER)
  expect(human.personaAsk).toBeUndefined()

  say(h, 'm-long', 'nina', `Segue.\n[[escolha: ${'p'.repeat(301)} | Sim | Não]]`)
  const long = geral(h).find(item => item.id === 'm-long')!
  expect(long.personaAsk).toBeUndefined()
  expect(long.body).toContain('A) Sim')
  expect(long.body).toContain('B) Não')
  expect(long.body).not.toContain('[[')
})

it('tapping an option posts the person\'s short message to THAT persona, opens a new turn, and the card becomes answered; a second tap is refused', async () => {
  const h = setup()
  say(h, 'm-offer', 'nina', OFFER)
  expect(h.answerChoice({ ...SCOPE, messageId: 'm-offer', optionId: 'b' })).toBe(true)
  const tap = geral(h).find(item => item.id === 'choice-answer:m-offer')!
  expect(tap).toMatchObject({ body: '✓ B · Post para o Facebook', actorId: 'ana', replyToId: 'm-offer' })
  expect(h.listPersonaAsks(SCOPE)).toMatchObject([{
    kind: 'fimDoTurno', askId: 'choice:m-offer', status: 'answered', cardId: 'm-offer',
    answer: { optionIds: ['b'], text: '✓ B · Post para o Facebook' },
  }])
  expect(fault(() => h.answerChoice({ ...SCOPE, messageId: 'm-offer', optionId: 'a' })).code).toBe('conflict')
  expect(geral(h).filter(item => item.id.startsWith('choice-answer:'))).toHaveLength(1)
  // the tap went through the same door as any message of the person: someone answers it
  await h.orchestration.flush('pp')
  const after = geral(h)
  const mine = after.findIndex(item => item.id === 'choice-answer:m-offer')
  expect(after.slice(mine + 1).some(item => item.actorId !== 'ana')).toBe(true)
})

it('an option that is not the card\'s, a message with no card and a message that is not a persona\'s are refused before anything is posted', () => {
  const h = setup()
  say(h, 'm-offer', 'nina', OFFER)
  say(h, 'm-plain', 'nina', 'Só uma conversa.')
  say(h, 'm-human', 'ana', OFFER)
  expect(fault(() => h.answerChoice({ ...SCOPE, messageId: 'm-offer', optionId: 'z' })).code).toBe('invalid-payload')
  expect(fault(() => h.answerChoice({ ...SCOPE, messageId: 'm-offer', optionId: 'd' })).code).toBe('invalid-payload')
  expect(fault(() => h.answerChoice({ ...SCOPE, messageId: 'm-plain', optionId: 'a' })).code).toBe('not-found')
  expect(fault(() => h.answerChoice({ ...SCOPE, messageId: 'm-human', optionId: 'a' })).code).toBe('not-found')
  expect(fault(() => h.answerChoice({ ...SCOPE, messageId: 'nope', optionId: 'a' })).code).toBe('not-found')
  expect(geral(h).some(item => item.id.startsWith('choice-answer:'))).toBe(false)
  expect(h.listPersonaAsks(SCOPE)).toEqual([])
})

it('a reply that is still arriving (a partial with the marker half written) never shows the half marker', () => {
  const h = setup()
  say(h, 'm-part', 'nina', 'Fiz o post.\n[[escolha: Qual delas | Post para')
  const row = geral(h).find(item => item.id === 'm-part')!
  expect(row.body).toBe('Fiz o post.')
  expect(row.personaAsk).toBeUndefined()
})
