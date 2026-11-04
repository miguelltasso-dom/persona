import type { OrgChartView, OrgPersonaView, TeamHealthView, TwoDayTestView } from './governance-contract.ts'
import { sectorIdFromTitle } from './governance-ui-helpers.ts'
import {
  ORG_SCALE_HUMAN_LEADS,
  ORG_SCALE_SECTOR_NAMES,
  orgScalePersonaAt,
} from './mock-large-org-roster.ts'

/** Demo organogram (GOVERNANCE ref layout) until {@link getOrgChart} ships. */
export function mockOrgChart(workspaceId: string, groupBy: 'person' | 'sector'): OrgChartView {
  const personas = [
    { id: 'p-milo', name: 'Milo', role: 'Financeiro', characterId: 'tamandua', state: 'working' as const },
    { id: 'p-theo', name: 'Theo', role: 'PM', characterId: 'tucano', state: 'reviewing' as const },
    { id: 'p-ada', name: 'Ada', role: 'Dev', characterId: 'raposa', state: 'working' as const },
    { id: 'p-kai', name: 'Kai', role: 'Revisor de código', characterId: 'panda', state: 'waiting' as const },
    { id: 'p-nina', name: 'Nina', role: 'Pesquisa', characterId: 'sol', state: 'resting' as const },
    { id: 'p-noor', name: 'Noor', role: 'Conteúdo', characterId: 'tamandua', state: 'working' as const },
    { id: 'p-atlas', name: 'Atlas', role: 'Ops', characterId: 'raposa', state: 'stuck' as const },
    { id: 'p-rio', name: 'Rio', role: 'Triagem de bugs', characterId: 'tucano', state: 'working' as const },
    { id: 'p-sven', name: 'Sven', role: 'Dados', characterId: 'panda', state: 'offline' as const },
    { id: 'p-iara', name: 'Iara', role: 'Atendimento', characterId: 'sol', state: 'waiting' as const },
    { id: 'p-zara', name: 'Zara', role: 'Vendas', characterId: 'tamandua', state: 'working' as const },
  ]

  if (groupBy === 'sector') {
    return {
      workspaceId,
      groupBy,
      rightHand: { id: 'p-lodi', name: 'Lodi', role: 'Coordenação', characterId: 'sol', state: 'working' },
      rightHandCaption: 'seu braço direito',
      personaCount: personas.length + 1,
      humanCount: 4,
      groups: [
        { id: 'sec-produto', title: 'Produto', kind: 'sector', sectorId: sectorIdFromTitle('Produto'), members: personas.filter(p => ['Theo', 'Nina', 'Noor'].includes(p.name)) },
        { id: 'sec-eng', title: 'Engenharia', kind: 'sector', sectorId: sectorIdFromTitle('Engenharia'), members: personas.filter(p => ['Ada', 'Kai', 'Rio', 'Sven'].includes(p.name)) },
        { id: 'sec-vendas', title: 'Vendas', kind: 'sector', sectorId: sectorIdFromTitle('Vendas'), members: personas.filter(p => ['Zara'].includes(p.name)) },
        { id: 'sec-suporte', title: 'Suporte', kind: 'sector', sectorId: sectorIdFromTitle('Suporte'), members: personas.filter(p => ['Iara', 'Atlas'].includes(p.name)) },
        { id: 'sec-fin', title: 'Financeiro', kind: 'sector', sectorId: sectorIdFromTitle('Financeiro'), members: personas.filter(p => ['Milo'].includes(p.name)) },
      ],
    }
  }

  return {
    workspaceId,
    groupBy,
    rightHand: { id: 'p-lodi', name: 'Lodi', role: 'Coordenação', characterId: 'sol', state: 'working' },
    rightHandCaption: 'seu braço direito',
    personaCount: personas.length + 1,
    humanCount: 9,
    groups: [
      { id: 'h-amara', title: 'Amara', subtitle: 'Dono', kind: 'person', members: personas.filter(p => p.name === 'Milo') },
      { id: 'h-sofia', title: 'Sofía', subtitle: 'Produto', kind: 'person', members: personas.filter(p => ['Theo', 'Nina', 'Noor'].includes(p.name)) },
      { id: 'h-lukas', title: 'Lukas', subtitle: 'Engenharia', kind: 'person', members: personas.filter(p => ['Ada', 'Kai'].includes(p.name)) },
      { id: 'h-kenji', title: 'Kenji', subtitle: 'Admin', kind: 'person', away: true, members: personas.filter(p => p.name === 'Atlas') },
      { id: 'h-daniel', title: 'Daniel', subtitle: 'Engenharia', kind: 'person', members: personas.filter(p => p.name === 'Rio') },
      { id: 'h-yusuf', title: 'Yusuf', subtitle: 'Engenharia', kind: 'person', members: personas.filter(p => p.name === 'Sven') },
      { id: 'h-chloe', title: 'Chloé', subtitle: 'Suporte', kind: 'person', members: personas.filter(p => p.name === 'Iara') },
      { id: 'h-mateus', title: 'Mateus', subtitle: 'Vendas', kind: 'person', members: personas.filter(p => p.name === 'Zara') },
    ],
  }
}

