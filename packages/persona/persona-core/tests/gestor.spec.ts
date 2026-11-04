import { expect, it } from 'vitest'
import {
  DEFAULT_GESTOR_LIMITS,
  assembleTeamForGoal,
  assertGestorAllocate,
  assertGestorHire,
  claimGestorScope,
  applyGestorPlan,
  commentGestorPlan,
  decideGestorAction,
  gestorDecisionRows,
  formatGestorAudit,
  isGestor,
  gestorAllocate,
  gestorHire,
  gestorHolders,
  gestorReorganize,
  gestorInScope,
  gestorInitiative,
  gestorScopeKey,
  resolveGestorTie,
  teamTemplateById,
} from '../src/index.ts'
import type { GestorLimits, GestorMandate, GestorPlan, Persona, PersonaSpec } from '../src/index.ts'

const now = '2026-11-04T03:00:00.000Z'

function spec(overrides: Partial<PersonaSpec> = {}): PersonaSpec {
  return {
    name: 'Pipoca',
    avatar: { kind: 'gallery', ref: 'nina' },
    title: 'Designer',
    description: 'Peças.',
    personality: 'Leve.',
    instructions: 'Desenhe.',
    runner: { kind: 'dsh', model: 'deepseek-chat' },
    tools: { files: 'read' },
    skills: [],
    limits: { tokensPerMonth: 5_000, concurrency: 1 },
    systemRoles: [],
    canRecruit: false,
    ...overrides,
  }
}

function gestorPersona(overrides: Partial<Persona> = {}): Persona {
  return {
    ...spec({
      name: 'Atlas',
      title: 'Coordenação',
      systemRoles: ['coordination', 'team_manager'],
      canRecruit: true,
      tools: { files: 'write', recall: 'read' },
      limits: { tokensPerMonth: 50_000, concurrency: 2 },
    }),
    id: 'atlas',
    workspaceId: 'ws',
    createdAt: now,
    updatedAt: now,
    createdBy: 'miguel',
    ...overrides,
  }
}

function limits(overrides: Partial<GestorLimits> = {}): GestorLimits {
  return { ...DEFAULT_GESTOR_LIMITS, ...overrides }
}

function plan(overrides: Partial<GestorPlan> = {}): GestorPlan {
  return {
    id: 'plan-1',
    workspaceId: 'ws',
    gestorId: 'atlas',
    action: 'hire',
    scopeKey: 'site|*|Designer',
    summary: 'Atlas contratou Pipoca (Designer) para o projeto Site',
    reason: 'porque a fila de design estava com 6 tarefas',
    status: 'proposed',
    createdAt: now,
    ...overrides,
  }
}

it('makes coordination also Gestor de equipe on the suggested template and allows N holders', () => {
  const atlas = teamTemplateById('suggested-animals')?.personas.find(row => row.name === 'Atlas')
  expect(atlas?.systemRoles).toEqual(['coordination', 'team_manager'])
  const a = gestorPersona()
  const b = gestorPersona({ id: 'iris', name: 'Iris' })
  expect(isGestor(a)).toBe(true)
  expect(gestorHolders([a, b], 'ws')).toHaveLength(2)
})

it('hires within Gestor access and writes the audit reason', () => {
  const proposal = gestorHire({
    id: 'hire-1',
    gestor: gestorPersona(),
    limits: limits({ approval: 'auto_within_limits', maxPersonas: 8 }),
    spec: spec(),
    rosterCount: 3,
    spentTokens: 10_000,
    scope: { projectId: 'site', roleTitle: 'Designer' },
    createdAt: now,
    accepted: false,
  })
  expect(proposal.status).toBe('approved')
  expect(proposal.spec.name).toBe('Pipoca')
  expect(formatGestorAudit({
    gestorName: 'Atlas',
    verb: 'contratou',
    detail: 'Pipoca (Designer) para o projeto Site',
    reason: 'a fila de design estava com 6 tarefas',
  })).toBe('Atlas contratou Pipoca (Designer) para o projeto Site — porque a fila de design estava com 6 tarefas')
})

it('never creates a hire with more access than the Gestor (adversarial)', () => {
  expect(() => assertGestorHire({
    gestor: gestorPersona(),
    limits: limits(),
    spec: spec({ tools: { files: 'write', shell: 'write' } }),
    rosterCount: 1,
    spentTokens: 0,
    scope: {},
  })).toThrow('ACCESS_ESCALATION')
})

