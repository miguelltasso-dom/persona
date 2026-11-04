import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createFakeRunner, RunnerResolveError } from '@deepseek-ai/dsh-persona-runners'
import { afterEach, expect, it as vitestIt, vi } from 'vitest'
import { FIRST_DELIVERY_EVENT_ID, FIRST_DELIVERY_MILESTONE_EVENT_ID } from '../src/onboarding.ts'
import type { CompleteOnboardingRequest } from '../src/types.ts'
import { bindHostFile, it } from './host-harness.ts'

const dirs: string[] = []
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const { host } = bindHostFile()

const ONBOARDING: CompleteOnboardingRequest = {
  workspaceId: 'ws',
  personalProjectId: 'pp',
  displayName: 'Ana',
  team: [{
    name: 'Guia', title: 'Coordenação', description: 'Triagem.', personality: 'Calma.',
    instructions: 'Receba o time.', avatarKind: 'gallery', avatarRef: 'guia',
    runnerKind: 'dsh', runnerCli: '', runnerModel: 'default', canRecruit: true,
    systemRoles: ['coordination'],
  }, {
    name: 'Bento', title: 'Engenharia', description: 'Implementa.', personality: 'Direto.',
    instructions: 'Prove.', avatarKind: 'gallery', avatarRef: 'bento',
    runnerKind: 'dsh', runnerCli: '', runnerModel: 'default', canRecruit: false,
    systemRoles: [],
  }],
  templateIds: [],
  runnerChoices: ['dsh'],
  cofreSeed: 'Agência Ponto — estúdio de sites.',
}

const scope = { workspaceId: 'ws', projectId: 'pp' }

it('waits for a cold connection probe before binding the first delivery to the logged-in CLI', async () => {
  const h = host()
  vi.stubEnv('PERSONA_REAL_CLI', '1')
  vi.spyOn(h.connections, 'detect').mockResolvedValue([{
    id: 'claude', kind: 'cli', installed: true, loggedIn: true, models: ['haiku'],
  }])
  vi.spyOn(h.orchestration, 'prewarmProject').mockResolvedValue(undefined)
  const resolved: string[] = []
  h.orchestration.runnerFactory = async (request) => {
    resolved.push(request?.spec.kind === 'cli' ? request.spec.cli : 'dsh')
    return createFakeRunner()
  }
  await h.completeOnboarding(ONBOARDING)
  await h.orchestration.flush('pp')
  expect(h.product.listPersonas('pp').every(row => row.runner.kind === 'cli' && row.runner.cli === 'claude')).toBe(true)
  expect(resolved).toEqual(['claude'])
})

it('onboarding delivery seals itself without a second Remote call and survives reopening', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'persona-fd-auto-'))
  dirs.push(dir)
  process.env.PERSONA_HOME = dir
  const path = join(dir, 'persona.db')
  const h = host(path)
  await h.completeOnboarding(ONBOARDING)
  await h.orchestration.flush('pp')

  const ready = h.getFirstDelivery(scope)
  expect(ready.status).toBe('ready')
  expect(h.listTasks(scope).find(card => card.id === ready.ticketId)?.stage).toBe('done')
  expect(host(path).getFirstDelivery(scope)).toEqual(ready)
  expect(h.listMessages({
    ...scope, streamKind: 'channel', ownerId: 'geral', actorId: 'owner', afterSeq: 0, limit: 40,
  }).events.filter(item => item.id === FIRST_DELIVERY_MILESTONE_EVENT_ID)).toHaveLength(1)
})

it('keeps the full inline first-delivery assignment even when the brief exceeds the ticket display title', async () => {
  const h = host()
  const brief = `${'Empresa de projetos digitais. '.repeat(12)}REGRA_FINAL_INTEGRA`
  await h.completeOnboarding({ ...ONBOARDING, cofreSeed: brief })
  await h.orchestration.flush('pp')
  const ticket = h.orchestration.runtime('pp').repo.tickets.list()[0]!
  expect(ticket.execution?.assignment).toContain('REGRA_FINAL_INTEGRA')
  expect(ticket.execution?.assignment).toContain('Não use ferramentas')
  expect(ticket.execution?.assignment).not.toBe(ticket.title)
})

it('a runner failure seals failed automatically and never posts a success milestone', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'persona-fd-failure-'))
  dirs.push(dir)
  process.env.PERSONA_HOME = dir
  const h = host(join(dir, 'persona.db'))
  h.orchestration.runnerFactory = async () => { throw new RunnerResolveError('quota_exhausted', 'claude') }
  await h.completeOnboarding(ONBOARDING)
  await h.orchestration.flush('pp')

  expect(h.getFirstDelivery(scope).status).toBe('failed')
  const events = h.listMessages({
    ...scope, streamKind: 'channel', ownerId: 'geral', actorId: 'owner', afterSeq: 0, limit: 40,
  }).events
  expect(events.some(item => item.id === FIRST_DELIVERY_MILESTONE_EVENT_ID)).toBe(false)
  expect(events.find(item => item.runError !== undefined)?.runError)
    .toMatchObject({ code: 'quota_exhausted', provider: 'Claude', persona: 'Guia' })
})

