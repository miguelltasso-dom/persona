import { expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { GALLERY_ANIMALS, identityKey, resolveHireIdentity } from '../src/hire-identity.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()
const scope = { workspaceId: 'ws', projectId: 'pp' }

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  for (const [id, name, ref] of [['p1', 'Bento', 'bento'], ['p2', 'Nina', 'nina']] as const) {
    h.createPersona({
      id, workspaceId: 'ws', projectId: 'pp', name, title: 'Engenharia', description: 'Implementa.',
      personality: 'Direto.', instructions: 'Prove.', avatarKind: 'gallery', avatarRef: ref,
      runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: true, createdBy: 'ana',
    })
  }
}

it('a proposed hire never reuses the name or the animal of someone on the team', () => {
  const h = host()
  seed(h)
  const card = h.proposeHire({
    ...scope, id: 'h1', creatorPersonaId: 'p1', name: 'Bento', title: 'Atendimento',
    description: 'Responde clientes no WhatsApp.',
  })
  expect(card.kind).toBe('hire')
  expect(identityKey(card.title)).not.toBe('bento')
  expect(identityKey(card.title)).not.toBe('nina')
  expect(card.hireAvatarRef).toBeDefined()
  expect(['bento', 'nina']).not.toContain(card.hireAvatarRef)
  expect(GALLERY_ANIMALS).toContain(card.hireAvatarRef)
  expect(card.question).toBe(`Contratar ${card.title}?`)
})

it('two pending proposals do not collide with each other either', () => {
  const h = host()
  seed(h)
  const a = h.proposeHire({ ...scope, id: 'h1', creatorPersonaId: 'p1', name: 'Bento', title: 'A', description: 'a' })
  const b = h.proposeHire({ ...scope, id: 'h2', creatorPersonaId: 'p1', name: 'Bento', title: 'B', description: 'b' })
  expect(a.title).not.toBe(b.title)
  expect(a.hireAvatarRef).not.toBe(b.hireAvatarRef)
})

it('keeps the requested name and animal when they are free', () => {
  const h = host()
  seed(h)
  const card = h.proposeHire({ ...scope, id: 'h1', creatorPersonaId: 'p1', name: 'Capivara', title: 'Financeiro', description: 'Cuida do caixa.' })
  expect(card.title).toBe('Capivara')
  expect(card.hireAvatarRef).toBe('capivara')
})

it('the card carries the role and the description; reason is only a real motive', () => {
  const h = host()
  seed(h)
  const plain = h.proposeHire({ ...scope, id: 'h1', creatorPersonaId: 'p1', name: 'Teca', title: 'Atendimento', description: 'Responde clientes.' })
  expect(plain).toMatchObject({ roleTitle: 'Atendimento', description: 'Responde clientes.' })
  expect(plain.reason).toBeUndefined()
  expect(plain.monthlyTasks).toBeUndefined() // the host cannot measure it for someone not yet hired
  const motivated = h.proposeHire({
    ...scope, id: 'h2', creatorPersonaId: 'p1', name: 'Dora', title: 'Financeiro', description: 'Cuida do caixa.',
    reason: 'O caixa ficou sem dono nas últimas duas semanas.',
  })
  expect(motivated.reason).toBe('O caixa ficou sem dono nas últimas duas semanas.')
  expect(motivated.description).toBe('Cuida do caixa.')
  const blank = h.proposeHire({ ...scope, id: 'h3', creatorPersonaId: 'p1', name: 'Rita', title: 'Vendas', description: 'Vende.', reason: '   ' })
  expect(blank.reason).toBeUndefined()
})

it('listApprovals and the decision keep the same identity and the created persona matches the card', () => {
  const h = host()
  seed(h)
  const card = h.proposeHire({ ...scope, id: 'h1', creatorPersonaId: 'p1', name: 'Nina', title: 'Design', description: 'Desenha.', reason: 'Falta design.' })
  const listed = h.listApprovals(scope).find(item => item.id === 'h1')
  expect(listed).toMatchObject({ title: card.title, hireAvatarRef: card.hireAvatarRef, roleTitle: 'Design', reason: 'Falta design.' })
  const decided = h.decideApproval({ ...scope, id: 'h1', kind: 'hire', accept: true })
  expect(decided.status).toBe('approved')
  const created = h.listPersonas(scope).find(item => item.id === 'hire:h1')
  expect(created?.name).toBe(card.title)
  expect(created?.avatarRef).toBe(card.hireAvatarRef)
})

it('resolveHireIdentity: accents and case count as the same name; a full gallery still returns something', () => {
  const taken = { names: ['Tomás', 'BENTO'], avatarRefs: ['bento'] }
  expect(resolveHireIdentity('tomas', '', taken).renamed).toBe(true)
  expect(resolveHireIdentity('bento', '', taken)).toMatchObject({ renamed: true, reanimaled: true })
  expect(resolveHireIdentity('Teca', 'tucano', taken)).toMatchObject({ name: 'Teca', avatarRef: 'tucano', renamed: false, reanimaled: false })
  const everyone = { names: [], avatarRefs: [...GALLERY_ANIMALS] }
  expect(GALLERY_ANIMALS).toContain(resolveHireIdentity('Zé', '', everyone).avatarRef)
})
