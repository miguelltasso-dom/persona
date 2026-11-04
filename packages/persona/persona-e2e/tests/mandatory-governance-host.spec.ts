/**
 * GOV-10 (GOVERNANCE.md §4) — host-level acceptance on the REAL PersonaHost (in-memory SQLite), no browser, no AI.
 * The five core scenarios, asserted through the public Remote surface the UI consumes
 * (`getOrgChart`, `getTeamHealth`, `runTwoDayTest`, `applyFix`, `setAvailability`, `recommendStructure`).
 * App layer (captures, axe, loading): {@link ./real-gov-pb-app.spec.ts}.
 */
import { describe, expect, it as vitestIt } from 'vitest'
import PersonaHost from '../../persona-host/src/index.ts'
import { bindHostFile, HOST_TEST_TIMEOUT_MS, it } from '../../persona-host/tests/host-harness.ts'

const { host } = bindHostFile('2026-11-03T09:00:00.000Z')

/** Known product gap/bug: the body states the REQUIRED behaviour, fails today (`it.fails`), flips red when fixed. */
function bug(owner: string, title: string, fn: () => unknown): void {
  vitestIt.fails(`[BUG→${owner}] ${title}`, fn, HOST_TEST_TIMEOUT_MS)
}

const WS = { workspaceId: 'ws' } as const
const FROM = '2026-11-03T00:00:00.000Z'
const UNTIL = '2026-11-06T00:00:00.000Z'

function persona(h: PersonaHost, id: string, name: string, title: string, cli: 'claude' | 'codex' = 'claude'): void {
  h.createPersona({
    workspaceId: 'ws', projectId: 'team', id, name, title, description: `${title}.`, personality: 'Direto.',
    instructions: 'Entregue.', avatarKind: 'gallery', avatarRef: name.toLowerCase(), runnerKind: 'cli',
    runnerCli: cli, runnerModel: 'haiku', canRecruit: false, createdBy: 'ana',
  })
}

/** Ana (owner) + Bia (member), shared project with 3 personas: Atlas (Coordenação), Bento (Engenharia), Nina (Operações). */
function seed(): PersonaHost {
  const h = host()
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createMember({ id: 'bia', workspaceId: 'ws', projectId: 'pp', displayName: 'Bia', handle: 'bia', role: 'member' })
  h.createProject({ id: 'team', workspaceId: 'ws', name: 'Time', description: 'compartilhado' })
  persona(h, 'atlas', 'Atlas', 'Coordenação')
  persona(h, 'dev', 'Bento', 'Engenharia')
  persona(h, 'ops', 'Nina', 'Operações')
  h.sessionMemberId = 'ana'
  // Monotone injected clock (1 s per read): governance audit ids are `${action}:${now}:${actor}`, so a frozen clock makes
  // two same-kind writes collide (see the GOV audit bug below). The walk window FROM..UNTIL stays around it.
  let tick = 0
  h.orchestration.now = () => new Date(Date.parse('2026-11-03T09:00:00.000Z') + (tick++) * 1000).toISOString()
  return h
}

const groupOf = (h: PersonaHost, by: 'person' | 'sector', id: string) =>
  h.getOrgChart({ ...WS, groupBy: by }).groups.find(row => row.id === id)

