import type { ContextErrorCode } from './types.ts'

/** Integration failure with a stable machine code; message equals `code`. */
export class ContextError extends Error {
  /**
   * @param code - Stable machine code from the integration contract.
   */
  constructor(readonly code: ContextErrorCode) {
    super(code)
    this.name = 'ContextError'
  }
}
