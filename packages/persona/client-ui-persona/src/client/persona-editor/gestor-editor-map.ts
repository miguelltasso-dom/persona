import type { GestorMandateView } from '@deepseek-ai/dsh-persona-host/types'
import type { GestorApproval, GestorLimitsValue } from '../primitives/Gestor.tsx'

export const DEFAULT_GESTOR_LIMITS_UI: GestorLimitsValue = {
  approval: 'ask',
  maxPersonas: 8,
  budget: 'normal',
  areas: [],
  canGrantGestor: false,
}

const BUDGET_TO_TOKENS: Readonly<Record<string, number>> = {
  pouco: 20_000,
  normal: 50_000,
  bastante: 120_000,
}

const TOKENS_TO_BUDGET = (tokens: number): string => {
  if (tokens <= 0) return 'normal'
  if (tokens <= 25_000) return 'pouco'
  if (tokens <= 70_000) return 'normal'
  return 'bastante'
}

export function mandateViewToGestorLimits(view: GestorMandateView): GestorLimitsValue {
  const sectorIds = [...view.sectorIds]
  const projectIds = [...view.projectIds]
  const areas = sectorIds.length > 0 || projectIds.length > 0 ? [...sectorIds, ...projectIds] : []
  const approval: GestorApproval = view.approval === 'auto_within_limits'
    ? 'auto-within'
    : view.approval === 'auto_and_notify'
      ? 'auto-notify'
      : 'ask'
  return {
    approval,
    maxPersonas: view.maxPersonas,
    budget: TOKENS_TO_BUDGET(view.budgetTokens),
    areas,
    canGrantGestor: view.canGrantGestor,
  }
}

export function gestorLimitsToSetRequest(
  personaId: string,
  workspaceId: string,
  value: GestorLimitsValue,
  sectorIds: readonly string[],
  projectIds: readonly string[],
): GestorMandateView {
  const approval = value.approval === 'auto-within'
    ? 'auto_within_limits'
    : value.approval === 'auto-notify'
      ? 'auto_and_notify'
      : 'always_ask'
  const pickedSectors = value.areas.filter(id => sectorIds.includes(id))
  const pickedProjects = value.areas.filter(id => projectIds.includes(id))
  const scopeSectors = value.areas.length === 0 ? [] : pickedSectors
  const scopeProjects = value.areas.length === 0 ? [] : pickedProjects
  return {
    personaId,
    workspaceId,
    approval,
    maxPersonas: value.maxPersonas,
    budgetTokens: BUDGET_TO_TOKENS[value.budget] ?? BUDGET_TO_TOKENS['normal']!,
    allowedTools: [],
    allowedEngines: [],
    sectorIds: scopeSectors,
    projectIds: scopeProjects,
    canGrantGestor: value.canGrantGestor,
  }
}
