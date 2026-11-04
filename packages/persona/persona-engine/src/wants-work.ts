/**
 * Whether a #geral / DM line should become a Ticket (not a talk reply).
 * Agência dogfood 0 execs: "Monte a equipe…" missed the old host regex.
 */

const WORK = new RegExp(
  [
    'preciso',
    'implement',
    'cri[ae]',
    'fa[cç]a',
    'adicion',
    'consert',
    'corrig',
    'atualiz',
    'escrev',
    'readme',
    'deploy',
    'faz(er)?\\b',
    'tarefa',
    'ticket',
    'aprov',
    'mont[aeo]',
    'organiz',
    'resum[aei]',
    'proponh',
    'propor\\b',
    'entreg[aeu]',
    'planej',
    'public[ae]',
    'contrat[ae]',
    'aloqu',
    'desenh[ae]',
  ].join('|'),
  'iu',
)

const GREETING = /^(oi|ol[aá]|e a[ií]|fala|hey|obrigad[oa]|valeu|beleza|ok|blz|👍|🙏)\b/iu

/**
 * @param text - Human message body.
 * @returns True when Coordination must accept a Ticket (executor / motor).
 */
export function wantsWork(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed === '') return false
  return WORK.test(trimmed)
}

/** Ledger / triage: why ingest stayed on talk. */
export type WorkSkipReason = 'empty' | 'courtesy' | 'not-work'

/**
 * @param text - Human message body.
 * @returns Skip tag when {@link wantsWork} is false.
 */
export function workSkipReason(text: string): WorkSkipReason | undefined {
  const trimmed = text.trim()
  if (trimmed === '') return 'empty'
  if (GREETING.test(trimmed) && !WORK.test(trimmed)) return 'courtesy'
  if (!WORK.test(trimmed)) return 'not-work'
  return undefined
}
