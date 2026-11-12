/**
 * Item 20 (Keel, 23:08): the renderer never downloads the voice model. The Host installs the pinned official zip (sha256 checked) and
 * returns the `model.tar.gz`; this asks the Host for the bytes and caches them per model version. A failure leaves the audio without a
 * transcript and never blocks anything.
 */

import type { PersonaRemoteClient } from '../data/lumen-inject.ts'
import { unwrapRemote } from '../data/remote-call.ts'

/** Why the model is not available; the bubble renders one sentence per reason. */
export type VoiceModelFailure = 'offline' | 'checksum' | 'disk' | 'http' | 'cancelled' | 'unavailable'

/** Host answer to `voiceModelState`: what is installed, without touching the network. */
export type VoiceModelHostState =
  | { readonly state: 'installed'; readonly version: string }
  | { readonly state: 'absent' }
  | { readonly state: 'unavailable' }
  | { readonly state: 'failed'; readonly reason: VoiceModelFailure }

/** Host answer to `ensureVoiceModel`: the archive or why it is not available. */
export type VoiceModelHostReply =
  | { readonly state: 'ready'; readonly version: string; readonly base64: string; readonly bytes: number }
  | { readonly state: 'unavailable' }
  | { readonly state: 'failed'; readonly reason: VoiceModelFailure }

export type VoiceModelState =
  | { readonly state: 'absent' }
  | { readonly state: 'downloading' }
  | { readonly state: 'ready'; readonly bytes: ArrayBuffer; readonly version: string }
  | { readonly state: 'failed'; readonly reason: VoiceModelFailure }

export interface VoiceModelCache {
  read(key: string): Promise<ArrayBuffer | undefined>
  write(key: string, bytes: ArrayBuffer): Promise<void>
}

/** The Host methods this module needs: the panel passes the persona Remote, tests pass a double. */
export interface VoiceModelHost {
  voiceModelState(): Promise<VoiceModelHostState>
  ensureVoiceModel(): Promise<VoiceModelHostReply>
}

export interface VoiceModelOptions {
  /** Host bridge; absent = no Host (gallery, tests) and the audio stays without a transcript. */
  readonly host?: VoiceModelHost
  /** Bytes cache keyed by model version; default Cache API, absent = memory only. */
  readonly cache?: VoiceModelCache
  /** Called while the Host installs the model, for the bubble's "Baixando o pacote de voz…". */
  readonly onDownloading?: () => void
}

/** The Cache API store, when the window has one. */
function cacheApi(name = 'persona-voice-model'): VoiceModelCache | undefined {
  if (typeof caches === 'undefined') return undefined
  return {
    async read(key) {
      const cache = await caches.open(name)
      const hit = await cache.match(`/${key}`)
      return hit === undefined ? undefined : hit.arrayBuffer()
    },
    async write(key, bytes) {
      const cache = await caches.open(name)
      await cache.put(`/${key}`, new Response(bytes))
    },
  }
}

function decodeBase64(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes.buffer
}

/**
 * Ask the Host for the voice model, reusing the cached bytes when the installed version is the same.
 * @param options - Host bridge, cache and the downloading notice.
 * @returns The archive bytes or the reason they are not available; never throws.
 */
export async function loadVoiceModel(options: VoiceModelOptions = {}): Promise<VoiceModelState> {
  const host = options.host
  if (host === undefined) return { state: 'failed', reason: 'unavailable' }
  const cache = options.cache ?? cacheApi()
  let known: VoiceModelHostState
  try {
    known = await host.voiceModelState()
  } catch {
    return { state: 'failed', reason: 'offline' }
  }
  if (known.state === 'failed') return { state: 'failed', reason: known.reason }
  if (known.state === 'unavailable') return { state: 'failed', reason: 'unavailable' }
  if (known.state === 'installed') {
    const cached = await cache?.read(known.version)
    if (cached !== undefined) return { state: 'ready', bytes: cached, version: known.version }
  }
  options.onDownloading?.()
  let reply: VoiceModelHostReply
  try {
    reply = await host.ensureVoiceModel()
  } catch {
    return { state: 'failed', reason: 'offline' }
  }
  if (reply.state !== 'ready') return { state: 'failed', reason: reply.state === 'failed' ? reply.reason : 'unavailable' }
  const bytes = decodeBase64(reply.base64)
  if (bytes.byteLength !== reply.bytes) return { state: 'failed', reason: 'checksum' }
  await cache?.write(reply.version, bytes)
  return { state: 'ready', bytes, version: reply.version }
}

type VoiceModelWire = PersonaRemoteClient & {
  voiceModelState(): unknown
  ensureVoiceModel(): unknown
}

/**
 * Adapt the persona Remote to the loader seam, unwrapping the Remote envelope.
 * @param persona - The persona Remote the panel already holds.
 * @returns The bridge {@link loadVoiceModel} expects.
 */
export function voiceModelHostFromRemote(persona: PersonaRemoteClient): VoiceModelHost {
  const wire = persona as VoiceModelWire
  return {
    voiceModelState: async () =>
      await unwrapRemote(await wire.voiceModelState() as Parameters<typeof unwrapRemote>[0]) as VoiceModelHostState,
    ensureVoiceModel: async () =>
      await unwrapRemote(await wire.ensureVoiceModel() as Parameters<typeof unwrapRemote>[0]) as VoiceModelHostReply,
  }
}
