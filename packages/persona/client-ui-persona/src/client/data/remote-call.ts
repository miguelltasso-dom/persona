/** Helpers for persona RemoteResult calls in the UI. */

import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'

export type RemoteLoadState<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly data: T }

export async function unwrapRemote<T>(result: RemoteResult<T>): Promise<T> {
  if (!result.ok) throw new Error(result.error.code)
  return result.value
}