it('an interrupted first delivery resumes and seals the milestone on the reopened host', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'persona-fd-recover-'))
  dirs.push(dir)
  process.env.PERSONA_HOME = dir
  const path = join(dir, 'persona.db')
  const first = host(path)
  await first.completeOnboarding(ONBOARDING)
  first.store.close()
  const reopened = host(path)
  await reopened.orchestration.flush('pp')
  expect(reopened.getFirstDelivery(scope).status).toBe('ready')
  expect(reopened.listTasks(scope)).toHaveLength(1)
  const events = reopened.listMessages({
    ...scope, streamKind: 'channel', ownerId: 'geral', actorId: 'owner', afterSeq: 0, limit: 40,
  }).events
  expect(events.filter(item => item.id === FIRST_DELIVERY_MILESTONE_EVENT_ID)).toHaveLength(1)
})

it('getFirstDelivery is idle before the ask (never Carregando)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'persona-fd-idle-'))
  dirs.push(dir)
  process.env.PERSONA_HOME = dir
  const h = host(join(dir, 'persona.db'))
  h.createWorkspace({ id: 'ws', name: 'Ana', personalProjectId: 'pp' })
  const view = h.getFirstDelivery(scope)
  expect(view.status).toBe('idle')
  expect(JSON.stringify(view)).not.toMatch(/Carregando/u)
})

it('fake runner: postMessage → Ticket → first_delivery ready + milestone on #geral', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'persona-fd-fake-'))
  dirs.push(dir)
  process.env.PERSONA_HOME = dir
  const h = host(join(dir, 'persona.db'))
  await h.completeOnboarding(ONBOARDING)
  const afterAsk = h.getFirstDelivery(scope)
  expect(afterAsk.status).toBe('working')
  expect(afterAsk.eventId).toBe(FIRST_DELIVERY_EVENT_ID)
  expect(afterAsk.ticketId).not.toBe('')
  expect(h.listTasks(scope)).toHaveLength(1)

  const start = await h.startFirstDelivery(scope)
  expect(start.started).toBe(true)
  expect(start.eventId).toBe(FIRST_DELIVERY_EVENT_ID)
  expect(start.ticketId).not.toBe('')

  const ready = h.getFirstDelivery(scope)
  expect(ready.status).toBe('ready')
  expect(ready.ticketId).toBe(start.ticketId)
  expect(ready.feedEventId).toBe(FIRST_DELIVERY_MILESTONE_EVENT_ID)
  expect(ready.personaName).toBe('Bento')
  expect(JSON.stringify(ready)).not.toMatch(/Carregando/u)

  const page = h.listMessages({
    ...scope, streamKind: 'channel', ownerId: 'geral', actorId: 'owner', afterSeq: 0, limit: 40,
  })
  expect(page.events.some(item => item.id === FIRST_DELIVERY_EVENT_ID)).toBe(true)
  expect(page.events.some(item => item.id === FIRST_DELIVERY_MILESTONE_EVENT_ID)).toBe(true)
  expect(page.events.filter(item => item.id === FIRST_DELIVERY_MILESTONE_EVENT_ID)).toHaveLength(1)

  const tasks = h.listTasks(scope)
  expect(tasks.some(card => card.id === ready.ticketId && card.stage === 'done')).toBe(true)

  const overview = h.getOverview(scope)
  expect(overview.firstDelivery).toEqual(ready)
  expect(overview.needsYou.some(card => card.id === ready.ticketId)).toBe(false)

  const again = await h.startFirstDelivery(scope)
  expect(again.idempotent).toBe(true)
  expect(again.ticketId).toBe(ready.ticketId)
  expect(h.listMessages({
    ...scope, streamKind: 'channel', ownerId: 'geral', actorId: 'owner', afterSeq: 0, limit: 40,
  }).events.filter(item => item.id === FIRST_DELIVERY_MILESTONE_EVENT_ID)).toHaveLength(1)

  const measured = h.measureFirstDeliveryAcceptance()
  expect(measured).toEqual({ passed: 4, total: 4, failed: [] })
})

vitestIt.skipIf(process.env.PERSONA_REAL_E2E !== '1')(
  'real runner opt-in: startFirstDelivery seals ready (PERSONA_REAL_E2E=1)',
  async () => {
    const dir = mkdtempSync(join(tmpdir(), 'persona-fd-real-'))
    dirs.push(dir)
    process.env.PERSONA_HOME = dir
    process.env.PERSONA_REAL_CLI = '1'
    const h = host(join(dir, 'persona.db'))
    await h.completeOnboarding({ ...ONBOARDING, runnerChoices: ['claude'] })
    const start = await h.startFirstDelivery(scope)
    expect(start.started).toBe(true)
    const ready = h.getFirstDelivery(scope)
    expect(ready.status).toBe('ready')
    expect(h.listTasks(scope).find(card => card.id === ready.ticketId)?.stage).toBe('done')
    const events = h.listMessages({
      ...scope, streamKind: 'channel', ownerId: 'geral', actorId: 'owner', afterSeq: 0, limit: 40,
    }).events
    expect(events.some(item => item.source === 'runner' && item.body.trim().length > 0)).toBe(true)
    expect(events.filter(item => item.id === FIRST_DELIVERY_MILESTONE_EVENT_ID)).toHaveLength(1)
  },
  150_000,
)