it('never grants Gestor de equipe without the explicit permit (adversarial)', () => {
  expect(() => assertGestorHire({
    gestor: gestorPersona(),
    limits: limits({ canGrantGestor: false }),
    spec: spec({ systemRoles: ['team_manager'] }),
    rosterCount: 1,
    spentTokens: 0,
    scope: {},
  })).toThrow('INVALID_GESTOR')
  expect(() => assertGestorAllocate({
    gestor: gestorPersona(),
    limits: limits({ canGrantGestor: false }),
    nextRoles: ['team_manager'],
    scope: {},
  })).toThrow('INVALID_GESTOR')
  expect(() => assertGestorAllocate({
    gestor: gestorPersona(),
    limits: limits({ canGrantGestor: true }),
    nextRoles: ['team_manager'],
    scope: {},
  })).not.toThrow()
})

it('always_ask never applies a hire without approval (adversarial)', () => {
  expect(() => gestorHire({
    id: 'hire-ask',
    gestor: gestorPersona(),
    limits: limits({ approval: 'always_ask' }),
    spec: spec(),
    rosterCount: 1,
    spentTokens: 0,
    scope: {},
    createdAt: now,
    accepted: false,
  })).toThrow('INVALID_GESTOR')
  const mandate: GestorMandate = { personaId: 'atlas', workspaceId: 'ws', limits: limits() }
  expect(decideGestorAction({
    mandate,
    plan: plan(),
    accepted: false,
    auditId: 'aud-1',
    at: now,
  }).kind).toBe('ask')
  const applied = decideGestorAction({
    mandate,
    plan: plan(),
    accepted: true,
    auditId: 'aud-2',
    at: now,
  })
  expect(applied.kind).toBe('apply')
  if (applied.kind !== 'apply') throw new Error('expected apply')
  expect(applied.plan.status).toBe('applied')
  expect(applyGestorPlan(plan()).status).toBe('applied')
  expect(() => applyGestorPlan({ ...plan(), status: 'rejected' })).toThrow('INVALID_GESTOR')
  const rows = gestorDecisionRows(applied)
  expect(rows.persist).toBe(true)
  expect(rows.plan?.status).toBe('applied')
  expect(rows.audit?.id).toBe('aud-2')
  expect(gestorDecisionRows({ kind: 'refuse', why: 'no' }).persist).toBe(false)
})

it('respects max personas and budget (adversarial)', () => {
  expect(() => assertGestorHire({
    gestor: gestorPersona(),
    limits: limits({ maxPersonas: 3 }),
    spec: spec(),
    rosterCount: 3,
    spentTokens: 0,
    scope: {},
  })).toThrow('INVALID_GESTOR')
  expect(() => assertGestorHire({
    gestor: gestorPersona(),
    limits: limits({ approval: 'auto_within_limits', budgetTokens: 12_000 }),
    spec: spec({ limits: { tokensPerMonth: 5_000 } }),
    rosterCount: 1,
    spentTokens: 10_000,
    scope: {},
  })).toThrow('INVALID_GESTOR')
})

it('caps tools and engines to the mandate (adversarial)', () => {
  expect(() => assertGestorHire({
    gestor: gestorPersona(),
    limits: limits({ allowedTools: ['files'] }),
    spec: spec({ tools: { files: 'read', recall: 'read' } }),
    rosterCount: 1,
    spentTokens: 0,
    scope: {},
  })).toThrow('INVALID_GESTOR')
  expect(() => assertGestorHire({
    gestor: gestorPersona({ runner: { kind: 'dsh', model: 'deepseek-chat' } }),
    limits: limits({ allowedEngines: ['dsh'] }),
    spec: spec({ runner: { kind: 'cli', cli: 'claude', model: 'haiku' } }),
    rosterCount: 1,
    spentTokens: 0,
    scope: {},
  })).toThrow('INVALID_GESTOR')
})

it('second Gestor comments; human tie picks the winner', () => {
  const first = plan({ id: 'p-atlas', gestorId: 'atlas' })
  const note = commentGestorPlan({
    open: [first],
    scopeKey: first.scopeKey,
    commenterId: 'iris',
    workspaceId: 'ws',
    commentId: 'p-iris',
    comment: 'prefiro alocar a Nina',
    at: now,
  })
  expect(note.kind).toBe('comment')
  if (note.kind !== 'comment') throw new Error('expected comment')
  expect(note.plan.status).toBe('commented')
  expect(note.plan.commentOnId).toBe('p-atlas')
  const tie = resolveGestorTie({ plans: [first, note.plan], chosenId: 'p-iris' })
  expect(tie.winner.id).toBe('p-iris')
  expect(tie.rejected.map(row => row.id)).toEqual(['p-atlas'])
  expect(tie.rejected[0]?.status).toBe('rejected')
})

