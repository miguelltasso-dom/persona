/**
 * EQUIPE-REAL §0 (Muse): the title of a Task is short and human — never the raw request, never starting with "@nome", never cut in the
 * middle of a word (when it must be cut, it is cut at a space and ends with "…"). The Gestor's split gives each part its own short title;
 * this is the fallback for a Task made from the person's words.
 */

const LEADING_MENTIONS = /^(?:@[\p{L}\p{N}_-]+[,:;]?\s*)+/u
const LEADING_POLITE = /^(?:por favor|pf|oi|olá|ola|bom dia|boa tarde|boa noite)[,:!.]?\s*/iu
const TRAILING = /[\s,;:.!?…-]+$/u

/**
 * @param text - The words that asked for the Task (only the first line is read).
 * @param max - Longest title, in letters (default 80).
 * @returns A short title that never ends in the middle of a word; "Pedido" when there is nothing to say.
 */
export function humanTitle(text: string, max: number = 80): string {
  let line = (text.split(/\r?\n/u, 1)[0] ?? '').replace(/\s+/gu, ' ').trim()
  for (let pass = 0; pass < 3; pass += 1) line = line.replace(LEADING_MENTIONS, '').replace(LEADING_POLITE, '').trim()
  if (line === '') return 'Pedido'
  line = `${line.charAt(0).toLocaleUpperCase('pt-BR')}${line.slice(1)}`
  if (line.length <= max) return line.replace(TRAILING, '') || 'Pedido'
  const cut = line.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  // Cut at a space; only when the first word alone is longer than the limit is it cut inside it (nothing better exists).
  const head = (space > 0 ? cut.slice(0, space) : cut).replace(TRAILING, '')
  return `${head}…`
}
