import { expect, onTestFinished } from 'vitest'
import { memoryDirectory } from '../src/channel-directory.ts'
import { ChannelWire } from '../src/channel-wire.ts'
import PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

/**
 * Item 22 (colheita): the host reads a channel message through the channel layer. `@Marketing` calls the whole equipe (a block of lines, one
 * per persona), `@equipe` the equipe of the channel, and ONLY the members of the channel answer there: a persona named outside it is not
 * woken and the person is told why (one final line, never silence). Without the layer nothing changes.
 */
const { host } = bindHostFile('2026-11-12T12:00:00.000Z')
const scope = { workspaceId: 'ws', projectId: 'pp' }
let serial = 0

function seed(h: PersonaHost, options: { layer?: boolean } = {}): void {
  serial = 0
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...scope, displayName: 'Ana', handle: 'ana', role: 'owner' })
  for (const [id, name, title] of [['p-coord', 'Coord', 'Coordenação'], ['p-bia', 'Bia', 'Redatora de textos'], ['p-caio', 'Caio', 'Designer de artes'], ['p-lia', 'Lia', 'Atendimento ao cliente']] as const) {
    h.createPersona({
      id, ...scope, name, title, description: 'Implementa.', personality: 'Direto.', instructions: 'Prove.',
      avatarKind: 'gallery', avatarRef: 'bento', runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: false, createdBy: 'ana',
    })
  }
  h.product.updatePersona({ ...h.product.getPersona('p-coord')!, systemRoles: ['coordination'] }, 'pp')
  h.sessionMemberId = 'ana'
  h.orchestration.fanoutEnabled = true
  onTestFinished(() => { h.orchestration.fanoutEnabled = false })
  if (options.layer === false) return
  // The stream under test is `channel:geral`: in this rig it is the channel of the equipe Marketing (Bia and Caio), with Lia fenced out.
  const directory = memoryDirectory({
    roster: ['p-coord', 'p-bia', 'p-caio', 'p-lia'],
    teams: [{ id: 'mkt', name: 'Marketing', personaIds: ['p-bia', 'p-caio'] }, { id: 'atd', name: 'Atendimento', personaIds: ['p-lia'] }],
    channels: [
      { id: 'geral', name: 'marketing', kind: 'custom', teamId: 'mkt', members: ['p-coord', 'p-bia', 'p-caio'] },
      { id: 'equipe-atd', name: 'atendimento', kind: 'team', teamId: 'atd' },
    ],
  })
  h.orchestration.channelWire = new ChannelWire({
    directory: () => directory,
    personas: projectId => h.product.listPersonas(projectId),
    isPaused: (projectId, personaId) => h.orchestration.isPersonaPaused(projectId, personaId),
  })
  onTestFinished(() => { h.orchestration.channelWire = undefined })
}

function answers(h: PersonaHost): { asked: string[] } {
  const asked: string[] = []
  const original = h.orchestration.answerOnce.bind(h.orchestration)
  h.orchestration.answerOnce = (_project, persona) => {
    asked.push(persona.name)
    return Promise.resolve(`Resposta de ${persona.name}`)
  }
  onTestFinished(() => { h.orchestration.answerOnce = original })
  return { asked }
}

