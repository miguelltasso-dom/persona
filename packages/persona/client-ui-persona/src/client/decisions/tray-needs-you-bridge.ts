/**
 * The tray "precisa de você" state reads the same number as the Visão geral chip and the rail badge (DECISIONS-SPEC
 * Regra 2). The desktop shell exposes `personaAlwaysOn.needsYouCount(n)`; on the web (or an older shell) nothing is
 * there and this is a no-op. It SETS the count — it never increments — so deciding a card lowers the tray too.
 */

import type { PersonaLiveStore } from '../remote/persona-live-store.ts'
import { openBlockingCount } from './decision-selectors.ts'

interface AlwaysOnBridge {
  readonly needsYouCount?: ((count: number) => void) | undefined
}

export interface TrayHost {
  readonly personaAlwaysOn?: AlwaysOnBridge | undefined
}

/** @returns unsubscribe. Sends the current number once, then only when it changes. */
export function bindTrayNeedsYou(
  live: Pick<PersonaLiveStore, 'observable'>,
  host: TrayHost = globalThis as unknown as TrayHost,
): () => void {
  let last = -1
  const push = (): void => {
    const send = host.personaAlwaysOn?.needsYouCount
    if (send === undefined) return
    const count = openBlockingCount(live.observable.getSnapshot().decisions)
    if (count === last) return
    last = count
    try {
      send(count)
    } catch {
      /* the tray is a courtesy: never break the app for it */
    }
  }
  push()
  return live.observable.subscribe(push)
}
