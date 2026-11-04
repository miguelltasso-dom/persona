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
  // O host não manda personalidade, instruções nem habilidades: o rascunho de exemplo (Luna) nunca vale para uma
  // persona real. O bicho vem do host; sem ele, nada (o editor mostra a silhueta, não o gato da Luna).
  const { avatarRef: _exampleAvatar, personality: _p, instructions: _i, skills: _s, ...base } = MOCK_PERSONA_DRAFT
  void _exampleAvatar; void _p; void _i; void _s
  const galleryRef = avatarSource === 'gallery' && view.avatarRef.trim() !== '' ? view.avatarRef.trim().toLowerCase() : undefined
  return {
    ...base,
    personality: '',
    instructions: '',
    skills: '',
    ...(galleryRef === undefined ? {} : { avatarRef: galleryRef }),
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
