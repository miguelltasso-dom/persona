/**
 * Credential-shaped values must not enter proposals, manifests, or exports.
 */

const CREDENTIAL = /(?:sk-[A-Za-z0-9_\-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|Bearer\s+[A-Za-z0-9._\-]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|xai-[A-Za-z0-9]{20,})/

/**
 * Whether the text contains a value that looks like a live key or token.
 * @param body - Candidate text.
 */
export function looksLikeCredential(body: string): boolean {
  return CREDENTIAL.test(body)
}
