import { pt as governancePt } from '../locale/governance/locales.ts'
import { DEFAULT_SECTORS } from './default-sectors.ts'

/** Host `recommendStructure` expects human sector names (GOV-5). */
export function sectorNamesForIds(ids: readonly string[]): readonly string[] {
  return ids.map((id) => {
    const row = DEFAULT_SECTORS.find(sector => sector.id === id)
    if (row === undefined) return id
    const label = governancePt[row.labelKey as keyof typeof governancePt]
    return typeof label === 'string' ? label : id
  })
}

const SECTOR_NAME_ALIASES: Readonly<Record<string, string>> = {
  atendimento: 'suporte',
  criação: 'marketing',
  criacao: 'marketing',
  mídia: 'marketing',
  midia: 'marketing',
  conteúdo: 'marketing',
  conteudo: 'marketing',
  comunidade: 'marketing',
  pesquisa: 'produto',
  entrega: 'operacoes',
  catálogo: 'produto',
  catalogo: 'produto',
  logística: 'operacoes',
  logistica: 'operacoes',
  loja: 'vendas',
}

/** Map host sector label back to client sector id for drafts. */
export function sectorIdFromHostName(name: string): string {
  const normalized = name.trim().toLowerCase()
  for (const row of DEFAULT_SECTORS) {
    const label = governancePt[row.labelKey as keyof typeof governancePt]
    if (typeof label === 'string' && label.toLowerCase() === normalized) return row.id
  }
  const alias = SECTOR_NAME_ALIASES[normalized]
  if (alias !== undefined) return alias
  return 'operacoes'
}
