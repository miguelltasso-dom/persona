import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { GestorMandateView, SetPersonaSystemRolesRequest } from '@deepseek-ai/dsh-persona-host/types'
import type { PersonaRemoteClient } from '../data/lumen-inject.ts'
import { unwrapRemote } from '../data/remote-call.ts'
import type { PersonaDraft } from './persona-draft.ts'
import { gestorLimitsToSetRequest } from './gestor-editor-map.ts'

type GestorRemote = PersonaRemoteClient & {
  readonly getGestorMandate?: (request: { workspaceId: string; personaId: string }) => unknown
  readonly setGestorLimits?: (request: GestorMandateView) => unknown
  readonly setPersonaSystemRoles?: (request: SetPersonaSystemRolesRequest) => unknown
}

/** Persists Gestor de equipe role + mandate when host exposes Gestor remotes. */
export async function applyGestorSettingsIfSupported(
  client: GestorRemote,
  scope: { workspaceId: string; projectId: string },
  personaId: string,
  draft: PersonaDraft,
  sectorIds: readonly string[],
  projectIds: readonly string[],
): Promise<void> {
  const roles: ('coordination' | 'watchdog' | 'team_manager')[] = []
  if (draft.coordination) roles.push('coordination')
  if (draft.watchdog) roles.push('watchdog')
  if (draft.teamManager) roles.push('team_manager')
  if (client.setPersonaSystemRoles !== undefined) {
    await unwrapRemote(
      await client.setPersonaSystemRoles({
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        personaId,
        systemRoles: roles,
      }) as RemoteResult<void>,
    )
  }
  if (!draft.teamManager || client.setGestorLimits === undefined) return
  const mandate = gestorLimitsToSetRequest(personaId, scope.workspaceId, draft.gestorLimits, sectorIds, projectIds)
  await unwrapRemote(await client.setGestorLimits(mandate) as RemoteResult<GestorMandateView>)
}
