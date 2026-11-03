/**
 * Launch / delivery error kinds. Transient network/provider errors retry
 * three times at 15s / 30s / 60s. Prepare failures never retry.
 */

/** Thrown when workspace prepare fails; launch records `ticket.delivery` and stops. */
export class PrepareFailed extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PrepareFailed'
  }
}

export const TRANSIENT_TRIES = 3
export const TRANSIENT_BACKOFF_MS: readonly number[] = [15_000, 30_000, 60_000]

const PASSING = new RegExp([
  'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND', 'EPIPE', 'UND_ERR',
  'socket hang up', 'fetch failed', 'network error', 'overloaded', 'rate limit',
  '\\b(?:408|429|50[0-4])\\b',
].join('|'), 'i')

/**
 * @param error - Caught failure.
 * @returns Whether the failure is a passing network/provider error.
 */
export function transient(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error)
  return PASSING.test(text)
}

/**
 * @param triesSoFar - Attempts already counted for this key (0 on first failure).
 * @returns Backoff ms for the next retry, or undefined when out of tries.
 */
export function nextTransientBackoff(triesSoFar: number): number | undefined {
  return TRANSIENT_BACKOFF_MS[triesSoFar]
}
