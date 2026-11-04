/** Detect attachment/upload RPC on the live persona Remote (Anvil). */

export type PersonaRemoteProbe = {
  attachFile?: unknown
  uploadPersonaAvatar?: unknown
}

/**
 * @param remote - `ctx.remote.persona` at mount.
 */
export function messageAttachmentsHostReady(remote: PersonaRemoteProbe): boolean {
  return typeof remote.attachFile === 'function'
}

/** @param remote - `ctx.remote.persona` at mount. */
export function avatarUploadHostReady(remote: PersonaRemoteProbe): boolean {
  return typeof remote.uploadPersonaAvatar === 'function'
}
