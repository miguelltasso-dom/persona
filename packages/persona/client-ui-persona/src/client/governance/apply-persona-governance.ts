import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { PersonaRemoteClient } from '../data/lumen-inject.ts'
import { unwrapRemote } from '../data/remote-call.ts'
import type { PersonaDraft } from '../persona-editor/persona-draft.ts'

/** Persists governance fields when host GOV-5 exposes `setPersonaGovernance`. */
export async function applyPersonaGovernanceIfSupported(
  client: PersonaRemoteClient,
  scope: { workspaceId: string; projectId: string },
  personaId: string,
  draft: PersonaDraft,
): Promise<void> {
  if (!('setPersonaGovernance' in client) || typeof client.setPersonaGovernance !== 'function') return
  if (draft.responsibleMemberId.trim().length === 0) return
  await unwrapRemote(
    await client.setPersonaGovernance({
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      personaId,
      sectorId: draft.sectorId,
      responsibleMemberId: draft.responsibleMemberId,
      substituteMemberId: draft.substituteMemberId.trim(),
    }) as RemoteResult<void>,
  )
}
