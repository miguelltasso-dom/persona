/**
 * Harvest 19b: the connected sources are read on their own timer. One pass polls every eligible project with the Cofre
 * owner; a paused team and an active window reserve are skipped; a pass never overlaps the next; zero turns the timer off.
 */
import { Context } from '@deepseek-ai/cordis'
import { expect, onTestFinished } from 'vitest'
import PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createPersona({
    id: 'coord', workspaceId: 'ws', projectId: 'pp', name: 'Guia', title: 'Coordenação',
    description: 'Triagem.', personality: 'Calma.', instructions: 'Aceite.',
    avatarKind: 'gallery', avatarRef: 'guia', runnerKind: 'dsh', runnerCli: '', runnerModel: 'm',
    canRecruit: true, createdBy: 'ana',
  })
  h.createChannel({ id: 'geral', workspaceId: 'ws', projectId: 'pp', name: 'geral', topic: '' })
}

it('polls every project once per pass, with the Cofre owner', async () => {
  const h = host()
  seed(h)
  const calls: Array<{ projectId: string; personId: string }> = []
  h.external.poll = async (projectId, personId) => {
    calls.push({ projectId, personId })
    return { results: [] }
  }
  expect(await h.pollExternalSources()).toBe(1)
  expect(calls).toEqual([{ projectId: 'pp', personId: 'ana' }])
})

it('does not poll a paused team', async () => {
  const h = host()
  seed(h)
  const calls: string[] = []
  h.external.poll = async (projectId) => { calls.push(projectId); return { results: [] } }
  h.teamState.pause('pp')
  expect(await h.pollExternalSources()).toBe(0)
  expect(calls).toEqual([])
})

it('does not poll while the window reserve is active', async () => {
  const h = host()
  seed(h)
  const calls: string[] = []
  h.external.poll = async (projectId) => { calls.push(projectId); return { results: [] } }
  const before = h.orchestration.windowReserveOf
  h.orchestration.windowReserveOf = () => ({ state: 'reserve', provider: 'claude', windowId: '5h', usedPercent: 96 })
  onTestFinished(() => { h.orchestration.windowReserveOf = before })
  expect(await h.pollExternalSources()).toBe(0)
  expect(calls).toEqual([])
})

it('one project failing never stops the others and is reported, not thrown', async () => {
  const h = host()
  seed(h)
  h.createProject({ workspaceId: 'ws', id: 'p2', name: 'Outro', description: '' })
  const polled: string[] = []
  h.external.poll = async (projectId) => {
    if (projectId === 'pp') throw new Error('imap: timeout')
    polled.push(projectId)
    return { results: [] }
  }
  expect(await h.pollExternalSources()).toBe(1)
  expect(polled).toEqual(['p2'])
  expect(h.lastErrors).toContain('imap: timeout')
})

it('one pass never overlaps the next', async () => {
  const h = host()
  seed(h)
  let running = 0
  let max = 0
  h.external.poll = async () => {
    running += 1
    max = Math.max(max, running)
    const { promise, resolve } = Promise.withResolvers<void>()
    setTimeout(resolve, 10)
    await promise
    running -= 1
    return { results: [] }
  }
  await Promise.all([h.pollExternalSources(), h.pollExternalSources()])
  expect(max).toBe(1)
})

it('externalPollMs: 0 leaves the timer off', async () => {
  const ctx = new Context()
  const h = new PersonaHost(ctx, { databasePath: '', externalPollMs: 0, engineRetryPollMs: 0, remoteTeamPollMs: 0 })
  expect(h.externalPollArmed).toBe(false)
  await ctx.fiber.dispose()
})