const send = (h: PersonaHost, body: string): string => {
  serial += 1
  const id = `u${String(serial)}`
  h.postMessage({ id, ...scope, streamKind: 'channel', ownerId: 'geral', body, actorId: 'ana', subjectId: '' })
  return id
}
const events = (h: PersonaHost) => h.listMessages({ ...scope, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events
const block = (h: PersonaHost, id: string) => events(h).filter(item => item.id.startsWith(`coord-${id}-fan-`)).sort((a, b) => (a.fanout?.index ?? 0) - (b.fanout?.index ?? 0))
const lines = (h: PersonaHost, id: string): string[] => events(h).filter(item => item.actorId !== 'ana' && item.id.includes(id)).map(item => item.id)
const recover = async (h: PersonaHost): Promise<void> => {
  const orchestration = h.orchestration as unknown as { recoverTalks(rt: unknown, projectId: string): Promise<void> }
  await orchestration.recoverTalks(h.orchestration.runtime('pp'), 'pp')
  await h.orchestration.flush('pp')
}

/** The order the project lists its personas in (the roster order a team call answers in). */
const rosterOrder = (h: PersonaHost, ids: readonly string[]): string[] => h.product.listPersonas('pp').map(persona => persona.id).filter(id => ids.includes(id))

it('@Marketing calls the whole equipe: a block of lines in roster order, Lia never asked', async () => {
  const h = host()
  seed(h)
  const { asked } = answers(h)
  const id = send(h, '@Marketing, vejam isso quando puderem')
  await h.orchestration.flush('pp')
  expect(block(h, id).map(line => line.actorId)).toEqual(rosterOrder(h, ['p-bia', 'p-caio']))
  expect(block(h, id).every(line => line.fanout?.source === 'mentions' && line.fanout.total === 2)).toBe(true)
  expect(asked.sort()).toEqual(['Bia', 'Caio'])
})

it('@equipe in the channel of Marketing calls the same equipe', async () => {
  const h = host()
  seed(h)
  const { asked } = answers(h)
  const id = send(h, '@equipe bom dia, tudo certo por aí?')
  await h.orchestration.flush('pp')
  expect(block(h, id).map(line => line.actorId)).toEqual(rosterOrder(h, ['p-bia', 'p-caio']))
  expect(asked.sort()).toEqual(['Bia', 'Caio'])
})

it('THE FENCE: a persona named but not on the channel is not woken; one final line says so, and the sweep does not answer it later', async () => {
  const h = host()
  seed(h)
  const { asked } = answers(h)
  const id = send(h, '@Lia me ajuda com uma cliente')
  await h.orchestration.flush('pp')
  expect(lines(h, id)).toEqual([`coord-${id}-outside`])
  expect(events(h).find(item => item.id === `coord-${id}-outside`)?.body).toBe('Lia não está em #marketing.')
  expect(asked).toEqual([])
  expect(h.orchestration.runtime('pp').repo.tickets.list()).toHaveLength(0)
  await recover(h)
  expect(lines(h, id)).toEqual([`coord-${id}-outside`]) // a final line: no model reply is owed
})

it('an equipe with nobody on the channel is told the same way ("Ninguém de Atendimento…") and nobody is woken', async () => {
  const h = host()
  seed(h)
  const { asked } = answers(h)
  const id = send(h, '@Atendimento chegou uma reclamação')
  await h.orchestration.flush('pp')
  expect(events(h).find(item => item.id === `coord-${id}-outside`)?.body).toBe('Ninguém de Atendimento está em #marketing.')
  expect(asked).toEqual([])
})

it('a member and an outsider named together: the member answers and the outsider is told about', async () => {
  const h = host()
  seed(h)
  const { asked } = answers(h)
  const id = send(h, '@Bia e @Lia, tudo bem com vocês?')
  await h.orchestration.flush('pp')
  expect(events(h).find(item => item.id === `coord-${id}-outside`)?.body).toBe('Lia não está em #marketing.')
  expect(events(h).find(item => item.id === `coord-${id}-reply`)?.actorId).toBe('p-bia') // the member answers (one persona: the normal reply, not a block)
  expect(lines(h, id).filter(line => line.endsWith('-reply'))).toHaveLength(1)
  expect(asked).toEqual([]) // and nobody else was asked
})

it('without the layer nothing changes: the persona named is the one who answers, in any channel', async () => {
  const h = host()
  seed(h, { layer: false })
  answers(h)
  const id = send(h, '@Lia tudo bem por aí?')
  await h.orchestration.flush('pp')
  expect(lines(h, id).some(line => line.endsWith('-outside'))).toBe(false)
  expect(events(h).find(item => item.id === `coord-${id}-reply`)?.actorId).toBe('p-lia')
})
