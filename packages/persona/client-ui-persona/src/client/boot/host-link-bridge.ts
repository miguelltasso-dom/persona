/**
 * boot-estatico (persona-spec/contracts/boot-estatico.md §3/§5): the bridge between the Desktop's boot channels and the host link of the static shell.
 *
 * The names are the Rivet's phase 1 (window.personaBoot, apps/desktop/src/preload-app.ts):
 *  - `onPhase(listener(phase, detail?))`: runs ONCE on subscription with the CURRENT phase, then on every push. `phase` is `'starting'` (= waking) or `'host-ready'` (= ready);
 *    `detail.url` comes only with `'host-ready'` and is the ORIGIN of the host (never the URL with a token);
 *  - `subscribe(listener({ code, message }))`: FAILURE only (any push from it is a failure), with `retry()` and `diagnostic()` as before; a retry puts the phase back to `'starting'`.
 * Outside the Desktop (a served page, a test) there is no bridge: the link is `ready` at once, nothing waits.
 */

import { useCallback, useSyncExternalStore } from 'react'
import { createHostLink, type HostLink, type HostLinkState } from './late-transport.ts'

/** What this module needs of `window.personaBoot`. */
export interface PersonaBootBridge {
  onPhase(listener: (phase: string, detail?: { readonly url?: string }) => void): () => void
  subscribe(listener: (detail: { readonly code: string; readonly message: string }) => void): () => void
}

/** The state-only face of the host link (what the screen and the stream gate need). */
export type BootHostLink = HostLink<never, never>

/**
 * Wire a link to the Desktop's boot channels.
 * @param link - The link to drive.
 * @param bridge - `window.personaBoot`.
 * @param onOrigin - Receives the host origin when it comes (with `'host-ready'`), before the link turns ready.
 * @returns Unsubscribe.
 */
export function connectHostLink(link: BootHostLink, bridge: PersonaBootBridge, onOrigin?: (origin: string) => void): () => void {
  const offPhase = bridge.onPhase((phase, detail) => {
    if (phase === 'host-ready') {
      if (detail?.url !== undefined && detail.url !== '') onOrigin?.(detail.url)
      link.markReady()
    } else if (phase === 'starting' && link.state() === 'failed') {
      link.retry() // the person pressed "Tentar de novo": the main starts again, and so does the wait
    }
  })
  const offFailure = bridge.subscribe((detail) => { link.markFailed(detail.message) })
  return () => { offPhase(); offFailure() }
}

/**
 * A link that carries no calls (the main holds the unary requests; the stream is gated by {@link createLateWebSocketFactory}), only the state.
 * @returns The link, `waking`.
 */
export function createStateLink(): BootHostLink {
  return createHostLink<never, never>({ send: () => Promise.reject(new Error('the boot host link carries no calls')) })
}

interface BootGlobal { personaBoot?: PersonaBootBridge }

let shared: { readonly link: BootHostLink; origin: string | undefined } | undefined

/**
 * The host link of this page: driven by `window.personaBoot` in the Desktop, `ready` from the start anywhere else.
 * @returns The link and the host origin once it is known.
 */
function sharedLink(): { readonly link: BootHostLink; origin: string | undefined } {
  if (shared !== undefined) return shared
  const link = createStateLink()
  const state: { readonly link: BootHostLink; origin: string | undefined } = { link, origin: undefined }
  const bridge = (globalThis as BootGlobal).personaBoot
  if (bridge === undefined) link.markReady()
  else connectHostLink(link, bridge, (origin) => { state.origin = origin })
  shared = state
  return state
}

/** @returns The host link of this page. */
export function bootHostLink(): BootHostLink {
  return sharedLink().link
}

/** @returns The origin of the host (`http://127.0.0.1:<port>`) once the Desktop announced it; undefined before, and outside the Desktop. */
export function bootHostOrigin(): string | undefined {
  return sharedLink().origin
}

/** Forget the shared link (a test installs a different bridge). */
export function resetBootHostLinkForTests(): void {
  shared?.link.dispose()
  shared = undefined
}

/**
 * The state of the link with the host, for the screen: `waking` shows the calm "Acordando o time…", `ready` the data, `failed` the existing boot-failure flow.
 * @param link - Defaults to the page's link.
 * @returns The current state.
 */
export function useHostLink(link: BootHostLink = bootHostLink()): HostLinkState {
  const subscribe = useCallback((onChange: () => void) => link.subscribe(() => { onChange() }), [link])
  return useSyncExternalStore(subscribe, link.state, link.state)
}