const LARGE_STATES = ['working', 'reviewing', 'waiting', 'resting', 'stuck', 'offline'] as const

/** Stress organogram (60 / 150 personas) for OrgMap — gallery: `persona.orgChartScaleSeed` in localStorage. */
export function mockLargeOrgChart(
  workspaceId: string,
  groupBy: 'person' | 'sector',
  personaCount: number,
): OrgChartView {
  const humanLeads = ORG_SCALE_HUMAN_LEADS
  const humans = humanLeads.length
  const personas: OrgPersonaView[] = Array.from({ length: personaCount }, (_, i) => {
    const spec = orgScalePersonaAt(i)
    const row: OrgPersonaView = {
      id: `p-scale-${spec.characterId}-${i}`,
      name: spec.name,
      role: spec.role,
      characterId: spec.characterId,
      state: LARGE_STATES[i % LARGE_STATES.length]!,
    }
    return row
  })

  if (groupBy === 'sector') {
    const sectorNames = [...ORG_SCALE_SECTOR_NAMES]
    const groups = sectorNames.map((title, g) => ({
      id: `sec-${g}`,
      title,
      kind: 'sector' as const,
      sectorId: sectorIdFromTitle(title),
      members: personas.filter((_, i) => i % sectorNames.length === g),
    })).filter(g => g.members.length > 0)
    return {
      workspaceId,
      groupBy,
      rightHand: {
        id: 'p-gestor',
        name: 'Atlas',
        role: 'Gestor de equipe',
        characterId: 'atlas',
        state: 'working',
      },
      rightHandCaption: 'Gestor de equipe',
      personaCount: personaCount + 1,
      humanCount: humans,
      groups,
    }
  }

  const groups = humanLeads.map((lead, h) => ({
    id: `h-${h}`,
    title: lead.title,
    subtitle: lead.subtitle,
    kind: 'person' as const,
    ...(h % 9 === 0 ? { away: true as const } : {}),
    members: personas.filter((_, i) => i % humans === h),
  })).filter(g => g.members.length > 0)

  return {
    workspaceId,
    groupBy,
    rightHand: {
      id: 'p-gestor',
      name: 'Atlas',
      role: 'Gestor de equipe',
      characterId: 'atlas',
      state: 'working',
    },
    rightHandCaption: 'Gestor de equipe',
    personaCount: personaCount + 1,
    humanCount: humans,
    groups,
  }
}

export function mockTeamHealth(workspaceId: string): TeamHealthView {
  return {
    workspaceId,
    level: 'attention',
    score: 72,
    title: 'Se você sumir amanhã, a equipe para nas aprovações',
    body: 'Parte do trabalho continua, mas pagamentos e rotinas críticas ainda dependem de você.',
    findings: [
      {
        id: 'f-spof',
        level: 'risk',
        title: 'Kenji concentra quase todas as aprovações',
        detail: 'Defina um substituto ou delegue à Coordenação dentro do orçamento.',
        fixKind: 'set_substitute',
        fixTargetId: 'h-kenji',
      },
      {
        id: 'f-routine',
        level: 'attention',
        title: 'Rotina sem dono humano',
        detail: '«Relatório semanal» não tem quem responda se a persona travar.',
        fixKind: 'set_routine_owner',
        fixTargetId: 'routine-weekly',
      },
      {
        id: 'f-sector',
        level: 'attention',
        title: 'Setor Suporte sem cobertura',
        detail: 'Chloé está de férias e não há substituto no setor.',
        fixKind: 'set_substitute',
        fixTargetId: 'h-chloe',
      },
      {
        id: 'f-idle',
        level: 'good',
        title: 'Nina está ociosa há 3 dias',
        detail: 'Pode ser sinal de tarefa mal distribuída — ou ela merece descanso.',
      },
    ],
  }
}

export function mockTwoDayTest(workspaceId: string): TwoDayTestView {
  return {
    workspaceId,
    slotLabels: ['Dia 1 · manhã', 'Dia 1 · tarde', 'Dia 2 · manhã', 'Dia 2 · tarde'],
    rows: [
      { id: 'r-clients', label: 'Responder clientes (Iara)', slots: ['runs', 'runs', 'waits', 'waits'], reason: 'espera sua aprovação de modelo', fixKind: 'raise_autonomy', fixTargetId: 'p-iara' },
      { id: 'r-weekly', label: 'Relatório semanal', slots: ['stops', 'stops', 'stops', 'stops'], reason: 'rotina sem dono humano', fixKind: 'set_routine_owner', fixTargetId: 'routine-weekly' },
      { id: 'r-triage', label: 'Triagem de bugs (Rio)', slots: ['runs', 'runs', 'runs', 'runs'] },
      { id: 'r-pay', label: 'Pagamentos (Milo)', slots: ['waits', 'waits', 'waits', 'waits'], reason: 'Financeiro exige aprovação humana', fixKind: 'set_substitute', fixTargetId: 'h-amara' },
    ],
  }
}