describe('GOV-1 — organograma por pessoa e por setor reflete o banco; mudar responsável/setor atualiza ao vivo', () => {
  it('[GOV-1] por pessoa: todas as personas penduradas no dono; braço direito = Coordenação', () => {
    const h = seed()
    const chart = h.getOrgChart({ ...WS, groupBy: 'person' })
    expect(chart.rightHand?.id).toBe('atlas')
    expect(chart.personaCount).toBe(3)
    expect(chart.humanCount).toBe(2)
    expect(groupOf(h, 'person', 'ana')?.members.map(row => row.id).sort()).toEqual(['atlas', 'dev', 'ops'])
  })

  it('[GOV-1] mudar responsável move a persona entre pessoas; persistido (outra leitura vê igual)', () => {
    const h = seed()
    h.setResponsible({ ...WS, personaId: 'ops', humanId: 'bia' })
    expect(groupOf(h, 'person', 'bia')?.members.map(row => row.id)).toEqual(['ops'])
    expect(groupOf(h, 'person', 'ana')?.members.map(row => row.id).sort()).toEqual(['atlas', 'dev'])
    // The card the profile screen reads agrees with the chart (same table, not a UI cache).
    expect(h.getPersonaCard({ workspaceId: 'ws', projectId: 'team', personaId: 'ops' }).ownerName).toBe('Bia')
  })

  it('[GOV-1] por setor: mudar setor move a persona; limpar o setor a devolve a "sem setor"', () => {
    const h = seed()
    h.governance.gov.putSector({ id: 'eng', workspaceId: 'ws', name: 'Engenharia', policyJson: JSON.stringify({ autonomy: 'propose', requiredApprovals: [] }) })
    h.governance.gov.putSector({ id: 'fin', workspaceId: 'ws', name: 'Financeiro', policyJson: JSON.stringify({ autonomy: 'propose', requiredApprovals: ['payment'] }) })
    h.setSector({ ...WS, personaId: 'dev', sectorId: 'eng' })
    h.setSector({ ...WS, personaId: 'ops', sectorId: 'fin' })
    expect(groupOf(h, 'sector', 'eng')?.members.map(row => row.id)).toEqual(['dev'])
    expect(groupOf(h, 'sector', 'fin')?.members.map(row => row.id)).toEqual(['ops'])
    h.setSector({ ...WS, personaId: 'dev', sectorId: 'fin' })
    expect(groupOf(h, 'sector', 'fin')?.members.map(row => row.id).sort()).toEqual(['dev', 'ops'])
    expect(groupOf(h, 'sector', 'eng')?.members ?? []).toEqual([])
    h.setSector({ ...WS, personaId: 'dev', sectorId: '' })
    expect(groupOf(h, 'sector', 'fin')?.members.map(row => row.id)).toEqual(['ops'])
  })

  it('[GOV-1] ACL: só o dono muda responsável/setor; membro recebe forbidden e o organograma não muda', () => {
    const h = seed()
    h.sessionMemberId = 'bia'
    expect(() => h.setResponsible({ ...WS, personaId: 'dev', humanId: 'bia' })).toThrow('forbidden')
    expect(() => h.setSector({ ...WS, personaId: 'dev', sectorId: '' })).toThrow('forbidden')
    h.sessionMemberId = 'ana'
    expect(groupOf(h, 'person', 'ana')?.members.map(row => row.id).sort()).toEqual(['atlas', 'dev', 'ops'])
  })
})

