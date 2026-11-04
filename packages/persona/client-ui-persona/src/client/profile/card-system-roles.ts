import type { SystemRoleView } from '@deepseek-ai/dsh-persona-host/types'

/** Roles shown on profile cards and channel strip (excludes librarian, etc.). */
export type PersonaCardSystemRole = 'coordination' | 'watchdog' | 'team_manager'

export function cardSystemRoles(roles: readonly SystemRoleView[]): readonly PersonaCardSystemRole[] {
  return roles.filter((role): role is PersonaCardSystemRole =>
    role === 'coordination' || role === 'watchdog' || role === 'team_manager')
}
