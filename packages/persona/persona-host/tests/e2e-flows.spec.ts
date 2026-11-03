import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const { host } = bindHostFile()

function seed(h: PersonaHost, withCoord = true): void {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({
    id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner',
  })
  if (withCoord) {
    h.createPersona({
      workspaceId: 'ws', projectId: 'pp', id: 'coord', name: 'Guia', title: 'Coordenação',
      description: 'Triagem.', personality: 'Calma.', instructions: 'Aceite pedidos claros.',
      avatarKind: 'gallery', avatarRef: 'guia', runnerKind: 'dsh', runnerCli: '',
      runnerModel: 'm', canRecruit: true, createdBy: 'ana',
    })
    h.product.updatePersona({
      ...h.product.getPersona('coord')!,
      systemRoles: ['coordination'],
    }, 'pp')
  }
  h.createPersona({
    workspaceId: 'ws', projectId: 'pp', id: 'bento', name: 'Bento', title: 'Engenharia',
    description: 'Implementa.', personality: 'Direto.', instructions: 'Prove.',
    avatarKind: 'gallery', avatarRef: 'bento', runnerKind: 'dsh', runnerCli: '',
    runnerModel: 'm', canRecruit: true, createdBy: 'ana',
  })
  h.createChannel({ id: 'geral', workspaceId: 'ws', projectId: 'pp', name: 'geral', topic: '' })
}

const scope = { workspaceId: 'ws', projectId: 'pp' }

it('DM with a persona replies without a ticket', async () => {
  const h = host()
  seed(h)
  h.createDm({ id: 'dm-bento', workspaceId: 'ws', projectId: 'pp', participantA: 'ana', participantB: 'bento' })
  h.postMessage({
    id: 'm-dm', ...scope, streamKind: 'dm', ownerId: 'dm-bento',
    body: 'oi, tudo bem?', actorId: 'ana', subjectId: 'dm-1', occurredAt: '2026-11-03T18:00:00.000Z',
  })
  await h.orchestration.flush('pp')
  const page = h.listMessages({
    ...scope, streamKind: 'dm', ownerId: 'dm-bento', actorId: 'ana', afterSeq: 0, limit: 20,
  })
  expect(h.listTasks(scope)).toEqual([])
  expect(page.events.some(item => item.actorId === 'bento' && item.source === 'host')).toBe(true)
})

it('@mention without a coordinator replies as the mentioned persona', async () => {
  const h = host()
  seed(h, false)
  const bento = h.product.getPersona('bento')!
  h.product.updatePersona({ ...bento, systemRoles: [] }, 'pp')
  expect(h.product.listPersonas('pp').some(item => item.systemRoles.includes('coordination'))).toBe(false)
  h.postMessage({
    id: 'm-at', ...scope, streamKind: 'channel', ownerId: 'geral',
    body: '@Bento oi, tudo bem?', actorId: 'ana', subjectId: 't', occurredAt: '2026-11-03T18:00:00.000Z',
  })
  await h.orchestration.flush('pp')
  const page = h.listMessages({
    ...scope, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 20,
  })
  expect(page.events.some(item => item.actorId === 'bento')).toBe(true)
  expect(h.listTasks(scope)).toEqual([])
})

it('handoff posts as coordinator then the executor', async () => {
  const h = host()
  seed(h)
  h.postMessage({
    id: 'm-hand', ...scope, streamKind: 'channel', ownerId: 'geral',
    body: 'preciso de um README no projeto', actorId: 'ana', subjectId: 't',
    occurredAt: '2026-11-03T18:00:00.000Z',
  })
  await h.orchestration.flush('pp')
  const page = h.listMessages({
    ...scope, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 50,
  })
  expect(page.events.some(item => item.actorId === 'coord' && /Bento assume o README/i.test(item.body))).toBe(true)
  expect(page.events.some(item => item.actorId === 'bento')).toBe(true)
})

it('persona_propose hire card → approve → persona on the rail', () => {
  const h = host()
  seed(h)
  const hire = h.proposeHire({
    ...scope, id: 'ap-sol', creatorPersonaId: 'coord', name: 'Sol', title: 'Suporte', description: 'Atende.',
  })
  expect(hire.status).toBe('pending')
  expect(h.listApprovals(scope).some(item => item.kind === 'hire' && item.id === 'ap-sol')).toBe(true)
  expect(h.decideApproval({ ...scope, id: 'ap-sol', kind: 'hire', accept: true }).status).toBe('approved')
  expect(h.listPersonas(scope).some(item => item.id === 'hire:ap-sol' && item.name === 'Sol')).toBe(true)
})

