/**
 * GES-6 (MAESTRO.md §Aceite) — host acceptance on the REAL PersonaHost (in-memory SQLite), no browser, no AI.
 * Goes through the Remote surface the UI uses (`proposeGestor*`, `approveGestorPlan`, `setGestorLimits`, …) and then
 * checks what ACTUALLY exists afterwards (personas, boards, sprints), not just the plan row.
 * App layer (plan card, editor, captures): {@link ./real-gestor-app.spec.ts}.
 */
import { describe, expect, it as vitestIt } from 'vitest'
import PersonaHost from '../../persona-host/src/index.ts'
import { bindHostFile, HOST_TEST_TIMEOUT_MS, it } from '../../persona-host/tests/host-harness.ts'

const { host } = bindHostFile('2026-11-03T15:00:00.000Z')

/** Known product bug/gap: asserts the REQUIRED behaviour, fails today (`it.fails`), flips red when fixed. */
function bug(owner: string, title: string, fn: () => unknown): void {
  vitestIt.fails(`[BUG→${owner}] ${title}`, fn, HOST_TEST_TIMEOUT_MS)
}

const WS = { workspaceId: 'ws' } as const
const SITE = { workspaceId: 'ws', projectId: 'site' } as const

function gestor(h: PersonaHost, id: string, name: string, projectId = 'pp'): void {
  h.createPersona({
    workspaceId: 'ws', projectId, id, name, title: 'Coordenação', description: 'Monta equipes.', personality: 'Calma.',
    instructions: 'Despache.', avatarKind: 'gallery', avatarRef: name.toLowerCase(), runnerKind: 'dsh', runnerCli: '',
    runnerModel: 'm', canRecruit: true, createdBy: 'ana', systemRoles: ['team_manager'],
  })
}

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createMember({ id: 'bia', workspaceId: 'ws', projectId: 'pp', displayName: 'Bia', handle: 'bia', role: 'member' })
  h.createProject({ id: 'site', workspaceId: 'ws', name: 'Site', description: 'Site da empresa' })
  gestor(h, 'atlas', 'Atlas')
  h.sessionMemberId = 'ana'
}

const specOf = (over: Partial<Parameters<PersonaHost['proposeGestorHire']>[0]['spec']> = {}) => ({
  name: 'Pipoca', title: 'Designer', description: 'Peças.', personality: 'Leve.', instructions: 'Desenhe.',
  runnerKind: 'dsh' as const, runnerCli: '', runnerModel: 'm', tools: {} as Record<string, 'none' | 'read' | 'write'>,
  systemRoles: [] as never[], canRecruit: false, tokensPerMonth: 0, ...over,
})

const limits = (over: Partial<Parameters<PersonaHost['setGestorLimits']>[0]> = {}) => ({
  workspaceId: 'ws', personaId: 'atlas', approval: 'always_ask' as const, maxPersonas: 5, budgetTokens: 100_000,
  allowedTools: ['read'], allowedEngines: ['dsh'], sectorIds: [], projectIds: [], canGrantGestor: false, ...over,
})

const personaIds = (h: PersonaHost, projectId: string): string[] =>
  h.listPersonas({ workspaceId: 'ws', projectId }).map(row => row.id)

let seq = 0
const planId = (): string => `plan-${String(++seq)}`

