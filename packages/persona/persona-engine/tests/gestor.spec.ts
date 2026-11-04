import { expect, it } from 'vitest'
import type { GestorMandate, GestorPlan, Persona, PersonaSpec } from '@deepseek-ai/dsh-persona-core'
import { DEFAULT_GESTOR_LIMITS } from '../../persona-core/src/index.ts'
import { emitGestorPropose, measureGestorAcceptance, measureGestorMultiAcceptance, measureGestorToolsAcceptance, measureGestorV1, proposeGestorChannelBody, runAssembleTeam, runGestorAllocate, runGestorAssemble, runGestorComment, runGestorHire, runGestorReorganize, runGestorTie } from '../src/index.ts'

const now = '2026-11-04T03:00:00.000Z'

const gestorPersona: Persona = {
  id: 'atlas',
  workspaceId: 'ws',
  name: 'Atlas',
  avatar: { kind: 'gallery', ref: 'atlas' },
  title: 'Coordenação',
  description: '',
  personality: '',
  instructions: '',
  runner: { kind: 'dsh', model: 'deepseek-chat' },
  tools: { files: 'write' },
  skills: [],
  limits: { tokensPerMonth: 50_000 },
  systemRoles: ['coordination', 'team_manager'],
  canRecruit: true,
  createdAt: now,
  updatedAt: now,
  createdBy: 'miguel',
}

const spec: PersonaSpec = {
  name: 'Pipoca',
  avatar: { kind: 'gallery', ref: 'nina' },
  title: 'Designer',
  description: '',
  personality: '',
  instructions: '',
  runner: { kind: 'dsh', model: 'deepseek-chat' },
  tools: { files: 'read' },
  skills: [],
  limits: { tokensPerMonth: 4_000 },
  systemRoles: [],
  canRecruit: false,
}

const plan: GestorPlan = {
  id: 'plan-1',
  workspaceId: 'ws',
  gestorId: 'atlas',
  action: 'hire',
  scopeKey: 'site|*|Designer',
  summary: 'contratar Pipoca',
  reason: 'porque a fila estava com 6 tarefas',
  status: 'proposed',
  createdAt: now,
}

it('asks when always_ask and applies after accept', () => {
  const mandate: GestorMandate = {
    personaId: 'atlas',
    workspaceId: 'ws',
    limits: DEFAULT_GESTOR_LIMITS,
  }
  const pending = runGestorHire({
    mandate,
    gestor: gestorPersona,
    plan,
    spec,
    rosterCount: 2,
    spentTokens: 0,
    accepted: false,
    auditId: 'a1',
    hireId: 'h1',
    at: now,
  })
  expect(pending.decision.kind).toBe('ask')
  expect(pending.proposal).toBeUndefined()
  const done = runGestorHire({
    mandate,
    gestor: gestorPersona,
    plan,
    spec,
    rosterCount: 2,
    spentTokens: 0,
    accepted: true,
    auditId: 'a2',
    hireId: 'h2',
    at: now,
  })
  expect(done.decision.kind).toBe('apply')
  if (done.decision.kind !== 'apply') throw new Error('expected apply')
  expect(done.decision.plan.status).toBe('applied')
  expect(done.proposal?.spec.name).toBe('Pipoca')
})

it('allocate and reorganize apply the plan after accept (GES-2)', () => {
  const mandate: GestorMandate = {
    personaId: 'atlas',
    workspaceId: 'ws',
    limits: DEFAULT_GESTOR_LIMITS,
  }
  const allocated = runGestorAllocate({
    mandate,
    gestor: gestorPersona,
    plan: { ...plan, action: 'allocate', id: 'plan-a' },
    personaId: 'nina',
    projectIds: ['site'],
    accepted: true,
    auditId: 'aa',
    at: now,
  })
  expect(allocated.decision.kind).toBe('apply')
  if (allocated.decision.kind !== 'apply') throw new Error('expected apply')
  expect(allocated.decision.plan.status).toBe('applied')
  expect(allocated.allocation?.personaId).toBe('nina')
  const changed = runGestorReorganize({
    mandate,
    gestor: gestorPersona,
    plan: { ...plan, action: 'reorganize', id: 'plan-r' },
    kind: 'pause_idle',
    targetPersonaId: 'nina',
    notice: 'sem fila há 3 dias',
    accepted: true,
    auditId: 'ar',
    at: now,
  })
  expect(changed.decision.kind).toBe('apply')
  if (changed.decision.kind !== 'apply') throw new Error('expected apply')
  expect(changed.decision.plan.status).toBe('applied')
})

