import { expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

/**
 * Carbon P0-13 (Keel 10:19, "o que o CONVIDADO/membro recebe"): the reads that only ask for the WORKSPACE (not a project) list things of EVERY project. A member reads the shared projects, a guest none: what
 * belongs to the owner's personal project (its name, its team, its folder on the machine) must not come back. Written red first: each row is a Remote read as a member and as a guest.
 */
const { host } = bindHostFile('2026-11-12T12:00:00.000Z')
const WS = { workspaceId: 'ws' } as const
const TEAM = { ...WS, projectId: 'team' } as const
const PESSOAL = { ...WS, projectId: 'pp' } as const
const MARK = 'PESSOAL-SECRETO-7731'

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...WS, projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createMember({ id: 'bia', ...WS, projectId: 'pp', displayName: 'Bia', handle: 'bia', role: 'member' })
  h.createMember({ id: 'gus', ...WS, projectId: 'pp', displayName: 'Gus', handle: 'gus', role: 'guest' })
  h.createProject({ id: 'team', ...WS, name: 'Time', description: '' })
  h.createPersona({
    ...PESSOAL, id: 'nina', name: `Nina ${MARK}`, title: 'Redação', description: 'Escreve.', personality: 'Calma.', instructions: 'Escreva.',
    avatarKind: 'gallery', avatarRef: 'nina', runnerKind: 'cli', runnerCli: 'claude', runnerModel: 'default', canRecruit: false, createdBy: 'ana',
  })
  h.sessionMemberId = 'ana'
  h.updateProject({ ...PESSOAL, name: `Projeto ${MARK}`, description: `Segredo ${MARK}` } as never)
}

it('the reads of the WORKSPACE do not hand a member or a guest what belongs to the owner\'s personal project', async () => {
  const h = host()
  seed(h)
  const reads: ReadonlyArray<readonly [string, () => unknown]> = [
    ['listBoards', () => h.listBoards({ ...TEAM })],
    ['getOrgChart', () => h.getOrgChart({ ...WS, groupBy: 'sector' } as never)],
    ['getTeamHealth', () => h.getTeamHealth({ ...TEAM })],
    ['listProjectRoots', () => h.listProjectRoots({ ...TEAM })],
    ['getUsagePanel', () => h.getUsagePanel({ ...TEAM } as never)],
    ['getUsage', () => h.getUsage({ ...TEAM } as never)],
    ['listAudit', () => h.listAudit({ ...TEAM } as never)],
    ['listGestorPlans', () => h.listGestorPlans({ ...TEAM } as never)],
    ['listGestorAudit', () => h.listGestorAudit({ ...TEAM } as never)],
    ['getGestorMandate', () => h.getGestorMandate({ ...TEAM } as never)],
    ['listProjects', () => h.listProjects({ ...TEAM })],
  ]
  h.sessionMemberId = 'ana'
  const owner: Record<string, string> = {}
  for (const [name, read] of reads) {
    try { owner[name] = JSON.stringify(await Promise.resolve(read())) } catch (error) { owner[name] = error instanceof Error ? error.message : 'error' }
  }
  const leaks: string[] = []
  for (const session of ['bia', 'gus']) {
    h.sessionMemberId = session
    for (const [name, read] of reads) {
      let seen = ''
      try { seen = JSON.stringify(await Promise.resolve(read())) } catch (error) { seen = error instanceof Error ? error.message : 'error' }
      if (seen.includes(MARK)) leaks.push(`${session}:${name}`)
    }
  }
  expect(Object.values(owner).some(text => text.includes(MARK)), 'control: the owner reads the marked project (otherwise nothing was proved)').toBe(true)
  expect(leaks, 'the personal project of the owner reached someone else').toEqual([])
})
