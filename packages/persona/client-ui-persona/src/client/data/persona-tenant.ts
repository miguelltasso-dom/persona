/** Active workspace/project scope for Lumen Remote calls. */

import type { ClientRemote } from '@deepseek-ai/dsh-api-remotes/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'

export const PERSONA_DEFAULT_WORKSPACE_ID = 'ws'
export const PERSONA_DEFAULT_PERSONAL_PROJECT_ID = 'pp'

export interface PersonaTenantScope {
  readonly workspaceId: string
  readonly projectId: string
  readonly actorId: string
}

export type PersonaTenantStatus = 'loading' | 'ready' | 'error'

export interface PersonaTenantSnapshot {
  readonly status: PersonaTenantStatus
  readonly scope: PersonaTenantScope | null
}

const INITIAL: PersonaTenantSnapshot = { status: 'loading', scope: null }

type PersonaRemote = ClientRemote['persona']

/** Resolves tenant scope (creates demo workspace when empty). */
export async function bootstrapPersonaTenant(remote: PersonaRemote): Promise<PersonaTenantScope> {
  const workspaceId = PERSONA_DEFAULT_WORKSPACE_ID
  let onboarding = await remote.getOnboarding({ workspaceId, projectId: PERSONA_DEFAULT_PERSONAL_PROJECT_ID })
  if (!onboarding.ok) throw new Error(onboarding.error.code)
  if (!onboarding.value.hasPersonalProject) {
    const created = await remote.createWorkspace({
      id: workspaceId,
      name: 'Persona',
      personalProjectId: PERSONA_DEFAULT_PERSONAL_PROJECT_ID,
    })
    if (!created.ok) throw new Error(created.error.code)
    onboarding = await remote.getOnboarding({ workspaceId, projectId: PERSONA_DEFAULT_PERSONAL_PROJECT_ID })
    if (!onboarding.ok) throw new Error(onboarding.error.code)
  }
  const projectId = onboarding.value.personalProjectId || PERSONA_DEFAULT_PERSONAL_PROJECT_ID
  const scope = { workspaceId, projectId, actorId: 'owner' }
  const team = await remote.listTeam({ workspaceId, projectId })
  const firstMember = team.ok ? team.value.members[0] : undefined
  if (firstMember !== undefined) {
    return { ...scope, actorId: firstMember.id }
  }
  const member = await remote.createMember({
    id: 'owner',
    workspaceId,
    projectId,
    displayName: 'Você',
    handle: 'voce',
    role: 'owner',
  })
  if (!member.ok) throw new Error(member.error.code)
  return { ...scope, actorId: member.value.id }
}

/** Observable tenant handle for slot inject. */
export function createPersonaTenantStore(): {
  readonly store: ReturnType<typeof createSnapshotStore<PersonaTenantSnapshot>>
  bootstrap(remote: PersonaRemote): void
} {
  const store = createSnapshotStore(INITIAL)
  return {
    store,
    bootstrap(remote) {
      void bootstrapPersonaTenant(remote).then((scope) => {
        store.set({ status: 'ready', scope })
      }).catch(() => {
        store.set({ status: 'error', scope: null })
      })
    },
  }
}
