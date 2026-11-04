/**
 * Incremental subject fold (TOKEN-OPTIMIZATION §2). No LLM — lote extractive.
 * Mandatory lines (sempre/nunca/regra/decisão) stay when the text is capped.
 */

export const SUBJECT_SUMMARY_EVERY = 6
export const SUBJECT_RECENT = 4
export const SUMMARY_MAX_CHARS = 800

const KEEP = /\b(sempre|nunca|obrigat|regra|decis[aã]o|constraint|n[aã]o pode)\b/i

/**
 * @param line - One message body.
 */
function foldLine(line: string): string {
  const text = line.replace(/\s+/g, ' ').trim()
  if (text === '') return ''
  return text.length > 160 ? `${text.slice(0, 157)}…` : text
}

/**
 * Merge previous summary with new message bodies. Dedupe; keep mandatory lines.
 * @param previous - Last stored fold.
 * @param added - Bodies since last_seq.
 */
export function foldSubjectSummary(previous: string, added: readonly string[]): string {
  const lines = [
    ...previous.split('\n').map(row => row.trim()).filter(row => row !== ''),
    ...added.map(foldLine).filter(row => row !== ''),
  ]
  const seen = new Set<string>()
  const unique: string[] = []
  for (const line of lines) {
    const key = line.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(line)
  }
  unique.sort((left, right) => Number(KEEP.test(right)) - Number(KEEP.test(left)))
  const must = unique.filter(line => KEEP.test(line))
  const rest = unique.filter(line => !KEEP.test(line))
  let text = [...must, ...rest].join('\n')
  if (text.length > SUMMARY_MAX_CHARS) {
    text = [...must, ...rest].join('\n').slice(0, SUMMARY_MAX_CHARS)
  }
  return text
}

/**
 * Whether the lote should persist a new fold.
 * @param newCount - Messages after last_seq.
 */
export function shouldFoldSubject(newCount: number): boolean {
  return newCount >= SUBJECT_SUMMARY_EVERY
}
