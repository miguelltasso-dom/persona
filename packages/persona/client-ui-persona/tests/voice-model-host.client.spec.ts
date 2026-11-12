// @vitest-environment jsdom
/**
 * Item 20 (Keel, 23:08): the renderer never downloads the model. It asks the Host for the bytes, reuses the cache of the installed
 * version, and every failure ends in a state the bubble already knows.
 */

import { describe, expect, it } from 'vitest'
import {
  loadVoiceModel,
  type VoiceModelCache,
  type VoiceModelHost,
  type VoiceModelHostReply,
  type VoiceModelHostState,
} from '../src/client/voice/voice-model-host.ts'

function bytesOf(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), char => char.charCodeAt(0))
}

function memoryCache(initial?: ArrayBuffer) {
  const writes: { key: string; bytes: ArrayBuffer }[] = []
  const cache: VoiceModelCache = {
    read: async () => initial,
    write: async (key, bytes) => { writes.push({ key, bytes }) },
  }
  return { cache, writes }
}

function host(state: VoiceModelHostState, reply: VoiceModelHostReply = { state: 'unavailable' }) {
  const calls: string[] = []
  const bridge: VoiceModelHost = {
    voiceModelState: async () => { calls.push('state'); return state },
    ensureVoiceModel: async () => { calls.push('ensure'); return reply },
  }
  return { bridge, calls }
}

describe('o modelo de voz vem do Host', () => {
  it('sem Host não há transcrição, e o áudio segue normalmente', async () => {
    expect(await loadVoiceModel()).toEqual({ state: 'failed', reason: 'unavailable' })
  })

  it('a versão instalada com bytes no cache não pede nada ao Host', async () => {
    const { cache } = memoryCache(new Uint8Array([1, 2, 3, 4]).buffer)
    const { bridge, calls } = host({ state: 'installed', version: 'v1' })
    const state = await loadVoiceModel({ host: bridge, cache })
    expect(state.state).toBe('ready')
    expect(calls).toEqual(['state'])
  })

  it('sem cache pede os bytes, confere o tamanho e guarda pela versão', async () => {
    const { cache, writes } = memoryCache()
    const { bridge, calls } = host({ state: 'installed', version: 'v1' }, {
      state: 'ready', version: 'v1', base64: btoa(String.fromCharCode(1, 2, 3, 4)), bytes: 4,
    })
    const state = await loadVoiceModel({ host: bridge, cache })
    if (state.state !== 'ready') throw new Error(`expected ready, got ${state.state}`)
    expect(new Uint8Array(state.bytes)).toEqual(new Uint8Array([1, 2, 3, 4]))
    expect(calls).toEqual(['state', 'ensure'])
    expect(writes.map(write => write.key)).toEqual(['v1'])
  })

  it('modelo ausente instala sob demanda e avisa a tela', async () => {
    const { cache } = memoryCache()
    const { bridge } = host({ state: 'absent' }, {
      state: 'ready', version: 'v2', base64: btoa(String.fromCharCode(9, 8)), bytes: 2,
    })
    let downloading = 0
    const state = await loadVoiceModel({ host: bridge, cache, onDownloading: () => { downloading += 1 } })
    expect(state.state).toBe('ready')
    expect(downloading).toBe(1)
  })

  it('o motivo do Host chega à tela, sem baixar de novo', async () => {
    const { bridge, calls } = host({ state: 'failed', reason: 'offline' })
    expect(await loadVoiceModel({ host: bridge })).toEqual({ state: 'failed', reason: 'offline' })
    expect(calls).toEqual(['state'])
  })

  it('tamanho errado não é guardado nem usado', async () => {
    const { cache, writes } = memoryCache()
    const { bridge } = host({ state: 'absent' }, {
      state: 'ready', version: 'v1', base64: btoa(String.fromCharCode(1, 2)), bytes: 3,
    })
    expect(await loadVoiceModel({ host: bridge, cache })).toEqual({ state: 'failed', reason: 'checksum' })
    expect(writes).toHaveLength(0)
  })

  it('Host fora do ar não lança: vira falha de rede', async () => {
    const bridge: VoiceModelHost = {
      voiceModelState: async () => { throw new Error('sem rede') },
      ensureVoiceModel: async () => { throw new Error('sem rede') },
    }
    expect(await loadVoiceModel({ host: bridge })).toEqual({ state: 'failed', reason: 'offline' })
  })

  it('os bytes decodificados são os mesmos que o Host mandou', () => {
    const original = new Uint8Array([0, 127, 128, 255])
    expect(bytesOf(btoa(String.fromCharCode(...original)))).toEqual(original)
  })
})
