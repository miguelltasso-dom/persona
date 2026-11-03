import type { KanbanCardModel, KanbanFilterOptions, KanbanPersonaRef } from './types.ts'

/** Build filter dropdowns from live cards (production kanban). */
export function deriveKanbanFilterOptions(cards: readonly KanbanCardModel[]): KanbanFilterOptions {
  const teamMap = new Map<string, string>()
  const projectMap = new Map<string, string>()
  const personaMap = new Map<string, KanbanPersonaRef>()
  for (const card of cards) {
    teamMap.set(card.teamId, card.teamName)
    projectMap.set(card.projectId, card.projectName)
    if (card.assignee !== undefined) {
      personaMap.set(card.assignee.id, card.assignee)
    }
  }
  return {
    teams: [...teamMap.entries()].map(([id, name]) => ({ id, name })),
    projects: [...projectMap.entries()].map(([id, name]) => ({ id, name })),
    personas: [...personaMap.values()],
  }
}
