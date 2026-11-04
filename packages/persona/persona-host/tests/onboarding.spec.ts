import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect } from 'vitest'
import { bindHostFile, it } from './host-harness.ts'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const { host } = bindHostFile()

it('fresh PERSONA_HOME is firstUse with zero personas (no auto-seed)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'persona-fresh-'))
  dirs.push(dir)
  process.env.PERSONA_HOME = dir
  const h = host(join(dir, 'persona.db'))
  const personal = h.createWorkspace({ id: 'ws', name: 'Fresh', personalProjectId: 'pp' })
  const scope = { workspaceId: 'ws', projectId: personal.id }
  expect(h.getOnboarding(scope).firstUse).toBe(true)
  expect(h.listTeam(scope).personas).toEqual([])
})

it('completeOnboarding is idempotent and writes welcome without a hardcoded name', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'persona-onb-'))
  dirs.push(dir)
  process.env.PERSONA_HOME = dir
  const h = host(join(dir, 'persona.db'))
  const first = await h.completeOnboarding({
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
    cofreSeed: 'Tom de voz calmo.',
  })
  expect(first.completed).toBe(true)
  expect(first.firstUse).toBe(false)
  expect(h.getOnboarding({ workspaceId: 'ws', projectId: 'pp' }).completed).toBe(true)
  expect(h.listPersonas({ workspaceId: 'ws', projectId: 'pp' }).map(item => item.name).sort()).toEqual(['Bento', 'Guia'])
  const guia = h.listPersonas({ workspaceId: 'ws', projectId: 'pp' }).find(row => row.name === 'Guia')
  expect(guia?.systemRoles).toEqual(['coordination', 'team_manager'])
  expect(h.listTasks({ workspaceId: 'ws', projectId: 'pp' })).toHaveLength(1)
  const page = h.listMessages({
    workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral',
    actorId: 'owner', afterSeq: 0, limit: 20,
  })
  expect(page.events.find(item => item.id === 'first-delivery')?.body).toContain('Tom de voz calmo.')
  expect(page.events.some(item => /Boas-vindas! Estou aqui para coordenar a equipe/u.test(item.body))).toBe(true)
  expect(JSON.stringify(page.events)).not.toMatch(/Boas-vindas ao Persona/u)
  expect(JSON.stringify(page.events)).not.toMatch(/Atlas/)
  expect(h.listMemory({ workspaceId: 'ws', projectId: 'pp' }).some(item => item.status === 'pending')).toBe(true)
  const again = await h.completeOnboarding({
    workspaceId: 'ws', personalProjectId: 'pp', displayName: 'Ana',
    team: [], templateIds: [], runnerChoices: [], cofreSeed: '',
  })
  expect(again.completed).toBe(true)
  expect(h.listPersonas({ workspaceId: 'ws', projectId: 'pp' })).toHaveLength(2)
})

it('posts SYSTEM_WELCOME as Boas-vindas à Persona. when there is no coordination', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'persona-onb-sys-'))
  dirs.push(dir)
  process.env.PERSONA_HOME = dir
  const h = host(join(dir, 'persona.db'))
  await h.completeOnboarding({
    workspaceId: 'ws',
    personalProjectId: 'pp',
    displayName: 'Ana',
    team: [{
      name: 'Bento', title: 'Engenharia', description: 'Implementa.', personality: 'Direto.',
      instructions: 'Prove.', avatarKind: 'gallery', avatarRef: 'bento',
      runnerKind: 'dsh', runnerCli: '', runnerModel: 'default', canRecruit: false,
      systemRoles: [],
    }],
    templateIds: [],
    runnerChoices: ['dsh'],
    cofreSeed: '',
  })
  const page = h.listMessages({
    workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral',
    actorId: 'owner', afterSeq: 0, limit: 20,
  })
  expect(page.events.some(item => item.body === 'Boas-vindas à Persona.')).toBe(true)
})

it('binds runnerChoices CLI onto dsh drafts', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'persona-onb-cli-'))
  dirs.push(dir)
  process.env.PERSONA_HOME = dir
  const h = host(join(dir, 'persona.db'))
  await h.completeOnboarding({
    workspaceId: 'ws',
    personalProjectId: 'pp',
    displayName: 'Ana',
    team: [{
      name: 'Guia', title: 'Coordenação', description: 'Triagem.', personality: 'Calma.',
      instructions: 'Receba o time.', avatarKind: 'gallery', avatarRef: 'guia',
      runnerKind: 'dsh', runnerCli: '', runnerModel: 'default', canRecruit: true,
      systemRoles: ['coordination'],
    }],
    templateIds: [],
    runnerChoices: ['claude'],
    cofreSeed: '',
  })
  const guia = h.product.listPersonas('pp').find(row => row.name === 'Guia')
  expect(guia?.runner).toEqual({ kind: 'cli', cli: 'claude', model: 'default' })
})

it('AG-004: first-run has no grant; after onboarding grant → list → revoke', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'persona-onb-grant-'))
  dirs.push(dir)
  process.env.PERSONA_HOME = dir
  const h = host(join(dir, 'persona.db'))
  const first = await h.completeOnboarding({
    workspaceId: 'ws',
    personalProjectId: 'pp',
    displayName: 'Ana',
    team: [{
      name: 'Guia', title: 'Coordenação', description: 'Triagem.', personality: 'Calma.',
      instructions: 'Receba o time.', avatarKind: 'gallery', avatarRef: 'guia',
      runnerKind: 'dsh', runnerCli: '', runnerModel: 'default', canRecruit: true,
      systemRoles: ['coordination'],
    }],
    templateIds: [],
    runnerChoices: ['dsh'],
    cofreSeed: '',
  })
  expect(first.completed).toBe(true)
  const scope = { workspaceId: 'ws', projectId: 'pp' }
  expect(h.listBrainPermissions(scope)).toEqual([])
  const personaId = h.listPersonas(scope)[0]?.id
  expect(personaId).toBeDefined()
  const grant = h.grantBrainPermission({
    ...scope, id: 'g-onb', personaId: personaId!,
    action: 'reply-whatsapp', target: 'clientes-aprovados', validity: 'until-revoke',
  })
  expect(h.listBrainPermissions(scope).map(item => item.id)).toEqual(['g-onb'])
  expect(h.revokeBrainPermission({ ...scope, grantId: grant.id }).revokedAt).toBeDefined()
  expect(h.listBrainPermissions(scope).find(item => item.id === 'g-onb')?.revokedAt).toBeDefined()
})
