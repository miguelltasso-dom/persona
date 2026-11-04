/**
 * Drop snapshot rows whose body is already in the cached prefix (OPT-4).
 */

import type { ContextRecord } from './types.ts'

/**
 * @param records - Candidates after subject filter.
 * @param prefix - Stable prompt prefix (system → persona → tools → required).
 * @returns Records that still add text.
 */
export function dropRecordsInPrefix(
  records: readonly ContextRecord[],
  prefix: string,
): ContextRecord[] {
  const hay = prefix.toLowerCase()
  return records.filter((record) => {
    const body = record.body.trim()
    if (body === '') return false
    return !hay.includes(body.toLowerCase())
  })
}
