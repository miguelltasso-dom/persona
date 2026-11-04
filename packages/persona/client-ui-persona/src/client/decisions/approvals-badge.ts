/** The rail badge "Aprovações · n" reads the same count as the Visão geral chip (one array, one number). */

import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { PersonaLiveStore } from '../remote/persona-live-store.ts'
import { openBlockingCount } from './decision-selectors.ts'

export interface ApprovalsBadgeSnapshot {
  readonly pending: number
}

/** Observable with a stable snapshot identity until the number changes (no re-render churn in the rail). */
export function createApprovalsBadgeObservable(live: Pick<PersonaLiveStore, 'observable'>): HostObservable<ApprovalsBadgeSnapshot> {
  let cached: ApprovalsBadgeSnapshot = { pending: 0 }
  return {
    getSnapshot(): ApprovalsBadgeSnapshot {
      const pending = openBlockingCount(live.observable.getSnapshot().decisions)
      if (pending !== cached.pending) cached = { pending }
      return cached
    },
    subscribe: listener => live.observable.subscribe(listener),
  }
}
