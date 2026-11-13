/**
 * D-116 (Bolt): the seam between the handoff protocol and the host's `PersonaHomeBook` (Flint). The protocol asks four things of a home book (resolve, close, open, set); the book answers in its own words (a persona
 * with no doc lives HERE at epoch 0; `set` takes the clock as an ISO string and throws `HomeError`). This adapter turns one into the other and nothing more — in particular the book's refusals become the protocol's
 * stable codes: a higher epoch already seen is `stale-epoch`, and the placement rule of D-117 (a team persona never lives on a personal PC) is `placement-refused`.
 */

import { HomeError, type PersonaHomeBook } from '../persona-home.ts'
import { HandoffError, type HomePort } from './handoff.ts'

/**
 * @param book - The host's home book.
 * @param now - The host's clock (ms).
 * @returns The home port the handoff protocol uses.
 */
export function homePortOf(book: Pick<PersonaHomeBook, 'resolve' | 'close' | 'open' | 'set'>, now: () => number): HomePort {
  return {
    resolve(personaId) {
      const home = book.resolve(personaId)
      return { computerId: home.computerId, epoch: home.epoch, state: home.state, ...(home.movingTo === undefined ? {} : { movingTo: home.movingTo }) }
    },
    close(personaId, why, movingTo) {
      book.close(personaId, why, movingTo)
    },
    open(personaId) {
      book.open(personaId)
    },
    set(personaId, home) {
      try {
        book.set(personaId, home, new Date(now()).toISOString())
      } catch (error) {
        if (error instanceof HomeError && error.code === 'stale-epoch') throw new HandoffError('stale-epoch')
        if (error instanceof HomeError && error.code === 'placement-refused') throw new HandoffError('placement-refused')
        throw error
      }
    },
  }
}
