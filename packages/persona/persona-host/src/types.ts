/** JSON-safe inputs and results of the Persona Remote namespace. */
import type {} from '@deepseek-ai/dsh-typert-protocol'

/** Result of the liveness probe. */
export interface PingResult {
  readonly ok: true
  readonly product: 'persona'
  readonly protocol: number
}
