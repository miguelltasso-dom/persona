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
export type { SealContext } from './signature-web.ts'
export type { SyncClientOptions } from './client.ts'
