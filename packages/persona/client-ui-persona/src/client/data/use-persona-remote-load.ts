import { useEffect, useState } from 'react'
import type { RemoteLoadState } from './remote-call.ts'

/** Load host data once when scope becomes ready. */
export function usePersonaRemoteLoad<T>(
  enabled: boolean,
  scopeKey: string,
  load: () => Promise<T>,
): RemoteLoadState<T> {
  const [state, setState] = useState<RemoteLoadState<T>>({ status: 'loading' })
  useEffect(() => {
    if (!enabled) {
      setState({ status: 'loading' })
      return
    }
    let cancelled = false
    setState({ status: 'loading' })
    void load().then((data) => {
      if (!cancelled) setState({ status: 'ready', data })
    }).catch(() => {
      if (!cancelled) setState({ status: 'error' })
    })
    return () => { cancelled = true }
  }, [enabled, scopeKey, load])
  return state
}