it('Cofre restriction appears in Contexto usado', async () => {
  const h = host()
  seed(h)
  h.vault.createRecord({
    id: 'v-secret', workspaceId: 'ws', projectId: 'pp', kind: 'constraint',
    body: 'Nunca citar o CNPJ.', authorId: 'ana',
    visibility: { kind: 'persona', personaId: 'bento' },
  })
  h.postMessage({
    id: 'm-ctx', ...scope, streamKind: 'channel', ownerId: 'geral',
    body: 'oi, tudo bem?', actorId: 'ana', subjectId: 't', occurredAt: '2026-11-03T18:00:00.000Z',
  })
  await h.orchestration.flush('pp')
  const used = h.listUsedContext({ ...scope, eventId: 'm-ctx' })
  const secret = used.records.find(item => item.id === 'v-secret')
  expect(secret?.restricted).toBe(true)
  expect(secret?.required).toBe(true)
  expect(secret?.body).toBe('')
})

it('initiative routine generates a real proposal', () => {
  const h = host()
  seed(h)
  h.setAutonomy({
    ...scope, personaId: 'bento', mode: 'propose', proposalBudget: 3, tokenBudget: 1, executionBudget: 1,
    silenceStart: '', silenceEnd: '',
  })
  h.scheduleRoutine({
    ...scope, id: 'initiative:bento', runId: 'run-1', scheduledFor: '2020-01-01T00:00:00.000Z',
  })
  const tick = h.tickProactivity({ ...scope, leaseUntil: '2099-01-01T00:00:00.000Z', stallAfterMs: 60_000 })
  expect(tick.initiatives).toBe(1)
  expect(h.getWhileAway(scope).events.some(item => item.kind === 'proposal')).toBe(true)
})

it('Enquanto você estava fora keeps real events after close/open', () => {
  const dir = mkdtempSync(join(tmpdir(), 'persona-away-'))
  dirs.push(dir)
  const path = join(dir, 'persona.db')
  const first = host(path)
  seed(first)
  first.setAutonomy({
    ...scope, personaId: 'bento', mode: 'propose', proposalBudget: 3, tokenBudget: 1, executionBudget: 1,
    silenceStart: '', silenceEnd: '',
  })
  first.fireProactiveEvent({ ...scope, title: 'PR aberto', subjectId: 'pr-9' })
  first.store.close()
  const second = host(path)
  const away = second.getWhileAway(scope)
  expect(away.events.some(item => /PR aberto/i.test(item.body))).toBe(true)
})

it('talk resolve never sends permissionMode prompt for a CLI persona', async () => {
  const h = host()
  seed(h)
  const seen: Array<{ permissionMode?: string; purpose?: string; projectId?: string }> = []
  h.product.updatePersona({
    ...h.product.getPersona('coord')!,
    runner: { kind: 'cli', cli: 'claude', model: 'haiku' },
  }, 'pp')
  h.orchestration.runnerFactory = async (request) => {
    seen.push({
      ...(request === undefined ? {} : {
        permissionMode: request.permissionMode, purpose: request.purpose, projectId: request.projectId,
      }),
    })
    const { createFakeRunner } = await import('@deepseek-ai/dsh-persona-runners')
    return createFakeRunner()
  }
  h.postMessage({
    id: 'm-talk', ...scope, streamKind: 'channel', ownerId: 'geral',
    body: 'oi, tudo bem?', actorId: 'ana', subjectId: 't', occurredAt: '2026-11-03T18:00:00.000Z',
  })
  await h.orchestration.flush('pp')
  expect(seen.some(item => item.permissionMode === 'prompt')).toBe(false)
  expect(seen.some(item => item.purpose === 'talk' && item.permissionMode === 'deny' && item.projectId === 'pp')).toBe(true)
  expect(h.orchestration.stages.some(item => item.name === 'triage:talk')).toBe(true)
})

it('typed Remote errors stay codes, not stacks', () => {
  const h = host()
  seed(h)
  expect(() => h.getTurnContext({
    ...scope, ticketId: 'missing', command: 'stop', reason: '',
  })).toThrow('ticket-not-found')
})
