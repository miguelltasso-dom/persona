/**
 * Optional workspace-key cipher. The host holds the key; the edge never opens it.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import type { PayloadCipher, SealedPayload } from '@deepseek-ai/dsh-persona-core'

/**
 * AES-256-GCM sealed with a workspace secret. `ciphertext` is
 * `base64(iv || tag || body)`.
 */
export class WorkspaceCipher implements PayloadCipher {
  readonly key: Buffer
  readonly keyId: string

  /**
   * @param secret - Workspace secret (passphrase or raw key material).
   * @param keyId - Key id members already share.
   */
  constructor(secret: string, keyId: string) {
    this.key = createHash('sha256').update(secret).digest()
    this.keyId = keyId
  }

  /**
   * @param plaintext - Event body.
   * @param workspaceKeyId - Key id known only to workspace members.
   */
  seal(plaintext: string, workspaceKeyId: string): SealedPayload {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.key, iv)
    const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return {
      alg: 'workspace',
      workspaceKeyId,
      ciphertext: Buffer.concat([iv, tag, body]).toString('base64'),
    }
  }

  /**
   * @param sealed - Ciphertext from {@link seal}.
   * @param workspaceKeyId - Same key id.
   */
  open(sealed: SealedPayload, workspaceKeyId: string): string {
    if (workspaceKeyId !== sealed.workspaceKeyId) throw new Error('WORKSPACE_KEY')
    const raw = Buffer.from(sealed.ciphertext, 'base64')
    const iv = raw.subarray(0, 12)
    const tag = raw.subarray(12, 28)
    const body = raw.subarray(28)
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8')
  }
}
