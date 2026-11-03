/** Binds a HostObservable like production InjectFace hooks (for vitest). */
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-ui-renderer/src/client/bind.ts'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'

export function bindObservableForTest<T>(source: HostObservable<T>) {
  return bindSnapshotSelector(source)
}
