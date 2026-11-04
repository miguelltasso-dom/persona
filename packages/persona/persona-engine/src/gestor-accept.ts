/**
 * GES-6 machine checklist (MAESTRO.md §Aceite). Probe / host call this;
 * they do not reassemble the three bullets.
 */

import {
  DEFAULT_GESTOR_LIMITS,
  assembleTeamForGoal,
  assertGestorHire,
  claimGestorScope,
  decideGestorAction,
  formatGestorAudit,
  gestorScopeKey,
  type GestorMandate,
  type GestorPlan,
  type Persona,
  type PersonaSpec,
} from '@deepseek-ai/dsh-persona-core'

export interface GestorAcceptance {
  readonly passed: number
  readonly total: 3
  readonly failed: readonly string[]
}

const AT = '2026-11-04T03:00:00.000Z'

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

function gestor(): Persona {
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
    createdAt: AT,
    updatedAt: AT,
    createdBy: 'miguel',
  }
}

function plan(overrides: Partial<GestorPlan> = {}): GestorPlan {
  return {
    id: 'plan-1',
    workspaceId: 'ws',
    gestorId: 'atlas',
    action: 'hire',
    scopeKey: gestorScopeKey({ projectId: 'site', roleTitle: 'Designer' }),
    summary: 'contratar Pipoca',
    reason: 'a fila de design estava com 6 tarefas',
    status: 'proposed',
    createdAt: AT,
    ...overrides,
  }
}

function mandate(approval: GestorMandate['limits']['approval'] = 'always_ask'): GestorMandate {
  return {
    personaId: 'atlas',
    workspaceId: 'ws',
    limits: { ...DEFAULT_GESTOR_LIMITS, approval, canGrantGestor: false },
  }
}

function refusedHire(): boolean {
  try {
    assertGestorHire({
      gestor: gestor(),
      limits: { ...DEFAULT_GESTOR_LIMITS, canGrantGestor: false },
      spec: spec({ systemRoles: ['team_manager'] }),
      rosterCount: 1,
      spentTokens: 0,
      scope: {},
    })
    return false
  } catch (error) {
    return error instanceof Error && error.message === 'INVALID_GESTOR'
  }
}

/**
 * Three v1 bullets: assemble Site + sprint 1; limits / always_ask; scopes + audit.
 * @returns Passed count and failed bullet ids.
 */
export function measureGestorAcceptance(): GestorAcceptance {
  const failed: string[] = []
  const pack = assembleTeamForGoal({
    goal: 'Monte um time para o Site — setores: criação, conteúdo',
    projectId: 'site',
    sprintId: 'sp1',
    at: AT,
  })
  if (
    pack.structure.personas.length < 3
    || pack.workflow.projectId !== 'site'
    || pack.sprint.name !== 'Sprint 1'
    || !pack.sprint.objective.includes('Site')
  ) {
    failed.push('assemble-site')
  }

  const asked = decideGestorAction({
    mandate: mandate('always_ask'),
    plan: plan(),
    accepted: false,
    auditId: 'a1',
    at: AT,
  })
  if (!refusedHire() || asked.kind !== 'ask') failed.push('limits')

  const site = plan()
  const opsKey = gestorScopeKey({ projectId: 'ops', roleTitle: 'Designer' })
  const otherScope = claimGestorScope([site], opsKey)
  const sameScope = claimGestorScope([site], site.scopeKey)
  const audit = formatGestorAudit({
    gestorName: 'Atlas',
    verb: 'contratou',
    detail: 'Pipoca (Designer) para o projeto Site',
    reason: 'a fila de design estava com 6 tarefas',
  })
  if (otherScope.kind !== 'claim' || sameScope.kind !== 'conflict' || !audit.includes('porque')) {
    failed.push('scopes-audit')
  }

  return { passed: 3 - failed.length, total: 3, failed }
}

/** Same score as {@link measureGestorAcceptance}; name for `@Remote measureGestorV1`. */
export function measureGestorV1(): GestorAcceptance {
  return measureGestorAcceptance()
}
