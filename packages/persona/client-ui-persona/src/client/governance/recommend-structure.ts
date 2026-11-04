import { DEFAULT_SECTORS } from './default-sectors.ts'
import type {
  CompanyModelId,
  RecommendedPersona,
  StructureAssistantInput,
  StructurePlan,
} from './structure-types.ts'

const MODEL_SECTORS: Readonly<Record<CompanyModelId, readonly string[]>> = {
  agency: ['marketing', 'operacoes', 'vendas', 'produto'],
  ecommerce: ['vendas', 'suporte', 'operacoes', 'marketing'],
  saas: ['produto', 'engenharia', 'suporte', 'vendas'],
  consulting: ['operacoes', 'vendas', 'financeiro', 'pessoas'],
  creator: ['marketing', 'operacoes', 'produto'],
  office: ['operacoes', 'financeiro', 'pessoas', 'vendas'],
}

const MODEL_PERSONAS: Readonly<Record<CompanyModelId, readonly Omit<RecommendedPersona, 'id'>[]>> = {
  agency: [
    { name: 'Coordenação', jobTitle: 'Braço direito — prioriza e delega', sectorId: 'operacoes', coordination: true, watchdog: false },
    { name: 'Marca', jobTitle: 'Conteúdo e campanhas recorrentes', sectorId: 'marketing', coordination: false, watchdog: false },
    { name: 'Atendimento', jobTitle: 'Briefings e retorno ao cliente', sectorId: 'vendas', coordination: false, watchdog: false },
    { name: 'Operações', jobTitle: 'Prazos, entregas e rotinas semanais', sectorId: 'operacoes', coordination: false, watchdog: true },
  ],
  ecommerce: [
    { name: 'Coordenação', jobTitle: 'Braço direito — fila e exceções', sectorId: 'operacoes', coordination: true, watchdog: false },
    { name: 'Loja', jobTitle: 'Catálogo, promoções e estoque', sectorId: 'vendas', coordination: false, watchdog: false },
    { name: 'Suporte', jobTitle: 'Pedidos, trocas e pós-venda', sectorId: 'suporte', coordination: false, watchdog: false },
    { name: 'Marketing', jobTitle: 'Anúncios e conteúdo recorrente', sectorId: 'marketing', coordination: false, watchdog: false },
  ],
  saas: [
    { name: 'Coordenação', jobTitle: 'Braço direito — roadmap e triagem', sectorId: 'produto', coordination: true, watchdog: false },
    { name: 'Produto', jobTitle: 'Descoberta e priorização contínua', sectorId: 'produto', coordination: false, watchdog: false },
    { name: 'Engenharia', jobTitle: 'Implementação e qualidade', sectorId: 'engenharia', coordination: false, watchdog: false },
    { name: 'Sucesso', jobTitle: 'Onboarding e suporte recorrente', sectorId: 'suporte', coordination: false, watchdog: false },
  ],
  consulting: [
    { name: 'Coordenação', jobTitle: 'Braço direito — agenda e entregas', sectorId: 'operacoes', coordination: true, watchdog: false },
    { name: 'Projetos', jobTitle: 'Escopo e cronograma semanal', sectorId: 'operacoes', coordination: false, watchdog: false },
    { name: 'Comercial', jobTitle: 'Propostas e follow-up', sectorId: 'vendas', coordination: false, watchdog: false },
    { name: 'Financeiro', jobTitle: 'Faturamento e contratos', sectorId: 'financeiro', coordination: false, watchdog: true },
  ],
  creator: [
    { name: 'Coordenação', jobTitle: 'Braço direito — calendário editorial', sectorId: 'produto', coordination: true, watchdog: false },
    { name: 'Conteúdo', jobTitle: 'Roteiro, gravação e revisão', sectorId: 'marketing', coordination: false, watchdog: false },
    { name: 'Comunidade', jobTitle: 'Comentários e parcerias', sectorId: 'vendas', coordination: false, watchdog: false },
  ],
  office: [
    { name: 'Coordenação', jobTitle: 'Braço direito — prioridades do escritório', sectorId: 'operacoes', coordination: true, watchdog: false },
    { name: 'Administrativo', jobTitle: 'Documentos e rotinas internas', sectorId: 'operacoes', coordination: false, watchdog: false },
    { name: 'Atendimento', jobTitle: 'Clientes e agenda', sectorId: 'vendas', coordination: false, watchdog: false },
    { name: 'Financeiro', jobTitle: 'Contas e cobrança', sectorId: 'financeiro', coordination: false, watchdog: false },
  ],
}

function slug(name: string, index: number): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '') || 'persona'
  return `${base}-${index}`.slice(0, 48)
}

function mergeSectors(model: CompanyModelId, activeSectorIds: readonly string[]): readonly string[] {
  const suggested = MODEL_SECTORS[model]
  const merged = new Set<string>([...suggested, ...activeSectorIds])
  return DEFAULT_SECTORS.map(row => row.id).filter(id => merged.has(id))
}

/** Deterministic starter team: one persona per continuous function, 3–5 roles. */
export function recommendStructure(input: StructureAssistantInput): StructurePlan {
  const sectorIds = mergeSectors(input.companyModel, input.activeSectorIds)
  const sectors = DEFAULT_SECTORS.filter(row => sectorIds.includes(row.id))
  const base = MODEL_PERSONAS[input.companyModel]
  const notes = input.weeklyWorkNotes.toLowerCase()
  let personas: RecommendedPersona[] = base.map((row, index) => ({
    ...row,
    id: slug(row.name, index),
  }))
  if (notes.includes('suporte') && !personas.some(row => row.sectorId === 'suporte')) {
    personas = [
      ...personas,
      {
        id: slug('Suporte', personas.length),
        name: 'Suporte',
        jobTitle: 'Atendimento recorrente',
        sectorId: 'suporte',
        coordination: false,
        watchdog: false,
      },
    ]
  }
  if (personas.length > 5) personas = personas.slice(0, 5)
  return {
    companyModel: input.companyModel,
    sectors,
    personas,
    rationaleKeys: [
      'rationale.oneRole',
      'rationale.tasksVsPersonas',
      'rationale.routinesOwner',
      'rationale.startSmall',
    ],
  }
}

export const COMPANY_MODEL_IDS: readonly CompanyModelId[] = [
  'agency',
  'ecommerce',
  'saas',
  'consulting',
  'creator',
  'office',
]
