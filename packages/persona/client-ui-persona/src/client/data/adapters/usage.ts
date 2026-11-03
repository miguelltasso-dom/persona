import type { ProjectLimitsView } from '@deepseek-ai/dsh-persona-host/types'
import type { UsageMeter } from '../../usage/mock-data.ts'

/** Project limits → usage meters (until dedicated usage RPC lands). */
export function limitsToUsageMeters(limits: ProjectLimitsView): UsageMeter[] {
  return [
    {
      id: 'project-tokens',
      label: 'Projeto (orçamento mensal)',
      origin: 'official',
      percent: Math.min(100, Math.round(limits.tokensPerProjectMonth / 12_000)),
    },
    {
      id: 'persona-tokens',
      label: 'Por persona (orçamento mensal)',
      origin: 'official',
      percent: Math.min(100, Math.round(limits.tokensPerPersonaMonth / 5000)),
    },
    {
      id: 'proposals',
      label: 'Propostas / dia (teto)',
      origin: 'measured',
      percent: Math.min(100, limits.maxProposalsPerDay * 10),
    },
  ]
}