describe('GOV-2 — Saúde aponta os problemas-chave em linguagem simples e a correção de 1 clique funciona', () => {
  it('[GOV-2] ponto único de falha: sem substituto aponta; "Definir substituto" corrige e a nota sobe', () => {
    const h = seed()
    const before = h.getTeamHealth(WS)
    const single = before.findings.find(row => row.fixKind === 'set_substitute')
    expect(single, 'achado de ponto único de falha / sem substituto').toBeDefined()
    expect(`${single!.title} ${single!.detail ?? ''}`).not.toMatch(/undefined|null|\[object/u)
    const fixed = h.applyFix({ ...WS, findingId: single!.id, fixKind: 'set_substitute', ...(single!.fixTargetId === undefined ? {} : { targetId: single!.fixTargetId }) })
    expect(fixed.findings.some(row => row.fixKind === 'set_substitute')).toBe(false)
    expect(fixed.score).toBeGreaterThanOrEqual(before.score)
    expect(['atlas', 'dev', 'ops'].some(id => h.getPersonaCard({ workspaceId: 'ws', projectId: 'team', personaId: id }).substituteName === 'Bia')).toBe(true)
  })

  it('[GOV-2] setor sem cobertura e rotina sem dono aparecem; atribuir dono à rotina resolve o achado', () => {
    const h = seed()
    h.governance.gov.putSector({ id: 'vazio', workspaceId: 'ws', name: 'Financeiro vazio', policyJson: JSON.stringify({ autonomy: 'propose', requiredApprovals: ['payment'] }) })
    h.governance.gov.putRoutineCharge({
      routineId: 'rt-folha', workspaceId: 'ws', title: 'Folha de pagamento', executorPersonaId: 'ops',
      requiresApproval: true, approvalKind: 'payment',
    })
    const health = h.getTeamHealth(WS)
    const text = health.findings.map(row => `${row.id} ${row.title} ${row.detail ?? ''}`).join('\n')
    expect(text, 'setor sem cobertura').toMatch(/Financeiro vazio/u)
    expect(text, 'rotina sem dono').toMatch(/Folha de pagamento/u)
    const ownerless = health.findings.find(row => /Folha de pagamento/u.test(`${row.title} ${row.detail ?? ''}`))!
    expect(ownerless.id).toMatch(/^routine_without_owner:/u)
    // The host supports the "Definir dono da rotina" fix (Remote `applyFix`), addressed to a person.
    const after = h.applyFix({ ...WS, findingId: ownerless.id, fixKind: 'set_routine_owner', targetId: 'ana' })
    expect(after.findings.some(row => row.id === ownerless.id), 'achado some depois de definir o dono').toBe(false)
  })

  it('[GOV-2] invariante: persona nunca fica sem responsável (limpar é recusado e nada muda)', () => {
    const h = seed()
    expect(() => h.setResponsible({ ...WS, personaId: 'dev', humanId: '' })).toThrow(/INVALID_GOVERNANCE|missing_responsible/u)
    expect(groupOf(h, 'person', 'ana')?.members.map(row => row.id)).toContain('dev')
    expect(h.getTeamHealth(WS).findings.some(row => row.fixKind === 'set_responsible')).toBe(false)
  })
})

describe('GOV-3 — Teste dos 2 dias (relógio injetado): com substituto/autonomia segue; sem, lista exatamente o que para', () => {
  function withRoutines(h: PersonaHost): void {
    h.governance.gov.putRoutineCharge({
      routineId: 'rt-pay', workspaceId: 'ws', title: 'Contas a pagar', executorPersonaId: 'ops',
      responsibleHumanId: 'ana', requiresApproval: true, approvalKind: 'payment',
    })
    h.governance.gov.putRoutineCharge({
      routineId: 'rt-ghost', workspaceId: 'ws', title: 'Relatório sem dono',
      requiresApproval: false,
    })
    h.setAvailability({ ...WS, humanId: 'ana', kind: 'away', from: FROM, until: UNTIL })
  }

  it('[GOV-3] sem substituto: a rotina com aprovação ESPERA e a sem dono PARA, com motivo legível', () => {
    const h = seed()
    withRoutines(h)
    const two = h.runTwoDayTest(WS)
    expect(two.slotLabels.length).toBeGreaterThanOrEqual(2)
    const pay = two.rows.find(row => row.label === 'Contas a pagar')
    const ghost = two.rows.find(row => row.label === 'Relatório sem dono')
    expect(pay?.slots, 'aprovação do dono que está fora').toContain('waits')
    expect(ghost?.slots, 'rotina sem dono').toContain('stops')
    expect(pay?.fixKind).toBeDefined()
    expect(pay?.reason ?? '').not.toBe('')
    expect(`${pay?.reason ?? ''} ${ghost?.reason ?? ''}`).not.toMatch(/undefined|null|\[object/u)
  })

  it('[GOV-3] com substituto definido (1 clique) a aprovação deixa de esperar', () => {
    const h = seed()
    withRoutines(h)
    const waiting = h.runTwoDayTest(WS).rows.find(row => row.label === 'Contas a pagar')!
    expect(waiting.slots).toContain('waits')
    h.setSubstitute({ ...WS, personaId: 'ops', humanId: 'bia' })
    const covered = h.runTwoDayTest(WS).rows.find(row => row.label === 'Contas a pagar')!
    expect(covered.slots).not.toContain('waits')
    expect(covered.slots).not.toContain('stops')
    // The sem-dono routine is a different cause: the substituto does not rescue it.
    expect(h.runTwoDayTest(WS).rows.find(row => row.label === 'Relatório sem dono')?.slots).toContain('stops')
  })

  it('[GOV-3] a pessoa volta (disponível): nada espera por ela; o teste usa a janela marcada, não o relógio do sistema', () => {
    const h = seed()
    withRoutines(h)
    h.setAvailability({ ...WS, humanId: 'ana', kind: 'available', from: FROM, until: UNTIL })
    const pay = h.runTwoDayTest(WS).rows.find(row => row.label === 'Contas a pagar')!
    expect(pay.slots).not.toContain('waits')
  })
})

describe('GOV-4 — pessoa marcada "fora": aprovações vão ao substituto; sem substituto, esperam com aviso', () => {
  it('[GOV-4] o organograma marca a pessoa como fora e a devolve ao voltar', () => {
    const h = seed()
    const away = h.setAvailability({ ...WS, humanId: 'ana', kind: 'away', from: FROM, until: UNTIL })
    expect(away.groups.find(row => row.id === 'ana')?.away).toBe(true)
    const back = h.setAvailability({ ...WS, humanId: 'ana', kind: 'available', from: FROM, until: UNTIL })
    expect(back.groups.find(row => row.id === 'ana')?.away).not.toBe(true)
  })

  it('[GOV-4] só o dono ou a própria pessoa marca "fora": Bia não marca a Ana', () => {
    const h = seed()
    h.sessionMemberId = 'bia'
    expect(() => h.setAvailability({ ...WS, humanId: 'ana', kind: 'away', from: FROM, until: UNTIL })).toThrow('forbidden')
    expect(h.setAvailability({ ...WS, humanId: 'bia', kind: 'away', from: FROM, until: UNTIL }).groups.find(row => row.id === 'bia')?.away).toBe(true)
  })

  bug('Anvil+Forge', '[GOV-4] a aprovação/Attention de uma persona cuidada por quem está fora aparece para o SUBSTITUTO (ou espera com aviso explícito) — routeApproval ainda não é chamado pelo host', () => {
    const h = seed()
    h.setSubstitute({ ...WS, personaId: 'ops', humanId: 'bia' })
    h.setAvailability({ ...WS, humanId: 'ana', kind: 'away', from: FROM, until: UNTIL })
    h.createVaultRecord({ workspaceId: 'ws', projectId: 'team', id: 'v-prop', kind: 'brief', body: 'Proposta da Nina.', authorId: 'ana' })
    h.sessionMemberId = 'bia'
    const approvals = h.listApprovals({ workspaceId: 'ws', projectId: 'team' }) as readonly unknown[] as readonly Record<string, unknown>[]
    // Required behaviour (GOVERNANCE.md §3): every pending approval says who it was routed to / on whose behalf, or why it waits.
    const routed = approvals.filter(row => row.status === 'pending')
    expect(routed.length).toBeGreaterThan(0)
    expect(routed.every(row => typeof row.onBehalfOf === 'string' || typeof row.waitNotice === 'string')).toBe(true)
  })
})

describe('GOV-5 — assistente de estrutura: coerente para 3 tipos de empresa e respeita "uma persona por função contínua"', () => {
  for (const company of ['agencia', 'saas', 'escritorio'] as const) {
    it(`[GOV-5] ${company}: 3–5 personas contínuas, títulos únicos, tarefa pontual NÃO vira persona, rotina recorrente ganha dono`, () => {
      const h = seed()
      const rec = h.recommendStructure({
        ...WS, company, sectorNames: ['Vendas', 'Suporte'], recurring: ['fazer banner hoje', 'Status semanal'],
      })
      expect(rec.company).toBe(company)
      expect(rec.personas.length).toBeGreaterThanOrEqual(3)
      expect(rec.personas.length).toBeLessThanOrEqual(5)
      expect(new Set(rec.personas.map(row => row.title)).size).toBe(rec.personas.length)
      expect(rec.explanation).toMatch(/função contínua/u)
      expect(rec.tasks).toContain('fazer banner hoje')
      expect(rec.personas.some(row => /banner/iu.test(row.title))).toBe(false)
      const weekly = rec.routines.find(row => /Status semanal/u.test(row.title))
      expect(weekly?.ownerTitle ?? '', 'rotina recorrente sem dono').not.toBe('')
      expect(rec.org.rightHand).toBeDefined()
      expect(rec.twoDay.rows.length).toBeGreaterThan(0)
    })
  }

  it('[GOV-5] aplicar grava setores e dono das rotinas, deixa auditoria e NÃO contrata personas sozinho', () => {
    const h = seed()
    const before = h.listTeam({ workspaceId: 'ws', projectId: 'team' }).personas.length
    h.applyStructure({ ...WS, company: 'saas', sectorNames: ['Produto'], recurring: ['Triage de bugs'] })
    expect(h.governance.gov.listSectors('ws').some(row => row.name === 'Produto')).toBe(true)
    expect(h.listAudit(WS).some(row => row.action === 'apply-structure')).toBe(true)
    expect(h.listTeam({ workspaceId: 'ws', projectId: 'team' }).personas.length).toBe(before)
  })
})

describe('GOV-5 — auditoria: escritas seguidas no mesmo instante', () => {
  bug('Anvil', '[GOV-5] dois setSector no mesmo milissegundo (loop do Gestor/equipe contratada) não podem falhar com "conflict" DEPOIS de gravar — o id da auditoria é `${action}:${now}:${actor}`', () => {
    const h = seed()
    h.governance.gov.putSector({ id: 'eng', workspaceId: 'ws', name: 'Engenharia', policyJson: JSON.stringify({ autonomy: 'propose', requiredApprovals: [] }) })
    h.orchestration.now = () => '2026-11-03T09:00:00.000Z'
    h.setSector({ ...WS, personaId: 'dev', sectorId: 'eng' })
    expect(() => h.setSector({ ...WS, personaId: 'ops', sectorId: 'eng' })).not.toThrow()
  })
})
