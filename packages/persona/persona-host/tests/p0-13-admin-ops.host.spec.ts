import { expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

/**
 * Carbon P0-13 (Keel 10:19, what was left "out, with a reason"): the ADMIN operations (who is in the team and with which role, what a persona may do, the machine folder of a project, the limits and the
 * policies of the team) are the owner's; a member of a shared project reads and writes the WORK, not the rules of the house. Written red first: each row is a Remote, called as a member and as a guest.
 */
const { host } = bindHostFile('2026-11-12T12:00:00.000Z')
const WS = { workspaceId: 'ws' } as const
const TEAM = { ...WS, projectId: 'team' } as const

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...WS, projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createMember({ id: 'bia', ...WS, projectId: 'pp', displayName: 'Bia', handle: 'bia', role: 'member' })
  h.createMember({ id: 'gus', ...WS, projectId: 'pp', displayName: 'Gus', handle: 'gus', role: 'guest' })
  h.createProject({ id: 'team', ...WS, name: 'Time', description: '' })
  h.createPersona({
    ...TEAM, id: 'nina', name: 'Nina', title: 'Redação', description: 'Escreve.', personality: 'Calma.', instructions: 'Escreva.',
    avatarKind: 'gallery', avatarRef: 'nina', runnerKind: 'cli', runnerCli: 'claude', runnerModel: 'default', canRecruit: false, createdBy: 'ana',
  })
  h.sessionMemberId = 'ana'
}

async function refusal(attempt: () => unknown): Promise<string> {
  try {
    await Promise.resolve(attempt())
    return 'ran'
  } catch (error) {
    return error instanceof Error ? error.message : 'error'
  }
}

it('the admin operations of the house are the OWNER\'s: a member and a guest are refused', async () => {
  const h = host()
  seed(h)
  const P = { ...TEAM, personaId: 'nina' }
  const rows: ReadonlyArray<readonly [string, () => unknown]> = [
    ['createMember', () => h.createMember({ id: 'mal', ...TEAM, displayName: 'Mal', handle: 'mal', role: 'owner' })],
    ['setPersonaSystemRoles', () => h.setPersonaSystemRoles({ ...P, systemRoles: ['coordination'] } as never)],
    ['setPersonaCanRecruit', () => h.setPersonaCanRecruit({ ...P, canRecruit: true } as never)],
    ['setPersonaHireDirect', () => h.setPersonaHireDirect({ ...P, hireDirect: true } as never)],
    ['setPersonaCanSaveFiles', () => h.setPersonaCanSaveFiles({ ...P, canSaveFiles: true } as never)],
    ['setPersonaEngine', () => h.setPersonaEngine({ ...P, runnerKind: 'cli', runnerCli: 'codex', runnerModel: 'default' } as never)],
    ['setPersonaTalkAcl', () => h.setPersonaTalkAcl({ ...P, speak: 'everyone' } as never)],
    ['putPersonaCharge', () => h.putPersonaCharge({ ...P, responsibleHumanId: 'bia' } as never)],
    ['setProjectRoot', () => h.setProjectRoot({ ...TEAM, path: 'C:/Users' } as never)],
    ['setProjectLimits', () => h.setProjectLimits({ ...TEAM } as never)],
    ['updateProject', () => h.updateProject({ ...TEAM, name: 'Outro', description: 'x' } as never)],
    ['putRetentionPolicy', () => h.putRetentionPolicy({ ...TEAM } as never)],
    ['setReviewPolicy', () => h.setReviewPolicy({ ...TEAM, mode: 'off', reviewer: { kind: 'coordination' } } as never)],
    ['pauseTeam', () => h.pauseTeam({ ...TEAM })],
    ['resumeTeam', () => h.resumeTeam({ ...TEAM })],
    ['putProviderLimitReports', () => h.putProviderLimitReports({ ...TEAM } as never)],
    ['putAttentionPolicy', () => h.putAttentionPolicy({ ...TEAM } as never)],
  ]
  const ran: string[] = []
  for (const session of ['bia', 'gus']) {
    h.sessionMemberId = session
    for (const [name, attempt] of rows) if ((await refusal(attempt)) !== 'forbidden') ran.push(`${session}:${name}`)
  }
  expect(ran, 'these ran for someone who is not the owner').toEqual([])
})

it('the owner still runs them, and the FIRST member of a fresh workspace is created by the onboarding (no member yet to ask)', async () => {
  const h = host()
  h.createWorkspace({ id: 'w2', name: 'Novo', personalProjectId: 'p2' })
  expect(await refusal(() => h.createMember({ id: 'dono', workspaceId: 'w2', projectId: 'p2', displayName: 'Dono', handle: 'dono', role: 'owner' })), 'bootstrap: the first member').toBe('ran')
  seed(h)
  h.sessionMemberId = 'ana'
  expect(await refusal(() => h.createMember({ id: 'cris', ...TEAM, displayName: 'Cris', handle: 'cris', role: 'member' })), 'owner: createMember').toBe('ran')
  expect(await refusal(() => h.updateProject({ ...TEAM, name: 'Time 2', description: 'x' } as never)), 'owner: updateProject').toBe('ran')
  expect(await refusal(() => h.pauseTeam({ ...TEAM })), 'owner: pauseTeam').toBe('ran')
  expect(await refusal(() => h.resumeTeam({ ...TEAM })), 'owner: resumeTeam').not.toBe('forbidden')
})
