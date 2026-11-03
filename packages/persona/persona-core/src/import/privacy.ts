/**
 * Refuse cookies, tokens, and secret-looking values. Classify remaining rows.
 */

const SECRET = /(cookie|authorization|api[-_]?key|secret|token|passwd|password|bearer\s+[a-z0-9._\-]+)/i

/**
 * @param body - Candidate text.
 */
export function looksLikeSecret(body: string): boolean {
  return SECRET.test(body)
}

/**
 * Drop secret-looking rows from a preview.
 * @param preview - Adapter output.
 */
export function refuseSecrets<T extends { accepted: { body: string; externalId: string }[]; rejected: { externalId: string; reason: string }[] }>(
  preview: T,
): T {
  const accepted = []
  const rejected = preview.rejected.slice()
  for (const row of preview.accepted) {
    if (looksLikeSecret(row.body)) rejected.push({ externalId: row.externalId, reason: 'SECRET' })
    else accepted.push(row)
  }
  return { ...preview, accepted, rejected }
}
