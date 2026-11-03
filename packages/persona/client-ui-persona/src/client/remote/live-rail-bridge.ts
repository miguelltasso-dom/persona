import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { RailPersona } from '../shell/RailTeam.tsx'
import type { ShellStoreHandle } from '../shell/create-shell-store.ts'
import { mapRailTeamFromLive } from './map-rail-team.ts'
import type { PersonaLiveStore } from './persona-live-store.ts'

/** Rail team observable: live roster + shell host connectivity. */
export function createLiveRailTeamObservable(
  live: PersonaLiveStore,
  shell: ShellStoreHandle,
): HostObservable<readonly RailPersona[]> {
  // useSyncExternalStore needs a stable snapshot: recompute only when an input reference changes (else React #185).
  let lastSnap: ReturnType<PersonaLiveStore['observable']['getSnapshot']> | undefined
  let lastOnline: boolean | undefined
  let lastRows: readonly RailPersona[] = []
  return {
    getSnapshot(): readonly RailPersona[] {
      const snap = live.observable.getSnapshot()
      const hostOnline = shell.store.getSnapshot().hostStatus === 'online'
      if (snap !== lastSnap || hostOnline !== lastOnline) {
        lastSnap = snap
        lastOnline = hostOnline
        lastRows = mapRailTeamFromLive(snap, hostOnline)
      }
      return lastRows
    },
    subscribe(listener: () => void): () => void {
      const u1 = live.observable.subscribe(listener)
      const u2 = shell.store.subscribe(listener)
      return () => {
        u1()
        u2()
      }
    },
  }
}
