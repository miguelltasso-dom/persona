/**
 * Structure assistant: one persona per continuous function, never per task (D-054).
 */

import { assessTeamHealth, runTwoDayTest } from './health.ts'
import { orgChart, type OrgChart } from './org.ts'
import { assignPersonaCharge, defaultSectorPolicy, type GovernanceSnapshot } from './model.ts'
import type { HealthReport, TwoDayResult } from './health.ts'

/** Machine ids. Display names live on {@link COMPANY_MODELS}. */
export type CompanyKind = 'agencia' | 'loja_online' | 'saas' | 'consultoria' | 'criador' | 'escritorio'

export interface CompanyFunction {
  title: string
  sectorName: string
  requiredApprovals?: readonly string[]
}

export interface CompanyModel {
  id: CompanyKind
  name: string
  functions: readonly CompanyFunction[]
  routines: readonly string[]
}

/** Catalog — labels are data, not invariants. */
export const COMPANY_MODELS: readonly CompanyModel[] = [
  {
    id: 'agencia',
    name: 'Agência',
    functions: [
      { title: 'Coordenação', sectorName: 'Operações' },
      { title: 'Atendimento', sectorName: 'Atendimento' },
      { title: 'Criação', sectorName: 'Criação' },
      { title: 'Mídia', sectorName: 'Mídia' },
    ],
    routines: ['Status semanal do cliente', 'Revisão de peças'],
  },
  {
    id: 'loja_online',
    name: 'Loja online',
    functions: [
      { title: 'Coordenação', sectorName: 'Operações' },
      { title: 'Atendimento', sectorName: 'Atendimento' },
      { title: 'Catálogo', sectorName: 'Produto' },
      { title: 'Logística', sectorName: 'Operações' },
    ],
    routines: ['Pedidos do dia', 'Estoque semanal'],
  },
  {
    id: 'saas',
    name: 'SaaS',
    functions: [
      { title: 'Coordenação', sectorName: 'Produto' },
      { title: 'Produto', sectorName: 'Produto' },
      { title: 'Suporte', sectorName: 'Suporte' },
      { title: 'Engenharia', sectorName: 'Engenharia' },
    ],
    routines: ['Triage de bugs', 'Nota de versão'],
  },
  {
    id: 'consultoria',
    name: 'Consultoria',
    functions: [
      { title: 'Coordenação', sectorName: 'Operações' },
      { title: 'Pesquisa', sectorName: 'Pesquisa' },
      { title: 'Entrega', sectorName: 'Entrega' },
    ],
    routines: ['Check-in com cliente'],
  },
  {
    id: 'criador',
    name: 'Criador de conteúdo',
    functions: [
      { title: 'Coordenação', sectorName: 'Conteúdo' },
      { title: 'Conteúdo', sectorName: 'Conteúdo' },
      { title: 'Comunidade', sectorName: 'Comunidade' },
    ],
    routines: ['Pauta da semana', 'Publicação'],
  },
  {
    id: 'escritorio',
    name: 'Escritório',
    functions: [
      { title: 'Coordenação', sectorName: 'Operações' },
      { title: 'Atendimento', sectorName: 'Atendimento' },
      { title: 'Financeiro', sectorName: 'Financeiro', requiredApprovals: ['payment'] },
      { title: 'Pessoas', sectorName: 'Pessoas' },
    ],
    routines: ['Contas a pagar', 'Agenda da semana'],
  },
]

export interface StructureAsk {
  company: CompanyKind
  sectorNames: readonly string[]
  recurring: readonly string[]
  ownerHumanId?: string
}

export interface RecommendedPersona {
  id: string
  title: string
  sectorName: string
  continuous: true
}

export interface RecommendedRoutine {
  title: string
  ownerTitle: string
}

export interface StructureRecommendation {
  company: CompanyKind
  explanation: string
  personas: readonly RecommendedPersona[]
  routines: readonly RecommendedRoutine[]
  tasks: readonly string[]
  preview: GovernanceSnapshot
  org: OrgChart
  twoDay: TwoDayResult
  health: HealthReport
}

const MAX_START = 5

function slug(value: string, index: number): string {
  const base = value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '')
  return base === '' ? `fn-${String(index)}` : base
}

function looksLikeTask(text: string): boolean {
  const key = text.trim().toLowerCase()
  return key.startsWith('fazer ') || key.startsWith('enviar ') || key.includes(' esta semana') || key.includes('hoje')
}

/**
 * Model row for a company kind.
 * @param id - Machine id.
 */
export function companyModelById(id: CompanyKind): CompanyModel {
  const found = COMPANY_MODELS.find(row => row.id === id)
  if (found === undefined) return COMPANY_MODELS[0]!
  return found
}

/**
 * Deterministic recommendation: one persona per continuous function, 3–5 to start.
 * Recurring work becomes a routine with an owner. One-off wording becomes a Tarefa.
 * @param ask - Company type, existing sectors, weekly recurring work.
 */
