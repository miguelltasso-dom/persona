/**
 * CV-5: who an `@name` in a message points at. The old rule (`body.includes('@' + name)`, first persona of the list) breaks with
 * 30–100 personas: "@Anabela" matched "Ana", and an e-mail like "x@Ana.com" matched too. Here the name must be WHOLE (no letter,
 * digit or underscore right after it), the `@` must not be glued to a word before it (so e-mails never count), a longer name wins
 * at the same spot ("@Ana Paula" is Ana Paula, not Ana), case does not matter, and every persona named is returned once, in the
 * order the text names them (the first is the one that takes a work request; all of them answer a conversation).
 */

/** Anything with a display name. */
export interface Mentionable {
  readonly name: string
}

const WORD = /[\p{L}\p{N}_]/u

function isWord(char: string | undefined): boolean {
  return char !== undefined && char !== '' && WORD.test(char)
}

/** The code point that ends right before `index` (handles surrogate pairs). */
function before(text: string, index: number): string | undefined {
  if (index <= 0) return undefined
  const low = text.charCodeAt(index - 1)
  if (low >= 0xdc00 && low <= 0xdfff && index >= 2) return text.slice(index - 2, index)
  return text.slice(index - 1, index)
}

/** The code point that starts at `index`. */
function after(text: string, index: number): string | undefined {
  if (index >= text.length) return undefined
  const point = text.codePointAt(index)
  return point === undefined ? undefined : String.fromCodePoint(point)
}

/**
 * Personas named in the message by an `@name`.
 * @param personas - Candidates (any order).
 * @param body - The message text.
 * @returns Each named persona once, in the order they appear in the text.
 */
export function mentionsOf<T extends Mentionable>(personas: readonly T[], body: string): T[] {
  const named = personas
    .filter(persona => persona.name.trim() !== '')
    .map(persona => ({ persona, key: persona.name.toLocaleLowerCase('pt-BR') }))
    .sort((a, b) => b.key.length - a.key.length)
  const found: T[] = []
  let at = body.indexOf('@')
  while (at !== -1) {
    const prev = before(body, at)
    if (!isWord(prev) && prev !== '@') {
      const hit = named.find((item) => {
        const end = at + 1 + item.persona.name.length
        return body.slice(at + 1, end).toLocaleLowerCase('pt-BR') === item.key && !isWord(after(body, end))
      })
      if (hit !== undefined) {
        if (!found.includes(hit.persona)) found.push(hit.persona)
        at = body.indexOf('@', at + 1 + hit.persona.name.length)
        continue
      }
    }
    at = body.indexOf('@', at + 1)
  }
  return found
}

/**
 * The persona a message is addressed to first.
 * @param personas - Candidates.
 * @param body - The message text.
 */
export function firstMention<T extends Mentionable>(personas: readonly T[], body: string): T | undefined {
  return mentionsOf(personas, body)[0]
}
