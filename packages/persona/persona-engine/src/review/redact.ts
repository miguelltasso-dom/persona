/**
 * Keep credential-shaped values out of the review patch the person sees.
 */

const CREDENTIAL = /(?:sk-[A-Za-z0-9_\-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|Bearer\s+[A-Za-z0-9._\-]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|xai-[A-Za-z0-9]{20,})/

/**
 * @param body - Patch or file text.
 */
export function looksLikeCredential(body: string): boolean {
  return CREDENTIAL.test(body)
}

/**
 * Replace credential-shaped values. Returns whether anything was redacted.
 * @param patch - Diff text.
 */
export function redactSecrets(patch: string): { text: string; redacted: boolean } {
  const text = patch.replace(CREDENTIAL, '[redacted]')
  return { text, redacted: text !== patch }
}

/**
 * Tests the worker claimed to have run, from its report summary.
 * @param summary - Assignment report summary.
 */
export function testsClaimedOf(summary: string | undefined): string[] {
  if (summary === undefined) return []
  const match = /testes?:\s*(.+)$/im.exec(summary)
  if (match === null) return []
  return (match[1] ?? '').split(/[,;]/).map(item => item.trim()).filter(item => item.length > 0)
}