describe('GES-1 — "monte um time para o Site": plano → aprovar → equipe, fluxo Site e sprint 1', () => {
  it('[GES-1a] o pedido gera um plano PENDENTE com o que será feito; nada é criado antes de Aprovar', () => {
    const h = host()
    seed(h)
    const before = personaIds(h, 'site')
    const out = h.proposeGestorAssemble({ ...SITE, gestorId: 'atlas', id: planId(), goal: 'Monte um time para o Site' })
    expect(out.plan.status).toBe('proposed')
    expect(out.plan.action).toBe('assemble')
    expect(out.plan.summary).toMatch(/contratar \d+ personas/u)
    expect(out.preview.personaTitles.length).toBeGreaterThanOrEqual(1)
    expect(out.preview.workflowId).toBe('site')
    expect(out.preview.sprintName).toBe('Sprint 1')
    expect(personaIds(h, 'site'), 'proposta não pode contratar').toEqual(before)
    expect(h.listGestorPlans(WS).some(row => row.id === out.plan.id && row.status === 'proposed')).toBe(true)
  })

  it('[GES-1a] pedido sem objetivo ("monte um time") é recusado, não vira plano vazio', () => {
    const h = host()
    seed(h)
    expect(() => h.proposeGestorAssemble({ ...SITE, gestorId: 'atlas', id: planId(), goal: '   ' })).toThrow()
    expect(h.listGestorPlans(WS).filter(row => row.action === 'assemble')).toEqual([])
  })

  bug('Anvil+Forge', '[GES-1b] APROVAR o plano de montar equipe cria as personas no projeto Site, o quadro com fluxo Site e a Sprint 1 planejada — hoje só marca o plano como "applied" (applyEnvelope não trata `assemble`)', () => {
    const h = host()
    seed(h)
    h.setGestorLimits(limits({ maxPersonas: 6, allowedTools: ['read', 'write'] }))
    const out = h.proposeGestorAssemble({ ...SITE, gestorId: 'atlas', id: planId(), goal: 'Monte um time para o Site' })
    expect(h.approveGestorPlan({ ...WS, planId: out.plan.id }).status).toBe('applied')
    const created = personaIds(h, 'site')
    expect(created.length, 'personas criadas no projeto Site').toBe(out.preview.personaTitles.length)
    expect(h.getProjectBoard(SITE).workflow.template, 'quadro com o fluxo Site').toBe('site')
    expect(h.listSprints(SITE).some(sprint => sprint.name === 'Sprint 1'), 'Sprint 1 planejada').toBe(true)
  })
})

