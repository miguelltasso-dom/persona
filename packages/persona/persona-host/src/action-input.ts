/**
 * HT-9 (D-084), the seam between the gate and the card. The permission gate (persona-runners) hands the host a FLAT preview of the arguments it
 * stopped: a list becomes `to[0]`, `to[1]`, a nested field becomes `message.body`. The card of an external action (`external-actions.ts`) reads
 * the fields by their top-level names and expects a list as a list ("a prévia é a coisa real": who gets it, what is deleted). Handing it the flat
 * preview as it comes loses exactly that: a delete would not list its files and a send would not show its second recipient.
 *
 * This puts the lists back together and lets the card find a field that the connector nested. Pure; it only reads what the gate already bounded and
 * masked, so it cannot add a secret or a field the gate did not show. It changes the PREVIEW only: the approval is for the hash of the real
 * arguments, never for this view.
 */

const LIST_ITEM = /^([^.[\]]+)\[(\d+)\]$/u

/**
 * @param fields - The gate's flat preview (`PermissionRequest.requestedInput`).
 * @returns The same information with top-level lists restored and, for a nested field, its leaf name offered when no field already has it.
 */
export function unflattenPreview(fields: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const lists = new Map<string, Array<[number, unknown]>>()
  for (const [key, value] of Object.entries(fields)) {
    const item = LIST_ITEM.exec(key)
    if (item?.[1] !== undefined && item[2] !== undefined) {
      const rows = lists.get(item[1]) ?? []
      rows.push([Number(item[2]), value])
      lists.set(item[1], rows)
      continue
    }
    out[key] = value
  }
  for (const [name, rows] of lists) {
    if (name in out) continue // a scalar field of the same name wins; the list stays as its flat keys below
    out[name] = rows.sort((a, b) => a[0] - b[0]).map(row => row[1])
  }
  // A field the connector nested (`message.to`): offer its leaf (`to`) when nothing at the top level has that name.
  for (const [key, value] of Object.entries(fields)) {
    if (!key.includes('.') || key.includes('[')) continue
    const leaf = key.slice(key.lastIndexOf('.') + 1)
    if (leaf !== '' && !(leaf in out)) out[leaf] = value
  }
  // The flat keys of a list that lost to a scalar of the same name stay visible as they were.
  for (const [name, rows] of lists) {
    if (!(name in out) || Array.isArray(out[name])) continue
    for (const [index, value] of rows) out[`${name}[${String(index)}]`] = value
  }
  return out
}
