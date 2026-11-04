/** Maps {@link PersonaLiveStore} snapshot to Lumen tenant inject (single bootstrap path). */

import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { PersonaLiveStore, PersonaLiveSnapshot } from '../remote/persona-live-store.ts'
import type { PersonaTenantSnapshot } from './persona-tenant.ts'

const TENANT_LOADING: PersonaTenantSnapshot = { status: 'loading', scope: null }
const TENANT_ERROR: PersonaTenantSnapshot = { status: 'error', scope: null }

function tenantFromLiveSnap(snap: PersonaLiveSnapshot): PersonaTenantSnapshot {
  // Refresh failures must not block Lumen panels when workspace scope is already known (empty team is valid).
  if (snap.error !== null && (!snap.ready || snap.tenant === null)) return TENANT_ERROR
  if (!snap.ready || snap.tenant === null) return TENANT_LOADING
  return {
    status: 'ready',
    scope: {
      workspaceId: snap.tenant.workspaceId,
      projectId: snap.tenant.projectId,
      actorId: snap.tenant.memberId,
    },
  }
}

function tenantSnapshotsEqual(a: PersonaTenantSnapshot, b: PersonaTenantSnapshot): boolean {
  if (a.status !== b.status) return false
  if (a.scope === null && b.scope === null) return true
  if (a.scope === null || b.scope === null) return false
  return a.scope.workspaceId === b.scope.workspaceId
    && a.scope.projectId === b.scope.projectId
    && a.scope.actorId === b.scope.actorId
}

/** Tenant observable derived from Prism live store (no duplicate bootstrap). */
export function createLiveTenantObservable(live: PersonaLiveStore): HostObservable<PersonaTenantSnapshot> {
  let cachedLiveSnap: PersonaLiveSnapshot | undefined
  let cachedTenant: PersonaTenantSnapshot = TENANT_LOADING

  return {
    getSnapshot(): PersonaTenantSnapshot {
      const snap = live.observable.getSnapshot()
      if (snap === cachedLiveSnap) return cachedTenant
      cachedLiveSnap = snap
      const next = tenantFromLiveSnap(snap)
      if (!tenantSnapshotsEqual(next, cachedTenant)) {
        if (next.status === 'loading') cachedTenant = TENANT_LOADING
        else if (next.status === 'error') cachedTenant = TENANT_ERROR
        else cachedTenant = next
      }
      return cachedTenant
    },
    subscribe: listener => live.observable.subscribe(listener),
  }
}
