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

/** Lower case and no accent (`João` → `joao`): the way a name is compared, whatever was typed. */
function fold(value: string): string {
  return value.normalize('NFD').replace(/\p{M}+/gu, '').toLocaleLowerCase('pt-BR')
}

/**
 * Where the folded `key` matches the text from `from`: the index right after it (any accent marks that follow are part of it), or -1. Accents and case do not count, and the text is compared character by character
 * so the index is a real position of the ORIGINAL text (a folded name may be shorter than what was typed).
 */
function matchAt(body: string, from: number, key: string): number {
  let index = from
  let matched = 0
  while (matched < key.length) {
    const char = after(body, index)
    if (char === undefined) return -1
    const folded = fold(char)
    if (folded !== '' && key.slice(matched, matched + folded.length) !== folded) return -1
    matched += folded.length
    index += char.length
  }
  for (let next = after(body, index); next !== undefined && fold(next) === ''; next = after(body, index)) index += next.length // a decomposed accent right after the name
  return index
}

/**
 * Personas named in the message by an `@name`.
 * @param personas - Candidates (any order).
 * @param body - The message text.
 * @returns Each named persona once, in the order they appear in the text.
 */
export function mentionsOf<T extends Mentionable>(personas: readonly T[], body: string): T[] {
  // Each persona is looked for in up to two forms: as typed with its spaces ("@Ana Paula") and COMPACT ("@AnaPaula": what the composer's menu writes). Accents and case never count.
  const named = personas
    .filter(persona => persona.name.trim() !== '')
    .flatMap((persona) => {
      const spaced = fold(persona.name).trim().replace(/\s+/gu, ' ')
      const compact = spaced.replace(/ /gu, '')
      return compact === spaced ? [{ persona, key: spaced }] : [{ persona, key: spaced }, { persona, key: compact }]
    })
    .sort((a, b) => b.key.length - a.key.length)
  const found: T[] = []
  let at = body.indexOf('@')
  while (at !== -1) {
    const prev = before(body, at)
    if (!isWord(prev) && prev !== '@') {
      let hit: { readonly persona: T; readonly end: number } | undefined
      for (const item of named) {
        const end = matchAt(body, at + 1, item.key)
        if (end !== -1 && !isWord(after(body, end))) { hit = { persona: item.persona, end }; break }
      }
      if (hit !== undefined) {
        if (!found.includes(hit.persona)) found.push(hit.persona)
        at = body.indexOf('@', hit.end)
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
