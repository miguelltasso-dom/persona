/**
 * Item 16 (memory that proves itself), first slice: what the owner asks the team to remember becomes a team memory tied to the exact
 * message that said it. The host writes it; the proof carries the owner's words. Never a secret, never from a persona.
 */
import { describe, expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { captureOwnerMemory, memoryProofOf, ownerMemoryAskOf, type OwnerMemoryDeps } from '../src/owner-memory.ts'
import { bindHostFile, it } from './host-harness.ts'

describe('ownerMemoryAskOf', () => {
  it('reads the plain ways an owner asks the team to remember', () => {
    expect(ownerMemoryAskOf('Pessoal, lembrem disso: a promoção é 2 pães de queijo por R$ 9 de segunda a quinta')).toEqual({
      fact: 'A promoção é 2 pães de queijo por R$ 9 de segunda a quinta.', rule: false,
    })
    expect(ownerMemoryAskOf('Time, anotem que a loja fecha às 18h no sábado')?.fact).toBe('A loja fecha às 18h no sábado.')
    expect(ownerMemoryAskOf('gente, saibam que o fornecedor novo entrega às terças')?.fact).toBe('O fornecedor novo entrega às terças.')
    expect(ownerMemoryAskOf('Lembra que a Ana Souza prefere pão sem sal')?.fact).toBe('A Ana Souza prefere pão sem sal.')
    expect(ownerMemoryAskOf('Anota: cliente Bia só paga no Pix')?.fact).toBe('Cliente Bia só paga no Pix.')
  })

  it('a rule (regra da casa, a partir de agora, sempre/nunca) is mandatory context', () => {
    expect(ownerMemoryAskOf('Regra da casa: nunca prometer entrega no mesmo dia')).toEqual({ fact: 'Nunca prometer entrega no mesmo dia.', rule: true })
    expect(ownerMemoryAskOf('A partir de agora, responda sempre com bom dia primeiro')?.rule).toBe(true)
    expect(ownerMemoryAskOf('Pessoal, lembrem: sempre confirmar o endereço antes de fechar o pedido')?.rule).toBe(true)
    expect(ownerMemoryAskOf('Pessoal, lembrem: a padaria abre às 7h')?.rule).toBe(false)
  })

  it('leaves questions, work requests, secrets and too-short lines alone', () => {
    for (const text of [
      'Lembra do pedido da Ana?', 'Você lembra que dia é a entrega?', 'Pessoal, lembrem: qual é o horário?',
      'Monte o cardápio da semana', 'oi', 'Pessoal, lembrem: ok',
      'Pessoal, lembrem: a senha do wifi é padaria123', 'Anota: o token da API é abc', 'Lembra que o cartão é 4111 1111 1111 1111',
      '', `Pessoal, lembrem: ${'muito '.repeat(150)}`,
    ]) expect(ownerMemoryAskOf(text), text).toBeUndefined()
  })
})

const { host } = bindHostFile()
const CLOCK = '2026-11-11T15:00:00.000Z'
const SCOPE = { workspaceId: 'ws', projectId: 'pp' }

function seed(h: PersonaHost): OwnerMemoryDeps {
  h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
  h.createWorkspace({ id: 'ws', name: 'Padaria', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...SCOPE, displayName: 'Ana', handle: 'ana', role: 'owner' })
  for (const [id, name] of [['atlas', 'Atlas'], ['bento', 'Bento']] as const) {
    h.createPersona({
      ...SCOPE, id, name, title: id === 'atlas' ? 'Coordenação' : 'Atendimento',
      description: 'Ajuda.', personality: 'Calmo.', instructions: 'Ajude.',
      avatarKind: 'gallery', avatarRef: id, runnerKind: 'dsh', runnerCli: '',
      runnerModel: 'm', canRecruit: false, createdBy: 'ana', ...(id === 'atlas' ? { systemRoles: ['coordination' as const] } : {}),
    })
  }
  h.createChannel({ id: 'geral', ...SCOPE, name: 'geral', topic: '' })
  h.createDm({ id: 'dm-bento', ...SCOPE, participantA: 'ana', participantB: 'bento' })
  return { vault: h.vault, screens: h.screens.screens, product: h.product }
}

function said(h: PersonaHost, id: string, body: string, options: { dm?: boolean; actorId?: string } = {}) {
  return h.events.append({
    id, ...SCOPE, streamKind: options.dm === true ? 'dm' : 'channel', ownerId: options.dm === true ? 'dm-bento' : 'geral',
    type: 'message', body, actorId: options.actorId ?? 'ana', subjectId: `s-${id}`, occurredAt: CLOCK,
  })
}

it('a team memory in a channel: the whole team reads it, tied to the owner\'s message, with the proof word for word', () => {
  const h = host()
  const deps = seed(h)
  const event = said(h, 'm1', 'Pessoal, lembrem disso: a promoção é 2 pães de queijo por R$ 9 de segunda a quinta')
  const got = captureOwnerMemory(deps, event)
  expect(got).toMatchObject({ status: 'saved', kind: 'memory', fact: 'A promoção é 2 pães de queijo por R$ 9 de segunda a quinta.' })
  const record = h.vault.getRecord(got!.recordId)!
  expect(record).toMatchObject({ kind: 'memory', status: 'active', authorId: 'ana', sourceIds: ['m1'], visibility: { kind: 'workspace' } })
  expect(memoryProofOf(deps.screens, 'pp', record.id)).toEqual({
    quote: 'Pessoal, lembrem disso: a promoção é 2 pães de queijo por R$ 9 de segunda a quinta',
    messageId: 'm1', by: 'Ana', byId: 'ana', at: CLOCK, where: 'channel', place: 'geral', scope: 'team',
  })
})

it('Memória lists it with its source; a rule is listed too (it is not kind "memory" in the vault)', () => {
  const h = host()
  const deps = seed(h)
  captureOwnerMemory(deps, said(h, 'm1', 'Pessoal, lembrem: a padaria abre às 7h'))
  captureOwnerMemory(deps, said(h, 'm2', 'Regra da casa: nunca prometer entrega no mesmo dia'))
  h.sessionMemberId = 'ana'
  const rows = h.listMemory({ ...SCOPE })
  const fact = rows.find(row => row.body === 'A padaria abre às 7h.')
  const rule = rows.find(row => row.body === 'Nunca prometer entrega no mesmo dia.')
  expect(fact).toMatchObject({ status: 'active', origin: 'vault', scope: 'team', rule: false, source: { by: 'Ana', mine: true, where: 'channel', place: 'geral', quote: 'Pessoal, lembrem: a padaria abre às 7h' } })
  expect(rule).toMatchObject({ status: 'active', scope: 'team', rule: true, source: { quote: 'Regra da casa: nunca prometer entrega no mesmo dia' } })
  expect(h.vault.getRecord('owner-mem-m2')?.kind).toBe('constraint') // mandatory context in every turn
})

it('another member looking at the list reads the name, not "você"; a DM memory says whom it was said to (her name only: no gender is guessed)', () => {
  const h = host()
  const deps = seed(h)
  // a second person who can read the project (a plain "member" needs a project grant first; this test is about who SAID it)
  h.createMember({ id: 'caio', ...SCOPE, displayName: 'Caio', handle: 'caio', role: 'owner' })
  captureOwnerMemory(deps, said(h, 'm1', 'Pessoal, lembrem: a padaria abre às 7h'))
  captureOwnerMemory(deps, said(h, 'd1', 'Lembra que a Ana Souza prefere pão sem sal', { dm: true }))
  h.sessionMemberId = 'caio'
  const rows = h.listMemory({ ...SCOPE })
  expect(rows.find(row => row.body === 'A padaria abre às 7h.')?.source).toMatchObject({ by: 'Ana', mine: false })
  const dm = rows.find(row => row.scope === 'persona')
  expect(dm).toMatchObject({ to: { name: 'Bento' }, source: { where: 'dm', place: '' } })
  expect(Object.keys(dm?.to ?? {})).toEqual(['name']) // no article, no gender
})

it('the same message twice, or the same fact said again, is ONE memory', () => {
  const h = host()
  const deps = seed(h)
  const first = said(h, 'm1', 'Pessoal, lembrem: a padaria abre às 7h')
  expect(captureOwnerMemory(deps, first)?.status).toBe('saved')
  expect(captureOwnerMemory(deps, first)?.status).toBe('duplicate')
  expect(captureOwnerMemory(deps, said(h, 'm2', 'Time, anotem que a padaria abre às 7h'))?.status).toBe('duplicate')
  expect(h.vault.listRecords('pp').filter(record => record.kind === 'memory')).toHaveLength(1)
})

it('in a DM it is that persona\'s memory only; said to the team afterwards, the copy she kept is archived (Tornar do time)', () => {
  const h = host()
  const deps = seed(h)
  const dm = captureOwnerMemory(deps, said(h, 'd1', 'Lembra que a Ana Souza prefere pão sem sal', { dm: true }))
  expect(dm).toMatchObject({ status: 'saved' })
  expect(h.vault.getRecord(dm!.recordId)?.visibility).toEqual({ kind: 'persona', personaId: 'bento' })
  expect(memoryProofOf(deps.screens, 'pp', dm!.recordId)).toMatchObject({ where: 'dm', scope: 'persona' })

  const team = captureOwnerMemory(deps, said(h, 'm1', 'Pessoal, lembrem que a Ana Souza prefere pão sem sal'))
  expect(team).toMatchObject({ status: 'promoted' })
  expect(h.vault.getRecord(team!.recordId)?.visibility).toEqual({ kind: 'workspace' })
  expect(h.vault.getRecord(dm!.recordId)?.status).toBe('revoked') // her private copy is archived
  expect(h.vault.listRecords('pp').filter(record => record.status === 'active' && record.kind === 'memory')).toHaveLength(1)
})

it('only a person of this workspace writes it: not a persona, a routine, the team\'s own line, a stranger, or a DM between people', () => {
  const h = host()
  const deps = seed(h)
  const body = 'Pessoal, lembrem: a padaria abre às 7h'
  expect(captureOwnerMemory(deps, said(h, 'p1', body, { actorId: 'atlas' }))).toBeUndefined()
  expect(captureOwnerMemory(deps, said(h, 'r1', body, { actorId: 'routine:r1' }))).toBeUndefined()
  expect(captureOwnerMemory(deps, said(h, 't1', body, { actorId: 'team:split' }))).toBeUndefined()
  expect(captureOwnerMemory(deps, said(h, 'x1', body, { actorId: 'stranger' }))).toBeUndefined()
  expect(h.vault.listRecords('pp')).toHaveLength(0)
})

it('a secret is never kept (it belongs to the Cofre), and a question is not an order', () => {
  const h = host()
  const deps = seed(h)
  expect(captureOwnerMemory(deps, said(h, 's1', 'Pessoal, lembrem: a senha do wifi é padaria123'))).toBeUndefined()
  expect(captureOwnerMemory(deps, said(h, 's2', 'Lembra que dia é a entrega?'))).toBeUndefined()
  expect(h.vault.listRecords('pp')).toHaveLength(0)
})

it('through the real message path: the owner writes it in #geral and it is in Memória with its source, while the team still answers', async () => {
  const h = host()
  seed(h)
  h.postMessage({ id: 'pm1', ...SCOPE, streamKind: 'channel', ownerId: 'geral', body: 'Pessoal, lembrem disso: a padaria abre às 7h', actorId: 'ana', subjectId: '', occurredAt: CLOCK })
  await h.orchestration.flush('pp')
  const row = h.listMemory({ ...SCOPE }).find(item => item.body === 'A padaria abre às 7h.')
  expect(row).toMatchObject({ status: 'active', scope: 'team', source: { by: 'Ana', where: 'channel', quote: 'Pessoal, lembrem disso: a padaria abre às 7h' } })
  // the message was still routed as any other: the person got an answer, a reaction or a state line (D-079)
  const events = h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 50 }).events
  expect(events.some(item => item.id !== 'pm1' && item.actorId !== 'ana') || (events.find(item => item.id === 'pm1')?.reactions ?? []).length > 0).toBe(true)
  // an ordinary message writes nothing
  h.postMessage({ id: 'pm2', ...SCOPE, streamKind: 'channel', ownerId: 'geral', body: 'Qual o horário de abertura?', actorId: 'ana', subjectId: '', occurredAt: CLOCK })
  await h.orchestration.flush('pp')
  expect(h.vault.listRecords('pp')).toHaveLength(1)
})

it('Esquecer (forgetMemory) revokes it, and the list shows it revoked with its source', () => {
  const h = host()
  const deps = seed(h)
  const got = captureOwnerMemory(deps, said(h, 'm1', 'Pessoal, lembrem: a padaria abre às 7h'))!
  h.forgetMemory({ ...SCOPE, id: got.recordId })
  expect(h.listMemory({ ...SCOPE }).find(row => row.id === got.recordId)).toMatchObject({ status: 'revoked', source: { by: 'Ana' } })
})
