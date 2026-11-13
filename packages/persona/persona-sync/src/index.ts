/** Persona sync client: shared streams only, optional workspace cipher, offline resume. */

export { PACKAGE_SYNC } from './identity.ts'
export { WorkspaceCipher } from './cipher.ts'
export { HttpTransport, MemoryTransport, SyncTransportError } from './transport.ts'
export type { PushResult, SyncTransport } from './transport.ts'
export { SyncClient, isLocalOnlyStream } from './client.ts'
export {
  KeyError, MemoryIdentityStore, agree, agreementPrivateKey, agreementPublicKey, fingerprint, generateAgreementPair, generateIdentity, loadOrCreateIdentity,
  publicIdentity, signBytes, signingPrivateKey, signingPublicKey, verifyBytes,
} from './keys.ts'
export type { Identity, IdentityStore, PublicIdentity } from './keys.ts'
export { ChannelCryptoError, ChannelKeyring, newChannelKey, openChannel, sealChannel, unwrapChannelKey, wrapChannelKey } from './channel-crypto.ts'
export type { ChannelCryptoCode, KeyWrap, OpenInput, SealInput, WrapContext } from './channel-crypto.ts'
export { base64UrlOfBytes, bytesOfBase64, bytesOfBase64Url, sealHeader, signedBytesOf, verifySealedSignature } from './signature-web.ts'
export { MemoryReplayStore, REQUEST_SKEW_MS, canonicalRequest, parsePersonaSig, sha256Hex, verifyRequest } from './request-auth.ts'
export type { PersonaSig, ReplayStore, RequestAuthFailure, RequestAuthResult } from './request-auth.ts'
export { createRequestSigner, signRequest } from './request-sign.ts'
export type { RequestSigner } from './request-sign.ts'
export type { SealContext } from './signature-web.ts'
export type { SyncClientOptions } from './client.ts'
export { INVITE_HOST, INVITE_LINK_MAX, INVITE_SCHEME, inviteLinkOf, parseInviteLink } from './invite-link.ts'
export type { InviteLink } from './invite-link.ts'
export { canonicalJson, checkSheet, sheetDigest, signSheet } from './persona-sheet.ts'
export type { SheetFields, SheetVerdict, SignedSheet } from './persona-sheet.ts'
export {
  BUNDLE_MAX_BYTES, BUNDLE_MAX_FILE_TEXT, BUNDLE_MAX_ITEMS, BUNDLE_MAX_SKILLS, BUNDLE_MAX_SKILL_FILES, BUNDLE_MAX_TEXT, BUNDLE_SCHEMA, BUNDLE_TTL_MS, BundleError, bundleDigest, cleanBundle, newBundleId,
  openPersonaBundle, sealPersonaBundle,
} from './sealed-bundle.ts'
export type {
  BundleHeader, BundleMemoryItem, BundleRefusal, BundleRule, BundleSkill, BundleSkillFile, OpenBundleInput, PersonaBundle, SealBundleInput, SealedBundle,
} from './sealed-bundle.ts'