describe('GES-2 — limites e aprovação (adversarial)', () => {
  it('[GES-2a] always_ask: a contratação só existe DEPOIS de Aprovar; Recusar nunca contrata', () => {
    const h = host()
    seed(h)
    const pending = h.proposeGestorHire({ ...WS, id: planId(), gestorId: 'atlas', spec: specOf(), reason: 'fila de design cheia', projectId: 'site' })
    expect(pending.status).toBe('proposed')
    expect(personaIds(h, 'site')).not.toContain('pipoca')
    const declined = h.proposeGestorHire({ ...WS, id: planId(), gestorId: 'atlas', spec: specOf({ name: 'Recusada', title: 'Outra' }), reason: 'teste', projectId: 'site' })
    h.rejectGestorPlan({ ...WS, planId: declined.id })
    expect(h.approveGestorPlan({ ...WS, planId: pending.id }).status).toBe('applied')
    const names = h.listPersonas(SITE).map(row => row.name)
    expect(names).toContain('Pipoca')
    expect(names).not.toContain('Recusada')
  })

  it('[GES-2b] sem "pode conceder Gestor", contratar alguém com a função Gestor é recusado (auto e com aprovação) e ninguém é criado', () => {
    const h = host()
    seed(h)
    h.setGestorLimits(limits({ approval: 'auto_within_limits' }))
    const greedy = specOf({ name: 'Chefe', title: 'Gestora', systemRoles: ['team_manager'] as never[] })
    expect(() => h.proposeGestorHire({ ...WS, id: planId(), gestorId: 'atlas', spec: greedy, reason: 'quero uma gestora', projectId: 'site' })).toThrow()
    expect(h.listPersonas(SITE).map(row => row.name)).not.toContain('Chefe')
    h.setGestorLimits(limits({ approval: 'always_ask' }))
    const queued = h.proposeGestorHire({ ...WS, id: planId(), gestorId: 'atlas', spec: greedy, reason: 'quero uma gestora', projectId: 'site' })
    expect(() => h.approveGestorPlan({ ...WS, planId: queued.id })).toThrow()
    expect(h.listPersonas(SITE).map(row => row.name)).not.toContain('Chefe')
  })

  it('[GES-2c] persona com mais ferramentas que o teto do Gestor é recusada e não é criada', () => {
    const h = host()
    seed(h)
    h.setGestorLimits(limits({ approval: 'auto_within_limits', allowedTools: ['read'] }))
    const heavy = specOf({ name: 'Shell', title: 'Operadora', tools: { shell: 'write' } })
    expect(() => h.proposeGestorHire({ ...WS, id: planId(), gestorId: 'atlas', spec: heavy, reason: 'precisa rodar comandos', projectId: 'site' })).toThrow()
    expect(h.listPersonas(SITE).map(row => row.name)).not.toContain('Shell')
  })

  it('[GES-2c] motor fora da lista permitida do Gestor é recusado', () => {
    const h = host()
    seed(h)
    h.setGestorLimits(limits({ approval: 'auto_within_limits', allowedEngines: ['dsh'] }))
    const other = specOf({ name: 'Cloud', title: 'Analista', runnerKind: 'cli', runnerCli: 'codex' })
    expect(() => h.proposeGestorHire({ ...WS, id: planId(), gestorId: 'atlas', spec: other, reason: 'análise pesada', projectId: 'site' })).toThrow()
    expect(h.listPersonas(SITE).map(row => row.name)).not.toContain('Cloud')
  })

  it('[GES-2d] acima do máximo de personas é recusado e não deixa persona parcial', () => {
    const h = host()
    seed(h)
    h.setGestorLimits(limits({ approval: 'auto_within_limits', maxPersonas: 1 }))
    h.proposeGestorHire({ ...WS, id: planId(), gestorId: 'atlas', spec: specOf({ name: 'Um', title: 'Designer' }), reason: 'primeira', projectId: 'site' })
    expect(personaIds(h, 'site')).toHaveLength(1)
    expect(() => h.proposeGestorHire({ ...WS, id: planId(), gestorId: 'atlas', spec: specOf({ name: 'Dois', title: 'Redator' }), reason: 'segunda', projectId: 'site' })).toThrow()
    expect(h.listPersonas(SITE).map(row => row.name)).toEqual(['Um'])
  })

  it('[GES-2e] contratação acima do orçamento total NÃO é executada em silêncio (recusa ou pede aprovação)', () => {
    const h = host()
    seed(h)
    h.setGestorLimits(limits({ approval: 'auto_within_limits', budgetTokens: 1_000 }))
    const costly = specOf({ name: 'Cara', title: 'Pesquisadora', tokensPerMonth: 50_000 })
    let outcome = 'executed'
    try {
      const plan = h.proposeGestorHire({ ...WS, id: planId(), gestorId: 'atlas', spec: costly, reason: 'pesquisa grande', projectId: 'site' })
      outcome = plan.status === 'applied' ? 'executed' : 'asked'
    } catch {
      outcome = 'refused'
    }
    expect(outcome, 'estourou o orçamento e executou sozinho').not.toBe('executed')
    expect(h.listPersonas(SITE).map(row => row.name)).not.toContain('Cara')
  })

  it('[GES-2f] alocar para um projeto FORA do mandato é recusado', () => {
    const h = host()
    seed(h)
    h.createPersona({
      workspaceId: 'ws', projectId: 'pp', id: 'nina', name: 'Nina', title: 'Executora', description: '', personality: '', instructions: '',
      avatarKind: 'gallery', avatarRef: 'nina', runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: false, createdBy: 'ana', systemRoles: [],
    })
    h.setGestorLimits(limits({ approval: 'auto_within_limits', projectIds: ['pp'] }))
    expect(() => h.proposeGestorAllocate({ ...WS, id: planId(), gestorId: 'atlas', personaId: 'nina', projectIds: ['site'], reason: 'ela conhece o site' })).toThrow()
  })

  it('[GES-2g] "auto dentro de limites" executa na hora e deixa auditoria com MOTIVO; "auto e avisar" também', () => {
    const h = host()
    seed(h)
    h.setGestorLimits(limits({ approval: 'auto_within_limits' }))
    const auto = h.proposeGestorHire({ ...WS, id: planId(), gestorId: 'atlas', spec: specOf({ name: 'Auto', title: 'Designer' }), reason: 'a fila de design tinha 6 tarefas', projectId: 'site' })
    expect(auto.status).toBe('applied')
    expect(h.listPersonas(SITE).map(row => row.name)).toContain('Auto')
    h.setGestorLimits(limits({ approval: 'auto_and_notify' }))
    const notify = h.proposeGestorHire({ ...WS, id: planId(), gestorId: 'atlas', spec: specOf({ name: 'Aviso', title: 'Redator' }), reason: 'faltava texto do site', projectId: 'site' })
    expect(notify.status).toBe('applied')
    const audit = h.listGestorAudit(WS)
    expect(audit.length).toBeGreaterThanOrEqual(2)
    expect(audit.every(row => row.reason.trim() !== '')).toBe(true)
    expect(audit.map(row => row.reason).join(' ')).toMatch(/6 tarefas/u)
    expect(audit.map(row => `${row.summary} ${row.reason}`).join(' ')).not.toMatch(/undefined|null|\[object|plan-\d/u)
  })
})

describe('GES-3 — vários Gestores e auditoria', () => {
  it('[GES-3a] dois Gestores com escopos DIFERENTES não interferem (nenhum vira comentário do outro)', () => {
    const h = host()
    seed(h)
    h.createProject({ id: 'loja', workspaceId: 'ws', name: 'Loja', description: 'Loja' })
    gestor(h, 'iris', 'Iris')
    const a = h.proposeGestorHire({ ...WS, id: planId(), gestorId: 'atlas', spec: specOf(), reason: 'site precisa de designer', projectId: 'site' })
    const b = h.proposeGestorHire({ ...WS, id: planId(), gestorId: 'iris', spec: specOf(), reason: 'loja precisa de designer', projectId: 'loja' })
    expect(a.status).toBe('proposed')
    expect(b.status).toBe('proposed')
    expect(b.commentOnId).toBeUndefined()
    h.approveGestorPlan({ ...WS, planId: a.id })
    expect(h.listPersonas(SITE).map(row => row.name)).toContain('Pipoca')
    expect(h.listPersonas({ workspaceId: 'ws', projectId: 'loja' }).map(row => row.name), 'aprovar o plano do site não pode contratar na loja').toEqual([])
  })

  it('[GES-3c] a auditoria aparece no perfil do Gestor e na Saúde da equipe, em português, com motivo', () => {
    const h = host()
    seed(h)
    h.setGestorLimits(limits({ approval: 'auto_within_limits' }))
    h.proposeGestorHire({ ...WS, id: planId(), gestorId: 'atlas', spec: specOf(), reason: 'a fila de design estava cheia', projectId: 'site' })
    expect(h.getPersonaCard({ workspaceId: 'ws', projectId: 'pp', personaId: 'atlas' }).gestorAuditReason).toMatch(/fila de design/u)
    expect(h.getTeamHealth(WS).gestorAudit.some(row => /fila de design/u.test(row.reason))).toBe(true)
  })
})

describe('GES — permissões do humano', () => {
  it('[GES-ACL] só o dono define limites e aprova; membro comum recebe forbidden e nada muda', () => {
    const h = host()
    seed(h)
    const plan = h.proposeGestorHire({ ...WS, id: planId(), gestorId: 'atlas', spec: specOf(), reason: 'fila', projectId: 'site' })
    h.sessionMemberId = 'bia'
    expect(() => h.approveGestorPlan({ ...WS, planId: plan.id })).toThrow()
    expect(() => h.setGestorLimits(limits({ approval: 'auto_and_notify', maxPersonas: 99 }))).toThrow()
    h.sessionMemberId = 'ana'
    expect(h.getGestorMandate({ ...WS, personaId: 'atlas' }).approval).toBe('always_ask')
    expect(h.listPersonas(SITE).map(row => row.name)).not.toContain('Pipoca')
  })

  it('[GES-ACL] um persona que NÃO é Gestor não consegue propor contratação', () => {
    const h = host()
    seed(h)
    h.createPersona({
      workspaceId: 'ws', projectId: 'pp', id: 'nina', name: 'Nina', title: 'Executora', description: '', personality: '', instructions: '',
      avatarKind: 'gallery', avatarRef: 'nina', runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: false, createdBy: 'ana', systemRoles: [],
    })
    expect(() => h.proposeGestorHire({ ...WS, id: planId(), gestorId: 'nina', spec: specOf(), reason: 'quero contratar', projectId: 'site' })).toThrow(/not-gestor/u)
  })
})
