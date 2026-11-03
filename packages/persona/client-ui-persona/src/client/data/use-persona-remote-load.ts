import { useCallback, useEffect, useState } from 'react'
import type { RemoteLoadState } from './remote-call.ts'
import { REMOTE_PANEL_TIMEOUT_MS } from './remote-panel-timeout.ts'

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

/** Load host data when scope becomes ready; times out to error. */
export function usePersonaRemoteLoad<T>(
  enabled: boolean,
  scopeKey: string,
  load: () => Promise<T>,
): PersonaRemoteLoadResult<T> {
  const [retryGen, setRetryGen] = useState(0)
  const [state, setState] = useState<RemoteLoadState<T>>({ status: 'loading' })
  const retry = useCallback(() => { setRetryGen(n => n + 1) }, [])
  const loadKey = `${scopeKey}:${retryGen}`

  useEffect(() => {
    if (!enabled) {
      setState({ status: 'loading' })
      return
    }
    let cancelled = false
    setState({ status: 'loading' })
    void raceWithTimeout(load, REMOTE_PANEL_TIMEOUT_MS).then((data) => {
      if (!cancelled) setState({ status: 'ready', data })
    }).catch(() => {
      if (!cancelled) setState({ status: 'error' })
    })
    return () => { cancelled = true }
  }, [enabled, loadKey, load])

  return { state, retry }
}
