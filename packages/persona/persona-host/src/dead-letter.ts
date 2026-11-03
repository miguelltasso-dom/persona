/**
 * Failed outbox/effect rows after N attempts become a visible "Precisa de você"
 * card. Never drop silently.
 */

import type { ScreenRepos } from '@deepseek-ai/dsh-persona-store'

const KIND = 'dead_letter'
const MAX_ATTEMPTS = 3

/** One failed effect the person can retry or discard. */
export interface DeadLetterView {
  readonly id: string
  readonly projectId: string
  readonly cause: string
  readonly actionRetry: string
  readonly actionDiscard: string
  readonly attempts: number
  readonly at: string
}

/**
 * Persist dead letters on `screen_doc`.
 */
export class DeadLetterBook {
  /**
   * @param screens - Project-scoped docs.
   * @param now - Instant factory.
   */
  constructor(
    readonly screens: ScreenRepos,
    readonly now: () => string = () => new Date().toISOString(),
  ) {}

  /**
   * Record a failure. Same id replaces the row (attempt count grows).
   * @param projectId - Tenant.
   * @param id - Stable effect/outbox id.
   * @param cause - pt-BR, no secrets.
   */
  record(projectId: string, id: string, cause: string): DeadLetterView {
    const existing = this.screens.get<DeadLetterView>(projectId, KIND, id)
    const attempts = (existing?.attempts ?? 0) + 1
    const row: DeadLetterView = {
      id,
      projectId,
      cause,
      actionRetry: 'Tentar de novo',
      actionDiscard: 'Descartar',
      attempts,
      at: this.now(),
    }
    this.screens.put(projectId, KIND, id, row)
    return row
  }

  /**
   * @param projectId - Tenant.
   */
  list(projectId: string): DeadLetterView[] {
    return this.screens.list<DeadLetterView>(projectId, KIND).filter(row => this.exhausted(row.attempts))
  }

  /**
   * Run one effect. Success clears the letter. Failure increments; only
   * exhausted rows surface in {@link list}.
   * @param projectId - Tenant.
   * @param id - Stable effect/outbox id.
   * @param cause - pt-BR, no secrets.
   * @param fn - Side effect that may throw.
   */
  attempt(projectId: string, id: string, cause: string, fn: () => void): 'ok' | 'retrying' | 'dead' {
    try {
      fn()
      this.discard(projectId, id)
      return 'ok'
    } catch (error) {
      const named = error instanceof Error ? error.message : 'falha'
      const safe = /stack|token|sk-|ghp_|Bearer/iu.test(named) ? cause : (named === '' ? cause : named)
      const row = this.record(projectId, id, /[A-Za-zÀ-ú]/.test(safe) ? safe : cause)
      return this.exhausted(row.attempts) ? 'dead' : 'retrying'
    }
  }

  /**
   * @param projectId - Tenant.
   * @param id - Letter.
   */
  discard(projectId: string, id: string): boolean {
    const existing = this.screens.get<DeadLetterView>(projectId, KIND, id)
    if (existing === undefined) return false
    this.screens.delete(projectId, KIND, id)
    return true
  }

  /**
   * True when this failure should surface (exhausted retries).
   * @param attempts - Count already recorded on the effect.
   */
  exhausted(attempts: number): boolean {
    return attempts >= MAX_ATTEMPTS
  }
}

export { MAX_ATTEMPTS as DEAD_LETTER_ATTEMPTS }
