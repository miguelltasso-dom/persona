import { useCallback } from 'react'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { ProjectScopeRequest } from '@deepseek-ai/dsh-persona-host/types'
import type { PersonaRemoteClient } from './lumen-inject.ts'
import { unwrapRemote } from './remote-call.ts'
import { usePersonaRemoteLoad } from './use-persona-remote-load.ts'

interface ProjectListWire {
  listProjects?(request: ProjectScopeRequest): Promise<RemoteResult<readonly { readonly id: string; readonly name: string }[]>>
}

/**
 * The name of the project of the moment, for the screens that say which project they show ("Projeto: Pessoal"): never the raw id.
 * `null` while the list loads, when there is no project of the moment, when the host cannot list projects, or when the project is not in the list.
 *
 * @param persona The host Remote.
 * @param scope The workspace scope the project list is read under.
 * @param projectId The project of the moment (the shell's `projectWorkspaceProjectId`); null = none.
 * @returns The project's name, or null.
 */
export function useProjectName(persona: PersonaRemoteClient, scope: ProjectScopeRequest | null, projectId: string | null): string | null {
  // An older host (or a test double) may not list projects: the call is optional here even though the current client types it.
  const wire: ProjectListWire = persona
  const enabled = scope !== null && projectId !== null && projectId !== '' && wire.listProjects !== undefined
  const load = useCallback(async () => {
    if (scope === null || wire.listProjects === undefined) throw new Error('no-scope')
    return unwrapRemote(await wire.listProjects(scope))
  }, [wire, scope?.workspaceId, scope?.projectId])
  const { state } = usePersonaRemoteLoad(enabled, `${scope?.workspaceId ?? ''}:${scope?.projectId ?? ''}:project-names`, load)
  if (!enabled || state.status !== 'ready') return null
  return state.data.find(row => row.id === projectId)?.name ?? null
}
