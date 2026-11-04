/** Helpers for persona RemoteResult calls in the UI. */

import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'

export type RemoteLoadState<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly data: T }

export async function unwrapRemote<T>(result: RemoteResult<T>): Promise<T> {
  if (result.ok) return result.value
  const error = result.error
  const code = error !== undefined && typeof error.code === 'string' ? error.code : 'unknown'
  const message = error !== undefined && typeof error.message === 'string' && error.message.length > 0
    ? error.message
    : code
  throw new Error(message)
}
