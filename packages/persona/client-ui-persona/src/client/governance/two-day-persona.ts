/**
 * Which persona a row of the "Teste dos 2 dias" belongs to. The host names a persona's routine `initiative:<personaId>`; the rows the client
 * derives from the live team are `live-now-<id>` and `live-persona-<id>`. Anything else (approvals, a board card, a routine nobody owns by
 * persona) has no persona, and the row draws the team icon instead of a face.
 *
 * @param rowId The row id (host routine id or a derived `live-…` id).
 * @returns The persona id, or undefined when the row is not a persona's.
 */
export function twoDayRowPersonaId(rowId: string): string | undefined {
  for (const prefix of ['initiative:', 'live-now-', 'live-persona-']) {
    if (rowId.startsWith(prefix)) {
      const id = rowId.slice(prefix.length)
      return id === '' ? undefined : id
    }
  }
  return undefined
}

/**
 * Splits the derived row label "Vigia (Luna)" into the name and the role, so the screen reads the name first ("Luna · Vigia").
 * The data keeps the old shape because the dedupe reads it; only the display is rearranged.
 *
 * @param label The row label.
 * @returns `{ name, role }` for a "cargo (nome)" label, otherwise `{ text }` unchanged.
 */
export function splitTwoDayLabel(label: string): { readonly name: string; readonly role: string } | { readonly text: string } {
  const match = /^(.+?)\s+\(([^)]+)\)\s*$/u.exec(label.trim())
  return match === null ? { text: label } : { name: match[2]!.trim(), role: match[1]!.trim() }
}