export function recommendStructure(ask: StructureAsk): StructureRecommendation {
  const model = companyModelById(ask.company)
  const functions = model.functions.slice(0, MAX_START)
  const extraSectors = ask.sectorNames.filter(name =>
    !functions.some(row => row.sectorName.toLowerCase() === name.trim().toLowerCase()))
  const personas: RecommendedPersona[] = functions.map((row, index) => ({
    id: `rec-${slug(row.title, index)}`,
    title: row.title,
    sectorName: row.sectorName,
    continuous: true as const,
  }))
  const tasks = ask.recurring.filter(looksLikeTask)
  const recurring = [
    ...model.routines,
    ...ask.recurring.filter(item => !looksLikeTask(item)),
  ]
  const routines: RecommendedRoutine[] = recurring.map((title, index) => ({
    title,
    ownerTitle: personas[Math.min(index, personas.length - 1)]?.title ?? 'Coordenação',
  }))
  const owner = ask.ownerHumanId ?? 'you'
  const preview = previewSnapshot(ask, personas, routines, extraSectors, owner)
  const twoDay = runTwoDayTest(preview, '2026-11-03T09:00:00.000Z')
  return {
    company: ask.company,
    explanation:
      `Uma persona por função contínua (${personas.map(row => row.title).join(', ')}). `
      + 'Tarefa pontual vai para o quadro; rotina recorrente ganha dono. '
      + `Comece com ${String(personas.length)} (cabe em 3–5) e cresça quando a fila pedir.`,
    personas,
    routines,
    tasks,
    preview,
    org: orgChart(preview, 'person'),
    twoDay,
    health: assessTeamHealth(preview, '2026-11-03T09:00:00.000Z'),
  }
}

function modelApprovals(company: CompanyKind, sectorName: string): readonly string[] {
  const fn = companyModelById(company).functions.find(row => row.sectorName === sectorName)
  return fn?.requiredApprovals ?? []
}

function previewSnapshot(
  ask: StructureAsk,
  personas: readonly RecommendedPersona[],
  routines: readonly RecommendedRoutine[],
  extraSectors: readonly string[],
  owner: string,
): GovernanceSnapshot {
  const sectorNames = [...new Set([
    ...personas.map(row => row.sectorName),
    ...ask.sectorNames,
    ...extraSectors,
  ])]
  const sectors = sectorNames.map((name, index) => {
    const approvals = modelApprovals(ask.company, name)
    return {
      id: `sec-${slug(name, index)}`,
      workspaceId: 'preview',
      name,
      policy: approvals.length === 0
        ? defaultSectorPolicy()
        : { autonomy: 'propose' as const, requiredApprovals: approvals },
    }
  })
  const roster = personas.map((row, index) => ({
    id: row.id,
    title: row.title,
    systemRoles: index === 0 ? ['coordination' as const, 'team_manager' as const] : [],
  }))
  const charges = personas.map((row) => {
    const sector = sectors.find(item => item.name === row.sectorName)
    return assignPersonaCharge({
      personaId: row.id,
      responsibleHumanId: owner,
      ...(sector === undefined ? {} : { sectorId: sector.id }),
    })
  })
  return {
    workspaceId: 'preview',
    humans: [{ id: owner, name: 'Você' }],
    personas: roster,
    sectors,
    charges,
    away: [],
    routines: routines.map((row, index) => {
      const ownerPersona = personas.find(item => item.title === row.ownerTitle) ?? personas[0]
      const sector = sectors.find(item => item.name === ownerPersona?.sectorName)
      const pay = sector?.policy.requiredApprovals.includes('payment') === true
      return {
        routineId: `rt-${String(index)}`,
        title: row.title,
        responsibleHumanId: owner,
        requiresApproval: pay,
        cadence: 'daily' as const,
        ...(ownerPersona === undefined ? {} : { executorPersonaId: ownerPersona.id }),
        ...(sector === undefined ? {} : { sectorId: sector.id }),
        ...(pay ? { approvalKind: 'payment' } : {}),
      }
    }),
  }
}

const COMPANY_HINTS: { id: CompanyKind; keys: readonly string[] }[] = [
  { id: 'agencia', keys: ['agencia', 'agência'] },
  { id: 'loja_online', keys: ['loja', 'e-commerce', 'ecommerce'] },
  { id: 'saas', keys: ['saas', 'software'] },
  { id: 'consultoria', keys: ['consultoria'] },
  { id: 'criador', keys: ['criador', 'conteudo', 'conteúdo'] },
  { id: 'escritorio', keys: ['escritorio', 'escritório'] },
]

/**
 * Dirty parser: company + setores + trabalhos que se repetem.
 * @param text - Free text from the assistant step.
 */
export function parseStructureAsk(text: string): StructureAsk {
  const lower = text.toLowerCase()
  let company: CompanyKind = 'escritorio'
  for (const hint of COMPANY_HINTS) {
    if (hint.keys.some(key => lower.includes(key))) {
      company = hint.id
      break
    }
  }
  const sectorMatch = /setores?\s*[:\-]\s*([^\n.]+)/iu.exec(text)
  const sectorNames = sectorMatch?.[1]?.split(/[,;/]/u).map(part => part.trim()).filter(part => part.length > 0) ?? []
  const recMatch = /(?:repete|toda semana|rotinas?)\s*[:\-]\s*([^\n]+)/iu.exec(text)
  const recurring = recMatch?.[1]?.split(/[,;/]/u).map(part => part.trim()).filter(part => part.length > 0) ?? []
  return { company, sectorNames, recurring }
}
