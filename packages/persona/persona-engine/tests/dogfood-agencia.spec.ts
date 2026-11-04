/** Dogfood #2 Agência Ponto — engine walk, 0 real CLI execs (D8 installer still CSP). */
import { expect, it } from 'vitest'
import {
  DEFAULT_GESTOR_LIMITS,
  IMPORT_ADAPTERS,
  defaultSubjects,
  parseBringPaste,
  type GestorMandate,
  type GestorPlan,
} from '@deepseek-ai/dsh-persona-core'
import {
  assignPersonaCharge,
  defaultSectorPolicy,
  emitGestorPropose,
  fakeVisionPort,
  gateRememberedPermission,
  orgChart,
  rememberApprovalPermission,
  revokeRememberedPermission,
  firstDeliveryAsk,
  runGestorAssemble,
  wantsWork,
  workflowFromTemplate,
  draftTaughtSkill,
  type GovernanceSnapshot,
} from '../src/index.ts'

const now = '2026-11-04T12:00:00.000Z'
const clock = Date.parse(now)

const mandate: GestorMandate = {
  personaId: 'atlas',
  workspaceId: 'agencia-ponto',
  limits: DEFAULT_GESTOR_LIMITS,
}

const plan: GestorPlan = {
  id: 'plan-agencia',
  workspaceId: 'agencia-ponto',
  gestorId: 'atlas',
  action: 'assemble',
  scopeKey: 'site-ponto|*|equipe',
  summary: 'montar equipe para o site da Agência Ponto',
  reason: 'pedido no #geral: campanha + site do cliente',
  status: 'proposed',
  createdAt: now,
}

it('walks Agência Ponto: gestor, quadro+sprint, ensinar, cérebro, BYC, assuntos, quem cuida', async () => {
  const asked = runGestorAssemble({
    mandate,
    plan,
    goal: 'Monte a equipe da Agência Ponto para o site e a campanha',
    projectId: 'site-ponto',
    sprintId: 'sp1',
    accepted: false,
    auditId: 'ag-1',
    at: now,
  })
  expect(asked.decision.kind).toBe('ask')
  expect(asked.assemble).toBeUndefined()
  const card = emitGestorPropose({ plan, threadId: 'geral', at: now })
  expect(card.channelBody).toContain('[[gestor-plan:plan-agencia]]')
  expect(card.activity.status).toBe('waiting')

  const applied = runGestorAssemble({
    mandate,
    plan,
    goal: 'Monte a equipe da Agência Ponto para o site e a campanha',
    projectId: 'site-ponto',
    sprintId: 'sp1',
    accepted: true,
    auditId: 'ag-2',
    at: now,
  })
  expect(applied.decision.kind).toBe('apply')
  expect(applied.assemble?.sprint.name).toBe('Sprint 1')
  expect(applied.assemble?.structure.personas.length).toBeGreaterThan(0)

  const board = workflowFromTemplate('site-ponto', 'site')
  expect(board.columns.length).toBeGreaterThan(1)
  expect(board.columns.some(col => col.category === 'todo')).toBe(true)
  expect(board.columns.some(col => col.category === 'done')).toBe(true)

  const taught = await draftTaughtSkill({
    personaId: 'nina',
    title: 'Publicar post da campanha',
    frames: [{ atMs: 0, imageRef: 'file://local/agencia-0.webp', changeScore: 1 }],
    transcript: [{ atMs: 0, untilMs: 400, text: 'Abra o CMS e publique o post.' }],
    allowedTools: ['browser'],
    vision: fakeVisionPort(),
    readyCriteria: 'O post aparece no blog.',
  })
  expect(taught.local).toBe(true)
  expect(taught.skill.enabled).toBe(false)
  expect(taught.steps.length).toBeGreaterThan(0)

  const grant = rememberApprovalPermission({
    id: 'perm-cms',
    grantorId: 'miguel',
    personaId: 'nina',
    action: 'publish',
    target: 'cms:blog',
    validity: 'until_revoked',
    now: clock,
  })
  const first = gateRememberedPermission([grant], {
    personaId: 'nina', action: 'publish', target: 'cms:blog', now: clock + 1,
  })
  expect(first.kind).toBe('skip')
  const again = gateRememberedPermission([grant], {
    personaId: 'nina', action: 'publish', target: 'cms:blog', now: clock + 2,
  })
  expect(again.kind).toBe('skip')
  const revoked = revokeRememberedPermission(grant)
  const afterRevoke = gateRememberedPermission([revoked], {
    personaId: 'nina', action: 'publish', target: 'cms:blog', now: clock + 3,
  })
  expect(afterRevoke.kind).toBe('ask')

  const byc = parseBringPaste({
    text: '## Decisões já tomadas\nUsar lilás no hero do site da padaria cliente.\n## Ferramentas e processos\nCliente prefere fotos da vitrine de manhã.',
    provider: 'claude',
    at: now,
  })
  expect(byc.source).toBe('paste')
  expect(byc.proposals.length).toBeGreaterThan(0)

  const subjects = defaultSubjects({ kind: 'dm', id: 'dm-miguel' })
  expect(subjects.every(row => row.name !== '' && row.color !== undefined)).toBe(true)
  expect(new Set(subjects.map(row => row.color)).size).toBe(subjects.length)

  const snap: GovernanceSnapshot = {
    workspaceId: 'agencia-ponto',
    humans: [{ id: 'miguel', name: 'Miguel' }],
    personas: [
      { id: 'atlas', title: 'Coordenação', systemRoles: ['coordination', 'team_manager'] },
      { id: 'nina', title: 'Conteúdo', systemRoles: [] },
    ],
    sectors: [
      { id: 'mkt', workspaceId: 'agencia-ponto', name: 'Marketing', policy: defaultSectorPolicy() },
    ],
    charges: [
      assignPersonaCharge({ personaId: 'atlas', responsibleHumanId: 'miguel', sectorId: 'mkt' }),
      assignPersonaCharge({ personaId: 'nina', responsibleHumanId: 'miguel', sectorId: 'mkt' }),
    ],
    away: [],
    routines: [],
  }
  const chart = orgChart(snap, 'person')
  expect(chart.groups.some(group => group.personas.some(card => card.personaId === 'nina'))).toBe(true)

  expect(wantsWork('Monte a equipe da Agência Ponto para o site e a campanha do cliente.')).toBe(true)
  const firstAsk = firstDeliveryAsk({ companyBrief: 'Agência Ponto — estúdio de sites.' })
  expect(firstAsk).toContain('resuma somente os dados da empresa fornecidos abaixo')
  expect(firstAsk).toContain('"Agência Ponto — estúdio de sites."')
  expect(firstAsk).toContain('Não use ferramentas, inclusive ferramentas da Persona.')

  expect(IMPORT_ADAPTERS.map(row => row.id)).toEqual(
    expect.arrayContaining(['chatgpt', 'claude', 'gemini', 'notion', 'markdown', 'grok']),
  )
})
