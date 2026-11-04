/** Persona sync client: shared streams only, optional workspace cipher, offline resume. */

export { PACKAGE_SYNC } from './identity.ts'
export { WorkspaceCipher } from './cipher.ts'
export { HttpTransport, MemoryTransport, SyncTransportError } from './transport.ts'
export type { PushResult, SyncTransport } from './transport.ts'
export { SyncClient, isLocalOnlyStream } from './client.ts'
export type { SyncClientOptions } from './client.ts'