it('comments when another Gestor already claimed the scope (adversarial)', () => {
  const mandate: GestorMandate = {
    personaId: 'iris',
    workspaceId: 'ws',
    limits: { ...DEFAULT_GESTOR_LIMITS, approval: 'auto_within_limits' },
  }
  const hit = runGestorHire({
    mandate,
    gestor: { ...gestorPersona, id: 'iris', name: 'Iris' },
    plan: { ...plan, id: 'plan-2', gestorId: 'iris' },
    spec,
    rosterCount: 2,
    spentTokens: 0,
    accepted: false,
    auditId: 'a3',
    hireId: 'h3',
    at: now,
    openPlans: [plan],
  })
  expect(hit.decision.kind).toBe('conflict')
  if (hit.decision.kind !== 'conflict') throw new Error('expected conflict')
  expect(hit.decision.commentPlan?.status).toBe('commented')
  expect(hit.decision.commentPlan?.commentOnId).toBe('plan-1')
  expect(hit.decision.commentPlan?.gestorId).toBe('iris')
})

it('second Gestor comments and a human tie picks the winner', () => {
  const note = runGestorComment({
    open: [plan],
    scopeKey: plan.scopeKey,
    commenterId: 'iris',
    workspaceId: 'ws',
    commentId: 'plan-iris',
    comment: 'prefiro a Nina',
    at: now,
  })
  expect(note.kind).toBe('comment')
  if (note.kind !== 'comment') throw new Error('expected comment')
  const tie = runGestorTie([plan, note.plan], 'plan-iris')
  expect(tie.winner.id).toBe('plan-iris')
  expect(tie.rejected[0]?.id).toBe('plan-1')
})

it('assembles a team plus sprint 1 from a goal', () => {
  const pack = runAssembleTeam('Monte um time para o Site', 'site', 'sp1', now)
  expect(pack.sprint.name).toBe('Sprint 1')
  expect(pack.structure.personas.length).toBeGreaterThan(0)
  const reuse = runAssembleTeam('Monte um time para o Site', 'site', 'sp1', now, [{ personaId: 'guia', function: 'Coordenação' }])
  expect(reuse.reuse).toEqual([{ personaId: 'guia', function: 'Coordenação' }])
  expect(reuse.hire.map(row => row.title)).not.toContain('Coordenação')
  const mandate: GestorMandate = {
    personaId: 'atlas',
    workspaceId: 'ws',
    limits: DEFAULT_GESTOR_LIMITS,
  }
  const pending = runGestorAssemble({
    mandate,
    plan: { ...plan, action: 'assemble', id: 'plan-s' },
    goal: 'Monte um time para o Site',
    projectId: 'site',
    sprintId: 'sp1',
    accepted: false,
    auditId: 'as1',
    at: now,
  })
  expect(pending.decision.kind).toBe('ask')
  expect(pending.assemble).toBeUndefined()
  const done = runGestorAssemble({
    mandate,
    plan: { ...plan, action: 'assemble', id: 'plan-s' },
    goal: 'Monte um time para o Site',
    projectId: 'site',
    sprintId: 'sp1',
    accepted: true,
    auditId: 'as2',
    at: now,
    existingFunctions: [{ personaId: 'guia', function: 'Coordenação' }],
  })
  expect(done.decision.kind).toBe('apply')
  if (done.decision.kind !== 'apply') throw new Error('expected apply')
  expect(done.decision.plan.status).toBe('applied')
  expect(done.assemble?.sprint.name).toBe('Sprint 1')
  expect(done.assemble?.reuse).toEqual(reuse.reuse)
  expect(done.assemble?.hire).toEqual(reuse.hire)
  expect(proposeGestorChannelBody(plan)).toBe('contratar Pipoca\n\n[[gestor-plan:plan-1]]')
  const posted = emitGestorPropose({ plan, threadId: 'geral', at: now })
  expect(posted.channelBody).toContain('[[gestor-plan:plan-1]]')
  expect(posted.activity.personaId).toBe('atlas')
  expect(posted.activity.status).toBe('waiting')
  expect(posted.activity.kind).toBe('hire')
  const allocated = emitGestorPropose({
    plan: { ...plan, id: 'plan-a', action: 'allocate', summary: 'alocar Nina' },
    threadId: 'geral',
    at: now,
  })
  expect(allocated.activity.kind).toBe('command')
  const assembled = emitGestorPropose({
    plan: { ...plan, id: 'plan-s', action: 'assemble', summary: 'montar Site' },
    threadId: 'geral',
    at: now,
  })
  expect(assembled.activity.kind).toBe('hire')
})

it('scores the three MAESTRO aceite bullets', () => {
  const scored = measureGestorAcceptance()
  expect(scored).toEqual({ passed: 3, total: 3, failed: [] })
  expect(measureGestorV1()).toEqual(scored)
  expect(measureGestorToolsAcceptance()).toEqual({ passed: 4, total: 4, failed: [] })
  expect(measureGestorMultiAcceptance()).toEqual({ passed: 3, total: 3, failed: [] })
})
