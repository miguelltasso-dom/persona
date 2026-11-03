// Snapshot stability of derived HostObservables (Keel): useSyncExternalStore requires getSnapshot to return the SAME
// reference while inputs are unchanged, otherwise React throws #185 (maximum update depth) and the slot renders blank.
import { describe, expect, it } from 'vitest'
import { createLiveTenantObservable } from '../src/client/data/live-tenant-bridge.ts'
import { createLiveRailTeamObservable } from '../src/client/remote/live-rail-bridge.ts'
import type { PersonaLiveSnapshot, PersonaLiveStore } from '../src/client/remote/persona-live-store.ts'
import { createShellStore } from '../src/client/shell/create-shell-store.ts'
import { MOCK_CHANNEL_ROSTER } from '../src/client/team/mock-channel-roster.ts'

function fakeLive(initial: PersonaLiveSnapshot): { live: PersonaLiveStore; set(next: PersonaLiveSnapshot): void } {
  let snap = initial
  const listeners = new Set<() => void>()
  const live = {
    observable: {
      getSnapshot: () => snap,
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
    },
  } as unknown as PersonaLiveStore
  return {
    live,
    set(next) {
      snap = next
      for (const listener of listeners) listener()
    },
  }
}

const READY: PersonaLiveSnapshot = {
  ready: true,
  tenant: { workspaceId: 'w', projectId: 'p', memberId: 'm' },
  team: null,
  nowRows: [],
  stripMembers: MOCK_CHANNEL_ROSTER,
  awayEvents: [],
  attentionTitles: [],
  messages: [],
  projects: [],
  kanbanCards: [],
  error: null,
} as unknown as PersonaLiveSnapshot

describe('observable bridges keep snapshot references stable', () => {
  it('rail team: same reference until the live snapshot or host status changes', () => {
    const { live, set } = fakeLive(READY)
    const shell = createShellStore()
    const team = createLiveRailTeamObservable(live, shell)
    const first = team.getSnapshot()
    expect(team.getSnapshot()).toBe(first)
    expect(team.getSnapshot()).toBe(first)
    set({ ...READY })
    const second = team.getSnapshot()
    expect(team.getSnapshot()).toBe(second)
    shell.actions.setHostPing(true, 1)
    const third = team.getSnapshot()
    expect(team.getSnapshot()).toBe(third)
  })

  it('tenant: same reference across calls', () => {
    const { live, set } = fakeLive(READY)
    const tenant = createLiveTenantObservable(live)
    const first = tenant.getSnapshot()
    expect(tenant.getSnapshot()).toBe(first)
    set({ ...READY })
    expect(tenant.getSnapshot()).toBe(tenant.getSnapshot())
  })
})
