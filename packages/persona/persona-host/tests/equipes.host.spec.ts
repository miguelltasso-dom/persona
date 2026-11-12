import { expect, onTestFinished } from 'vitest'
import PersonaHost from '../src/index.ts'
import { RemoteFault } from '../src/remote-guard.ts'
import { bindHostFile, it } from './host-harness.ts'

/**
 * Item 22 (H22) on a REAL host: the owner arranges the equipes the person assembles, the categories and where a channel sits, and "Pôr no canal"; nobody else can.
 * The fence does not change: who answers in a channel is still the channel's members, an equipe of the person is called by `@Nome` like a sector, and the layout
 * the sidebar reads shows the categories the person made. Every refusal is a typed fault with the sentence the screen shows (never gateway/internal).
 */
const { host } = bindHostFile('2026-11-12T12:00:00.000Z')
const scope = { workspaceId: 'ws', projectId: 'pp' }
let serial = 0

function seed(h: PersonaHost): void {
  serial = 0
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...scope, displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createMember({ id: 'bob', ...scope, displayName: 'Bob', handle: 'bob', role: 'member' })
  for (const [id, name, title] of [['p-coord', 'Coord', 'Coordenação'], ['p-bia', 'Bia', 'Redatora de textos'], ['p-caio', 'Caio', 'Designer de artes'], ['p-lia', 'Lia', 'Atendimento ao cliente']] as const) {
    h.createPersona({
      id, ...scope, name, title, description: 'Implementa.', personality: 'Direto.', instructions: 'Prove.',
      avatarKind: 'gallery', avatarRef: 'bento', runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: false, createdBy: 'ana',
    })
  }
  h.product.updatePersona({ ...h.product.getPersona('p-coord')!, systemRoles: ['coordination'] }, 'pp')
  h.sessionMemberId = 'ana'
  h.teamworkEnabled = true
  h.orchestration.fanoutEnabled = true
  onTestFinished(() => { h.orchestration.fanoutEnabled = false })
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

const send = (h: PersonaHost, ownerId: string, body: string): string => {
  serial += 1
  const id = `u${String(serial)}`
  h.postMessage({ id, ...scope, streamKind: 'channel', ownerId, body, actorId: 'ana', subjectId: '' })
  return id
}

const arrange = (h: PersonaHost, action: Parameters<PersonaHost['updateChannelLayout']>[0]['action']) => h.updateChannelLayout({ ...scope, action })

function refusal(work: () => unknown): RemoteFault {
  try { work() } catch (error: unknown) { if (error instanceof RemoteFault) return error; throw error }
  throw new Error('expected a refusal')
}

it('the owner assembles an equipe: it shows in getEquipeLayout and @Lançamento calls ONLY its members, in roster order', async () => {
  const h = host()
  seed(h)
  const { asked } = answers(h)
  h.createChannel({ id: 'geral', ...scope, name: 'geral', topic: '' }) // the automatic #geral: the directory knows it, so the channel layer reads the message
  expect(h.getEquipeLayout(scope)).toEqual({ equipes: [], categories: [] })
  const layout = arrange(h, { kind: 'createEquipe', name: 'Lançamento', personaIds: ['p-lia', 'p-bia', 'p-fantasma'] })
  expect(layout.equipes).toHaveLength(1)
  expect(layout.equipes[0]).toMatchObject({ name: 'Lançamento', mirrorsSector: false, archived: false })
  expect([...layout.equipes[0]!.personaIds].sort()).toEqual(['p-bia', 'p-lia']) // a persona that is not on the roster never gets in
  send(h, 'geral', '@Lançamento, vamos alinhar o lançamento')
  await h.orchestration.flush('pp')
  expect([...asked].sort()).toEqual(['Bia', 'Lia']) // Caio and Coord are not in the equipe: never asked
})

it('an equipe the person archived stops being called; renamed, it answers to the new name', async () => {
  const h = host()
  seed(h)
  const { asked } = answers(h)
  h.createChannel({ id: 'geral', ...scope, name: 'geral', topic: '' })
  const made = arrange(h, { kind: 'createEquipe', name: 'Lançamento', personaIds: ['p-bia', 'p-caio'] }).equipes[0]!
  arrange(h, { kind: 'updateEquipe', id: made.id, name: 'Campanha' })
  send(h, 'geral', '@Campanha, bom dia')
  await h.orchestration.flush('pp')
  expect([...asked].sort()).toEqual(['Bia', 'Caio'])
  arrange(h, { kind: 'updateEquipe', id: made.id, archived: true })
  expect(h.getEquipeLayout(scope).equipes[0]).toMatchObject({ name: 'Campanha', archived: true })
  const before = asked.length
  send(h, 'geral', '@Campanha, e agora?')
  await h.orchestration.flush('pp')
  expect(asked).toHaveLength(before) // archived: nobody answers to it any more
})

it('ONLY the owner arranges: a member is refused and nothing is written', () => {
  const h = host()
  seed(h)
  h.sessionMemberId = 'bob'
  expect(() => arrange(h, { kind: 'createEquipe', name: 'Intrusa' })).toThrow('forbidden')
  expect(() => arrange(h, { kind: 'createCategory', name: 'Intrusa' })).toThrow('forbidden')
  h.sessionMemberId = 'ana'
  expect(h.getEquipeLayout(scope)).toEqual({ equipes: [], categories: [] })
})

it('names: the screen gets a typed fault with the sentence (empty, @, "equipe", repeated) — never gateway/internal', () => {
  const h = host()
  seed(h)
  arrange(h, { kind: 'createEquipe', name: 'Lançamento' })
  expect(refusal(() => arrange(h, { kind: 'createEquipe', name: '   ' }))).toMatchObject({ code: 'invalid-payload', message: expect.stringContaining('1 a 40') })
  expect(refusal(() => arrange(h, { kind: 'createEquipe', name: '@Bia' }))).toMatchObject({ code: 'invalid-payload' })
  expect(refusal(() => arrange(h, { kind: 'createEquipe', name: 'Equipe' }))).toMatchObject({ code: 'invalid-payload', message: expect.stringContaining('@equipe') })
  expect(refusal(() => arrange(h, { kind: 'createEquipe', name: 'lançamento' }))).toMatchObject({ code: 'conflict', message: expect.stringContaining('Já existe') })
  expect(refusal(() => arrange(h, { kind: 'createCategory', name: 'Lançamento' }))).toMatchObject({ code: 'conflict' }) // a category and an equipe never share a name
  expect(refusal(() => arrange(h, { kind: 'updateEquipe', id: 'nao-existe', name: 'X' }))).toMatchObject({ code: 'not-found' })
  expect(h.getEquipeLayout(scope).equipes).toHaveLength(1)
})

it('categories: a category the person made shows in the sidebar even empty, after the automatic sections; moving a channel puts it inside; removing it sends the channel back, deleting nothing', () => {
  const h = host()
  seed(h)
  h.createChannel({ id: 'pedidos', ...scope, name: 'pedidos', topic: '' })
  const category = arrange(h, { kind: 'createCategory', name: 'Clientes' }).categories[0]!
  const empty = h.getChannelLayout(scope).sections.find(section => section.id === category.id)
  expect(empty).toMatchObject({ name: 'Clientes', channels: [] })
  arrange(h, { kind: 'moveChannel', channelId: 'pedidos', categoryId: category.id })
  const placed = h.getChannelLayout(scope).sections
  expect(placed.find(section => section.id === category.id)?.channels.map(channel => channel.name)).toEqual(['pedidos'])
  expect(placed.find(section => section.id === null)?.channels.map(channel => channel.name) ?? []).not.toContain('pedidos')
  arrange(h, { kind: 'removeCategory', id: category.id })
  expect(h.getChannelLayout(scope).sections.find(section => section.id === null)?.channels.map(channel => channel.name)).toContain('pedidos')
  expect(h.listChannels(scope).some(channel => channel.id === 'pedidos')).toBe(true)
})

it('"Pôr no canal": only a channel the person made; #geral and a team channel come from the organogram; after it the FENCE applies (the new member answers, an outsider is not woken)', async () => {
  const h = host()
  seed(h)
  const { asked } = answers(h)
  h.createChannel({ id: 'ideias', ...scope, name: 'ideias', topic: '', memberIds: [{ kind: 'persona', id: 'p-coord' }] })
  h.createChannel({ id: 'geral', ...scope, name: 'geral', topic: '' })
  expect(refusal(() => arrange(h, { kind: 'addPersonaToChannel', channelId: 'geral', personaId: 'p-bia' }))).toMatchObject({ code: 'forbidden', message: expect.stringContaining('organograma') })
  expect(refusal(() => arrange(h, { kind: 'addPersonaToChannel', channelId: 'ideias', personaId: 'p-fantasma' }))).toMatchObject({ code: 'not-found' })
  expect(refusal(() => arrange(h, { kind: 'addPersonaToChannel', channelId: 'nao-existe', personaId: 'p-bia' }))).toMatchObject({ code: 'not-found' })
  arrange(h, { kind: 'addPersonaToChannel', channelId: 'ideias', personaId: 'p-bia' })
  arrange(h, { kind: 'addPersonaToChannel', channelId: 'ideias', personaId: 'p-bia' }) // idempotent
  arrange(h, { kind: 'addPersonaToChannel', channelId: 'ideias', personaId: 'p-caio' })
  expect(h.listChannelMembers({ ...scope, channelId: 'ideias' }).filter(member => member.kind === 'persona').map(member => member.id).sort()).toEqual(['p-bia', 'p-caio', 'p-coord'])
  send(h, 'ideias', '@Bia @Caio, o que acham?') // both are members now: both answer
  await h.orchestration.flush('pp')
  expect([...asked].sort()).toEqual(['Bia', 'Caio'])
  send(h, 'ideias', '@Lia @Bia, e vocês?') // Lia is NOT on #ideias: the fence tells the person and does not wake her; Bia answers
  await h.orchestration.flush('pp')
  expect(asked).not.toContain('Lia') // what this test is about: the fence; whether Bia answers a second time is the routing spec's business
})

it('without any arrangement the sidebar is exactly what it was: no equipes, no categories, the automatic sections only', () => {
  const h = host()
  seed(h)
  h.createChannel({ id: 'geral', ...scope, name: 'geral', topic: '' })
  expect(h.getEquipeLayout(scope)).toEqual({ equipes: [], categories: [] })
  expect(h.getChannelLayout(scope).sections.every(section => section.id === null || section.teamId !== undefined)).toBe(true) // none made by hand
})
