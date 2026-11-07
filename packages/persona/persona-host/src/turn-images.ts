/**
 * TEAM-5 (D-090 #4): the personas SEE the image. An image attached to a message of the channel travels to the runner as a native image
 * block of the turn (the runner reads the file at delivery; `StartTurnInput.images`, contract of the runner owner): the host picks the
 * images of the messages a turn is about, validates them the same way the runner will (4 types, ≤ 4 per turn, ≤ 5 MB each), puts them
 * where the runner can read them (an absolute path) and says honestly what it did NOT send. Nothing is ignored in silence.
 */

/** The image types the runner accepts (the Claude API's four). */
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const
export type TurnImageType = typeof IMAGE_TYPES[number]

/** Most images one turn carries. */
export const MAX_TURN_IMAGES = 4
/** Largest image the API takes (5 MB). */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

/** An image ready for the runner. */
export interface TurnImage {
  /** Absolute path of a readable local file (never bytes in the request). */
  readonly path: string
  readonly mediaType: TurnImageType
  /** Display name (for the person's line; the model never needs it). */
  readonly name: string
}

/** Why an image was not sent: more than the turn takes, too big, or not one of the four types. */
export type SkippedReason = 'too_many' | 'too_big' | 'type'

export interface SkippedImage {
  readonly name: string
  readonly reason: SkippedReason
}

/** What the media store knows about one attachment. */
export interface AttachmentFacts {
  readonly id: string
  readonly name: string
  readonly mime: string
  readonly bytes: number
}

/**
 * @param mime - The attachment's MIME type.
 * @returns The runner's media type, or undefined when it is not one of the four.
 */
export function imageTypeOf(mime: string): TurnImageType | undefined {
  const lower = mime.toLowerCase()
  return (IMAGE_TYPES as readonly string[]).includes(lower) ? lower as TurnImageType : undefined
}

/**
 * Which attachments go to the turn and which are left out, and why. Non-images are not "skipped": they follow the file route
 * (`inputs/`), not this one. The first images win; a persona's own order is the thread's order.
 * @param attachments - Attachments of the messages the turn is about, in thread order.
 */
export function pickTurnImages(attachments: readonly AttachmentFacts[]): { chosen: AttachmentFacts[]; skipped: SkippedImage[] } {
  const chosen: AttachmentFacts[] = []
  const skipped: SkippedImage[] = []
  for (const item of attachments) {
    if (!item.mime.toLowerCase().startsWith('image/')) continue
    if (imageTypeOf(item.mime) === undefined) { skipped.push({ name: item.name, reason: 'type' }); continue }
    if (item.bytes > MAX_IMAGE_BYTES) { skipped.push({ name: item.name, reason: 'too_big' }); continue }
    if (chosen.length >= MAX_TURN_IMAGES) { skipped.push({ name: item.name, reason: 'too_many' }); continue }
    chosen.push(item)
  }
  return { chosen, skipped }
}

/**
 * Whether the persona's engine can read an image, BEFORE a runner exists (to choose who joins an opinion round, `blindPersonaIds`).
 * `runner.capabilities().images === 'available'` is the truth for a resolved runner; this static answer follows it: only the Claude CLI
 * is proven to read images (Codex, OpenCode, Cursor and DSH are not, until their own proof).
 * @param runner - The persona's runner spec (`persona.runner`).
 */
export function engineSeesImages(runner: { readonly kind: string; readonly cli?: string }): boolean {
  return runner.kind === 'cli' && runner.cli === 'claude'
}
