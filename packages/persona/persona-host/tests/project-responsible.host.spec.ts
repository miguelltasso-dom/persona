import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { RemoteFault } from '../src/remote-guard.ts'
import { bindHostFile, it } from './host-harness.ts'

/**
 * Marco Dogfood M1 on a REAL host: every project has a responsible persona (and optionally a person). The owner chooses; nobody else does; the persona must be OF THAT project; a person must be of the workspace;
 * the choice is audited ONCE (an identical choice again writes nothing) and a project with no choice answers with its Coordination persona, honestly marked `default`.
 */
const { host } = bindHostFile('2026-11-12T12:00:00.000Z')
const PP = { workspaceId: 'ws', projectId: 'pp' }
const TEAM = { workspaceId: 'ws', projectId: 'team' }

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...PP, displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createMember({ id: 'bob', ...PP, displayName: 'Bob', handle: 'bob', role: 'member' })
  h.createProject({ id: 'team', ...TEAM, name: 'Time', description: '' })
  const persona = (id: string, scope: { workspaceId: string; projectId: string }, name: string, title: string): void => {
    h.createPersona({
      id, ...scope, name, title, description: 'Implementa.', personality: 'Direta.', instructions: 'Prove.',
      avatarKind: 'gallery', avatarRef: 'bento', runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: false, createdBy: 'ana',
    })
  }
  persona('p-coord', PP, 'Guia', 'Coordenação')
  persona('p-bia', PP, 'Bia', 'Redatora')
  persona('t-zed', TEAM, 'Zed', 'Outro projeto')
  h.product.updatePersona({ ...h.product.getPersona('p-coord')!, systemRoles: ['coordination'] }, 'pp')
  h.sessionMemberId = 'ana'
}

function refusal(work: () => unknown): RemoteFault {
  try { work() } catch (error: unknown) { if (error instanceof RemoteFault) return error; throw error }
  throw new Error('expected a refusal')
}

const audits = (h: PersonaHost): number => Number((h.store.db.prepare("SELECT COUNT(*) AS total FROM governance_audit WHERE action = 'project.responsible'").get() as { total: number }).total)

it('with no choice the responsible is the project\'s Coordination persona, honestly marked "default"', () => {
  const h = host()
  seed(h)
  expect(h.getProjectResponsible(PP)).toEqual({ projectId: 'pp', persona: { id: 'p-coord', name: 'Guia', title: 'Coordenação' }, source: 'default', stale: false, canChange: true }) // the owner asks: the screen may offer the swap
})

it('the OWNER chooses (a persona and a person): the three screens read it; the choice is audited once and an identical choice writes nothing', () => {
  const h = host()
  seed(h)
  const view = h.setProjectResponsible({ ...PP, personaId: 'p-bia', humanId: 'ana' })
  expect(view).toMatchObject({ persona: { id: 'p-bia', name: 'Bia' }, human: { id: 'ana', name: 'Ana' }, source: 'chosen', stale: false })
  expect(h.getProjectResponsible(PP)).toEqual(view)
  expect(audits(h)).toBe(1)
  h.setProjectResponsible({ ...PP, personaId: 'p-bia', humanId: 'ana' })
  expect(audits(h)).toBe(1)
  expect(h.setProjectResponsible({ ...PP, personaId: 'p-bia', humanId: '' })).not.toHaveProperty('human') // an empty person clears only the person
  expect(audits(h)).toBe(2)
})

it('ONLY the owner: a member of the shared project is refused and nothing is written', () => {
  const h = host()
  seed(h)
  h.sessionMemberId = 'bob'
  expect(h.getProjectResponsible(TEAM)).toMatchObject({ source: 'default' }) // he reads
  expect(() => h.setProjectResponsible({ ...TEAM, personaId: 't-zed' })).toThrow('forbidden')
  expect(audits(h)).toBe(0)
})

it('the FENCE: a persona of ANOTHER project is `not-found` and a person who is not of the workspace is `invalid-payload`; nothing is written', () => {
  const h = host()
  seed(h)
  expect(refusal(() => h.setProjectResponsible({ ...PP, personaId: 't-zed' }))).toMatchObject({ code: 'not-found' })
  expect(refusal(() => h.setProjectResponsible({ ...PP, personaId: 'p-bia', humanId: 'intruso' }))).toMatchObject({ code: 'invalid-payload' })
  expect(h.getProjectResponsible(PP)).toMatchObject({ source: 'default' })
  expect(audits(h)).toBe(0)
})

it('projects keep their own responsible: choosing in one never shows in the other', () => {
  const h = host()
  seed(h)
  h.setProjectResponsible({ ...PP, personaId: 'p-bia' })
  expect(h.getProjectResponsible(TEAM)).toMatchObject({ source: 'default' })
  h.setProjectResponsible({ ...TEAM, personaId: 't-zed' })
  expect(h.getProjectResponsible(PP)).toMatchObject({ persona: { id: 'p-bia' } })
  expect(h.getProjectResponsible(TEAM)).toMatchObject({ persona: { id: 't-zed' } })
})
