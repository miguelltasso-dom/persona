/**
 * GitHub webhook HMAC-SHA256 (`X-Hub-Signature-256`). Web Crypto only.
 */

/**
 * @param secret - Shared webhook secret.
 * @param body - Raw request body.
 * @returns `sha256=` + hex digest.
 */
export async function githubSignature(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  const hex = [...new Uint8Array(sig)].map(byte => byte.toString(16).padStart(2, '0')).join('')
  return `sha256=${hex}`
}

/**
 * Constant-time compare of the header against {@link githubSignature}.
 * @param secret - Shared webhook secret.
 * @param body - Raw request body.
 * @param header - `X-Hub-Signature-256` or null.
 */
export async function verifyGitHubSignature(
  secret: string,
  body: string,
  header: string | null,
): Promise<boolean> {
  if (header === null || header.length === 0) return false
  const expected = await githubSignature(secret, body)
  if (expected.length !== header.length) return false
  let mismatch = 0
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= expected.charCodeAt(i) ^ header.charCodeAt(i)
  }
  return mismatch === 0
}
