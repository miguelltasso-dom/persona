/**
 * D-121 (Keel 12/11): "Levar" writes the creator's concession "she may run on THAT computer" BEFORE the home changes (the destination's rule, and the owner PC's check at every turn start, read it) and takes it back when the
 * move is refused. Only the creator can concede: the owner of this PC moves HER OWN personas; a persona of another member does not go to somebody else's computer on the owner's word (`host-not-allowed`). Pure, so the
 * host's `movePersona` only hands it its stores.
 */

/** What {@link moveWithGrant} needs. */
export interface MoveWithGrantInput<R extends { readonly ok: boolean }> {
  readonly confirm: boolean
  /** The member at the keyboard of this PC (the owner). */
  readonly ownerId: string | undefined
  /** Who created the persona. */
  readonly creatorId: string | undefined
  /** Whether the concession for that computer already stands. */
  readonly granted: boolean
  readonly grant: () => void
  readonly revoke: () => void
  readonly move: () => R
}

/**
 * @param input - See {@link MoveWithGrantInput}.
 * @returns What `move` answered, or `host-not-allowed` (nothing written, nothing moved) when the one who confirms is not the creator.
 */
export function moveWithGrant<R extends { readonly ok: boolean }>(input: MoveWithGrantInput<R>): R | { readonly ok: false; readonly reason: 'host-not-allowed' } {
  if (!input.confirm) return input.move() // a preview or "confirm-required" changes nothing
  if (input.ownerId === undefined || input.creatorId === undefined || input.creatorId !== input.ownerId) return { ok: false, reason: 'host-not-allowed' }
  const wrote = !input.granted
  if (wrote) input.grant()
  const answer = input.move()
  if (wrote && !answer.ok) input.revoke()
  return answer
}
