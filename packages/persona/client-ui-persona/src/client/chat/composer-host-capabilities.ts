import {
  avatarUploadHostReady,
  messageAttachmentsHostReady,
  type PersonaRemoteProbe,
} from './resolve-composer-host-ready.ts'

export { type PersonaRemoteProbe } from './resolve-composer-host-ready.ts'

let messageAttachmentsReady = false
let avatarUploadReady = false

/** Call once from `mount.ts` after `ctx.remote.persona` is available. */
export function installComposerHostCapabilities(remote: PersonaRemoteProbe): void {
  messageAttachmentsReady = messageAttachmentsHostReady(remote)
  avatarUploadReady = avatarUploadHostReady(remote)
}

/** Resets gates (unit tests). */
export function resetComposerHostCapabilitiesForTest(): void {
  messageAttachmentsReady = false
  avatarUploadReady = false
}

/** Anvil `attachFile` present on the Remote client. */
export function personaMessageAttachmentsHostReady(): boolean {
  return messageAttachmentsReady
}

/** Anvil `uploadPersonaAvatar` present on the Remote client. */
export function personaAvatarUploadHostReady(): boolean {
  return avatarUploadReady
}

export const PERSONA_COMPOSER_EMOJI_READY = false
export const PERSONA_COMPOSER_MENTION_READY = false

/** @deprecated Use {@link personaMessageAttachmentsHostReady}. */
export const PERSONA_MESSAGE_ATTACHMENTS_HOST_READY = false

/** @deprecated Use {@link personaAvatarUploadHostReady}. */
export const PERSONA_AVATAR_UPLOAD_HOST_READY = false