it('keeps two Gestores on different scopes from colliding; same scope conflicts', () => {
  expect(gestorInScope(limits({ projectIds: ['site'] }), { projectId: 'ops' })).toBe(false)
  expect(gestorInScope(limits({ projectIds: ['site'] }), { projectId: 'site' })).toBe(true)
  const first = plan({ id: 'p-atlas', gestorId: 'atlas' })
  expect(claimGestorScope([first], gestorScopeKey({ projectId: 'site', roleTitle: 'Designer' })))
    .toEqual({ kind: 'conflict', existingPlanId: 'p-atlas' })
  expect(claimGestorScope([first], gestorScopeKey({ projectId: 'ops', roleTitle: 'Designer' })))
    .toEqual({ kind: 'claim' })
})

it('assembles a team, board and sprint 1 from a goal sentence', () => {
  const pack = assembleTeamForGoal({
    goal: 'Monte um time para o Site — setores: criação, conteúdo',
    projectId: 'site',
    sprintId: 'sp1',
    at: now,
  })
  expect(pack.structure.personas.length).toBeGreaterThanOrEqual(3)
  expect(pack.workflow.projectId).toBe('site')
  expect(pack.sprint.name).toBe('Sprint 1')
  expect(pack.sprint.objective).toContain('Site')
})

it('allocates a persona inside the mandate and refuses a project outside scope', () => {
  const holder = gestorPersona()
  const seat = gestorAllocate({
    gestor: holder,
    limits: limits({ projectIds: ['site'], sectorIds: ['criacao'] }),
    scope: { projectId: 'site', sectorId: 'criacao' },
    personaId: 'nina',
    projectIds: ['site'],
    channelIds: ['geral'],
    sectorId: 'criacao',
    reportsTo: 'atlas',
  })
  expect(seat.projectIds).toEqual(['site'])
  expect(seat.reportsTo).toBe('atlas')
  expect(() => gestorAllocate({
    gestor: holder,
    limits: limits({ projectIds: ['site'] }),
    scope: { projectId: 'site' },
    personaId: 'nina',
    projectIds: ['ops'],
  })).toThrow('INVALID_GESTOR')
})

it('reorganizes work, pauses idle with notice, and refuses autonomy above the ceiling', () => {
  const holder = gestorPersona()
  const moved = gestorReorganize({
    gestor: holder,
    limits: limits({ approval: 'auto_within_limits' }),
    scope: { projectId: 'site' },
    kind: 'move_work',
    targetPersonaId: 'nina',
    notice: 'fila da Nina está vazia',
    ticketIds: ['t-1'],
  })
  expect(moved.ticketIds).toEqual(['t-1'])
  expect(() => gestorReorganize({
    gestor: holder,
    limits: limits(),
    scope: {},
    kind: 'pause_idle',
    targetPersonaId: 'sol',
    notice: '',
  })).toThrow('INVALID_GESTOR')
  expect(() => gestorReorganize({
    gestor: holder,
    limits: limits(),
    scope: {},
    kind: 'set_autonomy',
    targetPersonaId: 'bento',
    notice: 'teto do setor',
    nextAutonomy: 'act',
    ceiling: 'propose',
  })).toThrow('INVALID_GESTOR')
  const ok = gestorReorganize({
    gestor: holder,
    limits: limits(),
    scope: {},
    kind: 'set_autonomy',
    targetPersonaId: 'bento',
    notice: 'dentro do teto',
    nextAutonomy: 'propose',
    ceiling: 'propose',
  })
  expect(ok.nextAutonomy).toBe('propose')
})

it('raises initiative from a full queue and an uncovered sector', () => {
  const hits = gestorInitiative({
    queues: [{ personaId: 'nina', sectorId: 'sec-design', open: 6 }],
    health: {
      score: 40,
      items: [{
        kind: 'sector_without_coverage',
        subjectId: 'sec-ops',
        message: 'Ninguém cobre Operações.',
      }],
    },
  })
  expect(hits.some(row => row.kind === 'queue_full' && row.reason.includes('6'))).toBe(true)
  expect(hits.some(row => row.kind === 'sector_uncovered')).toBe(true)
})
