import type { PersonaLiveSnapshot } from '../remote/persona-live-store.ts'

/**
 * Human-readable project labels for the profile overview (not raw ids).
 * @param live - Current live snapshot.
 * @param scopeProjectId - Active tenant project when the roster has no rows yet.
 */
export function resolveProfileProjectNames(
  live: PersonaLiveSnapshot,
  scopeProjectId: string | undefined,
): readonly string[] {
  const names = live.projects
    .map(project => project.name.trim())
    .filter(name => name.length > 0)
  if (names.length > 0) return names
  if (scopeProjectId !== undefined && scopeProjectId.length > 0) return [scopeProjectId]
  return []
}
