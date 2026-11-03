/**
 * E7: a task runs on the persona's machine. Friendship never moves execution.
 */

export class WrongMachineError extends Error {
  readonly code = 'WRONG_MACHINE'

  /**
   * @param personaHomeId - Host id the persona is bound to.
   * @param thisHostId - Host that tried to start the turn.
   */
  constructor(readonly personaHomeId: string, readonly thisHostId: string) {
    super(`persona lives on ${personaHomeId}; this host is ${thisHostId}`)
    this.name = 'WrongMachineError'
  }
}

/**
 * Refuse a turn that belongs to another desktop.
 * @param personaHomeId - Bound machine (empty = this host).
 * @param thisHostId - Current desktop id.
 */
export function assertLocalPersonaMachine(personaHomeId: string, thisHostId: string): void {
  if (personaHomeId === '' || personaHomeId === thisHostId) return
  throw new WrongMachineError(personaHomeId, thisHostId)
}

/**
 * @param personaHomeId - Bound machine.
 * @param thisHostId - Current desktop id.
 * @returns true when this host may execute the persona.
 */
export function isLocalPersonaMachine(personaHomeId: string, thisHostId: string): boolean {
  return personaHomeId === '' || personaHomeId === thisHostId
}
