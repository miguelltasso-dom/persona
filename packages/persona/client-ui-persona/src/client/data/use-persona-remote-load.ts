import { useCallback, useEffect, useRef, useState } from 'react'
import type { RemoteLoadState } from './remote-call.ts'
import { REMOTE_PANEL_TIMEOUT_MS } from './remote-panel-timeout.ts'

/** Instrumentation: fetch starts per `fetchKey` (tests / Keel diag). */
export const personaRemoteLoadStartCounts = new Map<string, number>()

export interface PersonaRemoteLoadResult<T> {
  readonly state: RemoteLoadState<T>
  readonly retry: () => void
}

function raceWithTimeout<T>(load: () => Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { reject(new Error('remote-timeout')) }, ms)
    void load().then(
      (data) => {
        clearTimeout(timer)
        resolve(data)
      },
      (err: unknown) => {
        clearTimeout(timer)
        reject(err instanceof Error ? err : new Error('remote-failed'))
      },
    )
  })
}

/**
 * Load host data when scope becomes ready; times out to error.
 * Fetch runs only when `enabled` or `loadKey` changes — `load` identity is ignored (ref) so panels do not storm the host.
 */
export function usePersonaRemoteLoad<T>(
  enabled: boolean,
  loadKey: string,
  load: () => Promise<T>,
): PersonaRemoteLoadResult<T> {
  const loadRef = useRef(load)
  loadRef.current = load
  const [retryGen, setRetryGen] = useState(0)
  const [state, setState] = useState<RemoteLoadState<T>>({ status: 'loading' })
  const retry = useCallback(() => { setRetryGen(n => n + 1) }, [])
  const fetchKey = `${loadKey}:${retryGen}`

  useEffect(() => {
    if (!enabled) {
      setState({ status: 'loading' })
      return
    }
    let cancelled = false
    personaRemoteLoadStartCounts.set(fetchKey, (personaRemoteLoadStartCounts.get(fetchKey) ?? 0) + 1)
    setState({ status: 'loading' })
    void raceWithTimeout(() => loadRef.current(), REMOTE_PANEL_TIMEOUT_MS).then((data) => {
      if (!cancelled) setState({ status: 'ready', data })
    }).catch(() => {
      if (!cancelled) setState({ status: 'error' })
    })
    return () => { cancelled = true }
  }, [enabled, fetchKey])

  return { state, retry }
}
