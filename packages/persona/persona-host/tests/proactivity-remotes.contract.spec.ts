import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()
const scope = { workspaceId: 'ws', projectId: 'pp' }

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createMember({ id: 'gus', workspaceId: 'ws', projectId: 'pp', displayName: 'Gus', handle: 'gus', role: 'guest' })
  h.createPersona({
    id: 'coord', workspaceId: 'ws', projectId: 'pp', name: 'Guia', title: 'Coordenação',
    description: 'Triagem.', personality: 'Calma.', instructions: 'Aceite.',
    avatarKind: 'gallery', avatarRef: 'guia', runnerKind: 'dsh', runnerCli: '',
    runnerModel: 'm', canRecruit: true, createdBy: 'ana',
  })
}

/** IV-1 wire the Visão geral / Rotinas read: contracts/proactivity-scheduler.md. */
const IV1_REMOTES = ['pauseTeam', 'resumeTeam', 'getTeamState', 'getProactivityStatus', 'runProactivityCycle'] as const

it('IV-1 remotes are on the host', () => {
  const names = new Set(remoteMethods(host()).map(item => item.method))
  for (const name of IV1_REMOTES) expect(names.has(name), name).toBe(true)
})

it('getProactivityStatus has the shape the UI reads, and resting is not an error', () => {
  const h = host()
  seed(h)
  h.sessionMemberId = 'ana'
  expect(h.getProactivityStatus(scope)).toEqual({
    projectId: 'pp', state: 'resting', running: false, cycleMs: 30_000,
    lastCycleAt: '', nextCycleAt: '', openGoals: 0, queued: 0, lastActions: [],
  })
})

it('runProactivityCycle runs one cycle now and reports when', async () => {
  const h = host()
  seed(h)
  h.sessionMemberId = 'ana'
  const status = await h.runProactivityCycle(scope)
  expect(status.lastCycleAt).not.toBe('')
  expect(status.state).toBe('resting')
})

it('Pausar / Retomar equipe is durable and reported by getTeamState and by the scheduler status', async () => {
  const h = host()
  seed(h)
  h.sessionMemberId = 'ana'
  expect(h.getTeamState(scope)).toEqual({ paused: false, pausedAt: '', resumedAt: '' })
  expect(h.pauseTeam(scope)).toBe(true)
  expect(h.getTeamState(scope)).toMatchObject({ paused: true })
  expect((await h.runProactivityCycle(scope)).state).toBe('paused')
  expect(h.resumeTeam(scope)).toMatchObject({ paused: false })
  expect((await h.runProactivityCycle(scope)).state).toBe('resting')
})

it('a guest cannot resume the team or force a cycle; a persona cannot either', async () => {
  const h = host()
  seed(h)
  for (const member of ['gus', 'coord']) {
    h.sessionMemberId = member
    expect(() => h.resumeTeam(scope), `${member} resumeTeam`).toThrow(/forbidden/)
    await expect(h.runProactivityCycle(scope), `${member} runProactivityCycle`).rejects.toThrow(/forbidden/)
  }
})
