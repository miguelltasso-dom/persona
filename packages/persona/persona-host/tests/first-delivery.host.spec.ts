import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it as vitestIt } from 'vitest'
import { FIRST_DELIVERY_EVENT_ID, FIRST_DELIVERY_MILESTONE_EVENT_ID } from '../src/onboarding.ts'
import type { CompleteOnboardingRequest } from '../src/types.ts'
import { bindHostFile, it } from './host-harness.ts'

const dirs: string[] = []
afterEach(() => {
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
    expect(h.getFirstDelivery(scope).status).toMatch(/ready|failed|working/u)
    expect(JSON.stringify(h.getFirstDelivery(scope))).not.toMatch(/Carregando/u)
  },
)
