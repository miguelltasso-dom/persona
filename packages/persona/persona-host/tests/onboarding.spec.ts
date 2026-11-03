import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it } from 'vitest'
import PersonaHost from '../src/index.ts'

const roots: Context[] = []
const dirs: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => root.fiber.dispose()))
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

it('fresh PERSONA_HOME is firstUse with zero personas (no auto-seed)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'persona-fresh-'))
  dirs.push(dir)
  process.env.PERSONA_HOME = dir
  const ctx = new Context()
  roots.push(ctx)
  const h = new PersonaHost(ctx, { databasePath: join(dir, 'persona.db') })
  const personal = h.createWorkspace({ id: 'ws', name: 'Fresh', personalProjectId: 'pp' })
  const scope = { workspaceId: 'ws', projectId: personal.id }
  expect(h.getOnboarding(scope).firstUse).toBe(true)
  expect(h.listTeam(scope).personas).toEqual([])
})

it('completeOnboarding is idempotent and writes welcome without a hardcoded name', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'persona-onb-'))
  dirs.push(dir)
  process.env.PERSONA_HOME = dir
  const ctx = new Context()
  roots.push(ctx)
  const h = new PersonaHost(ctx, { databasePath: join(dir, 'persona.db') })
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
  expect(h.listTasks({ workspaceId: 'ws', projectId: 'pp' })).toEqual([])
  const page = h.listMessages({
    workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral',
    actorId: 'owner', afterSeq: 0, limit: 20,
  })
  expect(page.events.some(item => /Bem-vindos/.test(item.body))).toBe(true)
  expect(JSON.stringify(page.events)).not.toMatch(/Atlas/)
  expect(h.listMemory({ workspaceId: 'ws', projectId: 'pp' }).some(item => item.status === 'pending')).toBe(true)
  const again = await h.completeOnboarding({
    workspaceId: 'ws', personalProjectId: 'pp', displayName: 'Ana',
    team: [], templateIds: [], runnerChoices: [], cofreSeed: '',
  })
  expect(again.completed).toBe(true)
  expect(h.listPersonas({ workspaceId: 'ws', projectId: 'pp' })).toHaveLength(2)
})
