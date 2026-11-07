/**
 * The verdict a reviewer gives IN WORDS (EQUIPE-REAL, TEAM-6). The review tool (`verdict: approve | changes`) reaches a live CLI only
 * with the HT-0 transport; until then the reviewer's Task answers in text, and the first line is the verdict:
 *
 *   APROVADO
 *
 *   AJUSTES
 *   - o título passa de 60 caracteres
 *   - falta o preço no segundo post
 *
 * Anything else is NOT a verdict (the review step treats it as a reviewer that failed, and the work goes on unsealed: a review that
 * does not answer never holds a delivery). Pure: no clock, no store.
 */

import { readVerdict, type Verdict } from './review-step.ts'

const APPROVE = /^(?:aprovad[oa]|aprovo|aprovar|approved?)\b/iu
const CHANGES = /^(?:ajustes?|devolv\w*|precisa de ajustes?|pedi(?:r|do)? ajustes?|changes)\b/iu
const BULLET = /^\s*(?:[-*•–]|\d+[.)])\s+(.*\S)\s*$/u

/** First line without the markdown a model likes to add. */
function headOf(line: string): string {
  return line.replace(/^[\s#>*_`"“”'‘’-]+/u, '').replace(/[*_`"“”:]+\s*$/u, '').trim()
}

/**
 * @param text - What the reviewer's Task delivered.
 * @returns The verdict, or undefined when the text is not one (then the caller treats the reviewer as failed).
 */
export function verdictFromText(text: string): Verdict | undefined {
  const lines = text.split(/\r?\n/u).map(line => line.trimEnd()).filter(line => line.trim() !== '')
  const first = lines[0]
  if (first === undefined) return undefined
  const head = headOf(first)
  if (APPROVE.test(head)) return { verdict: 'approve' }
  if (!CHANGES.test(head)) return undefined
  const bullets = lines.slice(1).map(line => BULLET.exec(line)?.[1]).filter((point): point is string => point !== undefined)
  // A first line like "AJUSTES: troque X" carries the point itself.
  const inline = /^[^:]*:\s*(\S.*)$/u.exec(head)?.[1]
  const points = bullets.length > 0 ? bullets : (inline === undefined ? lines.slice(1) : [inline, ...lines.slice(1)])
  try {
    return readVerdict({ verdict: 'changes', points })
  } catch {
    return undefined
  }
}
