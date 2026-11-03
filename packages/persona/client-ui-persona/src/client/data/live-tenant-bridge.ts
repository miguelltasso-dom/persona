/** Maps {@link PersonaLiveStore} snapshot to Lumen tenant inject (single bootstrap path). */

import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { PersonaLiveStore } from '../remote/persona-live-store.ts'
import type { PersonaTenantSnapshot } from './persona-tenant.ts'

/** Tenant observable derived from Prism live store (no duplicate bootstrap). */
export function createLiveTenantObservable(live: PersonaLiveStore): HostObservable<PersonaTenantSnapshot> {
  return {
    getSnapshot(): PersonaTenantSnapshot {
      const snap = live.observable.getSnapshot()
      if (snap.error !== null) return { status: 'error', scope: null }
      if (!snap.ready || snap.tenant === null) return { status: 'loading', scope: null }
      return {
        status: 'ready',
        scope: {
          workspaceId: snap.tenant.workspaceId,
          projectId: snap.tenant.projectId,
          actorId: snap.tenant.memberId,
        },
      }
    },
    subscribe: listener => live.observable.subscribe(listener),
  }
}
