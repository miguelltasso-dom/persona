/**
 * Account labels (W2-7): the name a person gives a seat ("Pessoal", "Trabalho").
 * Pure rules shared by the add and rename dialogs. The host derives the account id from the label
 * (lower case, spaces to dashes), so two labels that normalize the same would collide: treat them as duplicates.
 */

export const ACCOUNT_LABEL_MAX = 24

const SUGGESTIONS: readonly string[] = ['Pessoal', 'Trabalho', 'Equipe', 'Reserva']

export type AccountLabelCheck =
  | { readonly ok: true; readonly label: string }
  | { readonly ok: false; readonly reason: 'empty' | 'tooLong' | 'duplicate' }

/** Same normalization the host uses to build the account id. */
export function normalizeAccountLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/gu, '-')
}

/**
 * Validate a label against the other labels of the same provider.
 * @param input - What the person typed.
 * @param taken - Labels already used by this provider.
 * @param current - The label being renamed (allowed to stay the same).
 */
export function checkAccountLabel(input: string, taken: readonly string[], current?: string): AccountLabelCheck {
  const label = input.trim().replace(/\s+/gu, ' ')
  if (label.length === 0) return { ok: false, reason: 'empty' }
  if (label.length > ACCOUNT_LABEL_MAX) return { ok: false, reason: 'tooLong' }
  const key = normalizeAccountLabel(label)
  const own = current === undefined ? undefined : normalizeAccountLabel(current)
  if (taken.some(row => normalizeAccountLabel(row) === key && normalizeAccountLabel(row) !== own)) {
    return { ok: false, reason: 'duplicate' }
  }
  return { ok: true, label }
}

/** Up to three names not used yet, in a friendly order. */
export function suggestAccountLabels(taken: readonly string[]): readonly string[] {
  const used = new Set(taken.map(normalizeAccountLabel))
  return SUGGESTIONS.filter(label => !used.has(normalizeAccountLabel(label))).slice(0, 3)
}
