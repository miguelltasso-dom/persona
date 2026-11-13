import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

/**
 * Marco Dogfood M6 on a REAL host: "quem está cuidando de quê", one look per project (the responsible, what each persona does now, what waits for the owner, the board's pace, the loop's state) and the switch "deixar a
 * responsável tocar o quadro" (owner only, default OFF, audited once). The overview lists ONLY the projects the session may read (the fence); `canChange` tells the screen whether to offer the swap of responsible.
 */
const { host } = bindHostFile('2026-11-12T12:00:00.000Z')
const PP = { workspaceId: 'ws', projectId: 'pp' }
const TEAM = { workspaceId: 'ws', projectId: 'team' }

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Padaria Lua', personalProjectId: 'pp' })
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
  persona('t-zed', TEAM, 'Zed', 'Atendimento')
  h.product.updatePersona({ ...h.product.getPersona('p-coord')!, systemRoles: ['coordination'] }, 'pp')
  h.sessionMemberId = 'ana'
}

const audits = (h: PersonaHost): number => Number((h.store.db.prepare("SELECT COUNT(*) AS total FROM governance_audit WHERE action = 'project.autopilot'").get() as { total: number }).total)

it('canChange: true for the owner, false for a member who reads the project (the screen offers the swap only to who can make it)', () => {
  const h = host()
  seed(h)
  expect(h.getProjectResponsible(PP).canChange).toBe(true)
  h.sessionMemberId = 'bob'
  expect(h.getProjectResponsible(TEAM)).toMatchObject({ source: 'default', canChange: false })
})

it('the care view of a project: company, responsible, personas, counts and the loop state (resting, "desligado", while the autopilot is off)', () => {
  const h = host()
  seed(h)
  const view = h.getProjectCare(PP)
  expect(view).toMatchObject({ projectId: 'pp', projectName: expect.any(String), companyName: 'Padaria Lua', autopilot: false, lead: { state: 'resting' }, responsible: { source: 'default', persona: { id: 'p-coord' } } })
  expect(view.personas.map(item => item.id).sort()).toEqual(['p-bia', 'p-coord'])
  expect(view.counts).toEqual(expect.objectContaining({ done: expect.any(Number), doing: expect.any(Number), queued: expect.any(Number), cap: expect.any(Number), pulled: 0 }))
  expect(view.waitingForYou).toMatchObject({ approvals: 0, reviews: 0, questions: 0, items: [] })
})

it('the autopilot: OWNER only, default OFF, audited once; the view follows it; a member is refused and nothing is written', () => {
  const h = host()
  seed(h)
  expect(h.getProjectCare(PP).autopilot).toBe(false)
  expect(h.setProjectAutopilot({ ...PP, on: true })).toMatchObject({ autopilot: true })
  expect(h.getProjectCare(PP)).toMatchObject({ autopilot: true, lead: { state: expect.stringMatching(/^(working|resting|holding|paused)$/u) } })
  expect(audits(h)).toBe(1)
  h.setProjectAutopilot({ ...PP, on: true })
  expect(audits(h)).toBe(1) // an identical value writes nothing
  h.sessionMemberId = 'bob'
  expect(() => h.setProjectAutopilot({ ...TEAM, on: true })).toThrow('forbidden')
  expect(h.getProjectCare(TEAM).autopilot).toBe(false)
})

it('the overview lists ONLY the projects the session may read: the owner sees both, a member sees only the shared one', () => {
  const h = host()
  seed(h)
  expect(h.getCareOverview({ workspaceId: 'ws' }).map(item => item.projectId).sort()).toEqual(['pp', 'team'])
  h.sessionMemberId = 'bob'
  expect(h.getCareOverview({ workspaceId: 'ws' }).map(item => item.projectId)).toEqual(['team'])
})
