import type { SectorOption } from './structure-types.ts'

/** Default editable sectors (GOVERNANCE.md §1). Labels are locale keys under `sector.*`. */
export const DEFAULT_SECTORS: readonly SectorOption[] = [
  { id: 'vendas', labelKey: 'sector.vendas' },
  { id: 'suporte', labelKey: 'sector.suporte' },
  { id: 'produto', labelKey: 'sector.produto' },
  { id: 'engenharia', labelKey: 'sector.engenharia' },
  { id: 'marketing', labelKey: 'sector.marketing' },
  { id: 'financeiro', labelKey: 'sector.financeiro' },
  { id: 'operacoes', labelKey: 'sector.operacoes' },
  { id: 'pessoas', labelKey: 'sector.pessoas' },
]
