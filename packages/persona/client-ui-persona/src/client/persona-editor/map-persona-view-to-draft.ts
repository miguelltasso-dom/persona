import type { PersonaView } from '../remote/persona-remote-types.ts'
import type { AutonomyLevel, PersonaDraft } from './persona-draft.ts'
import { MOCK_PERSONA_DRAFT } from './persona-draft.ts'

/** Maps host roster row + loaded autonomy tier into editor draft (partial host fields). */
export function personaViewToDraft(
  view: PersonaView,
  autonomyLevel: AutonomyLevel,
): PersonaDraft {
  const avatarSource = view.avatarKind === 'upload'
    ? 'upload'
    : view.avatarKind === 'silhouette'
      ? 'silhouette'
      : 'gallery'
  return {
    ...MOCK_PERSONA_DRAFT,
    name: view.name,
    avatarSource,
    jobTitle: view.title,
    jobDescription: view.description,
    autonomyLevel,
    coordination: view.systemRoles.includes('coordination'),
    watchdog: view.systemRoles.includes('watchdog'),
    teamManager: view.systemRoles.includes('team_manager'),
  }
}
