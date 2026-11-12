// @vitest-environment jsdom
/**
 * Item 20 (Muse §4): os cinco sons sintetizados, a política de quando tocar e a preferência local.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { SOUND_SCORES, type PersonaSound } from '../src/client/voice/sound-score.ts'
import { mayPlay, SOUND_MIN_GAP_MS, SOUND_VOLUME_GAIN, type SoundGate } from '../src/client/voice/sound-policy.ts'
import { createSoundPlayer, scheduleSound, type SoundAudioContext } from '../src/client/voice/sound-player.ts'
import { createSoundEffects } from '../src/client/voice/sound-effects.ts'
import {
  readSoundVolume,
  readSoundsEnabled,
  writeSoundVolume,
  writeSoundsEnabled,
} from '../src/client/voice/sounds-preference.ts'

const SOUNDS: readonly PersonaSound[] = ['delivery', 'confirm', 'dm', 'sent', 'error']

function gate(overrides: Partial<SoundGate> = {}): SoundGate {
  return { enabled: true, gesture: true, now: 10_000, quiet: false, conversationFocused: false, ...overrides }
}

function fakeContext() {
  const played: { wave: string; frequency: number; start: number; stop: number }[] = []
  let resumed = 0
  let closed = 0
  const param = () => ({
    value: 0,
    setValueAtTime: () => undefined,
    linearRampToValueAtTime: () => undefined,
    exponentialRampToValueAtTime: () => undefined,
  })
  const context: SoundAudioContext = {
    state: 'suspended',
    currentTime: 10,
    destination: {},
    resume: async () => { resumed += 1 },
    close: async () => { closed += 1 },
    createOscillator: () => {
      const row = { wave: 'sine', frequency: 0, start: 0, stop: 0 }
      played.push(row)
      return {
        get type() { return row.wave as OscillatorType },
        set type(value: OscillatorType) { row.wave = value },
        frequency: {
          get value() { return row.frequency },
          set value(next: number) { row.frequency = next },
          setValueAtTime: () => undefined,
          linearRampToValueAtTime: () => undefined,
          exponentialRampToValueAtTime: () => undefined,
        },
        connect: () => undefined,
        start: (when: number) => { row.start = when },
        stop: (when: number) => { row.stop = when },
      }
    },
    createGain: () => ({ gain: param(), connect: () => undefined }),
  }
  return { context, played, resumed: () => resumed, closed: () => closed }
}

afterEach(() => { localStorage.clear() })

describe('os cinco sons', () => {
  it('cada um tem notas curtas e audíveis, e o cue inteiro dura menos de meio segundo', () => {
    for (const sound of SOUNDS) {
      const score = SOUND_SCORES[sound]
      expect(score.length).toBeGreaterThan(0)
      for (const note of score) {
        expect(note.frequency).toBeGreaterThanOrEqual(200)
        expect(note.frequency).toBeLessThanOrEqual(2_000)
        expect(note.durationMs).toBeGreaterThan(0)
        expect(note.durationMs).toBeLessThanOrEqual(150)
        expect(note.gain).toBeGreaterThan(0)
        expect(note.gain).toBeLessThanOrEqual(1)
      }
      const end = Math.max(...score.map(note => note.atMs + note.durationMs))
      expect(end).toBeLessThan(500)
    }
  })
})

describe('a política dos sons', () => {
  it('não toca desligado, sem gesto na janela ou dentro da janela de silêncio', () => {
    expect(mayPlay('delivery', gate({ enabled: false }))).toBe(false)
    expect(mayPlay('delivery', gate({ gesture: false }))).toBe(false)
    expect(mayPlay('delivery', gate({ quiet: true }))).toBe(false)
  })

  it('mensagem nova em DM não toca com a conversa aberta e focada', () => {
    expect(mayPlay('dm', gate({ conversationFocused: true }))).toBe(false)
    expect(mayPlay('dm', gate({ conversationFocused: false }))).toBe(true)
    expect(mayPlay('delivery', gate({ conversationFocused: true }))).toBe(true)
  })

  it('no máximo um som a cada dois segundos', () => {
    expect(mayPlay('sent', gate({ lastPlayedAt: 10_000 - SOUND_MIN_GAP_MS + 1 }))).toBe(false)
    expect(mayPlay('sent', gate({ lastPlayedAt: 10_000 - SOUND_MIN_GAP_MS }))).toBe(true)
    expect(mayPlay('sent', gate())).toBe(true)
  })
})

describe('o tocador', () => {
  it('agenda uma nota por oscilador, com o volume da pessoa e o envelope', () => {
    const { context, played } = fakeContext()
    scheduleSound(context, 'delivery', 'low')
    expect(played).toHaveLength(SOUND_SCORES.delivery.length)
    expect(played[0]?.start).toBe(10)
    expect(played[0]?.stop).toBeCloseTo(10 + 0.09 + 0.01, 5)
    expect(SOUND_VOLUME_GAIN.low).toBeLessThan(SOUND_VOLUME_GAIN.medium)
  })

  it('constrói o contexto no primeiro som, retoma se suspenso e fecha ao sair', () => {
    const { context, resumed, closed } = fakeContext()
    let built = 0
    const player = createSoundPlayer({ volume: () => 'low', createContext: () => { built += 1; return context } })
    expect(built).toBe(0)
    player.play('sent')
    expect(built).toBe(1)
    expect(resumed()).toBe(1)
    player.play('error')
    expect(built).toBe(1)
    player.close()
    expect(closed()).toBe(1)
  })

  it('um contexto que falha nunca vira erro na cara da pessoa', () => {
    const player = createSoundPlayer({ volume: () => 'low', createContext: () => { throw new Error('sem áudio') } })
    expect(() => { player.play('dm') }).not.toThrow()
  })
})

describe('a preferência local', () => {
  it('sons ligados e volume baixo por padrão', () => {
    expect(readSoundsEnabled()).toBe(true)
    expect(readSoundVolume()).toBe('low')
  })

  it('guarda o desligado e o volume médio', () => {
    writeSoundsEnabled(false)
    writeSoundVolume('medium')
    expect(readSoundsEnabled()).toBe(false)
    expect(readSoundVolume()).toBe('medium')
  })

  it('sem storage, a escolha não quebra a tela', () => {
    const broken = { getItem: () => { throw new Error('sem storage') }, setItem: () => { throw new Error('sem storage') } }
    expect(readSoundsEnabled(broken)).toBe(true)
    expect(readSoundVolume(broken)).toBe('low')
    expect(() => { writeSoundsEnabled(false, broken); writeSoundVolume('medium', broken) }).not.toThrow()
  })
})

describe('a ligação com os eventos da janela', () => {
  function makeEffects(overrides: { enabled?: () => boolean; now?: () => number } = {}) {
    const played: PersonaSound[] = []
    let closed = 0
    let now = 10_000
    const effects = createSoundEffects({
      player: { play: (kind) => { played.push(kind) }, close: () => { closed += 1 } },
      now: overrides.now ?? (() => now),
      enabled: overrides.enabled ?? (() => true),
    })
    return { effects, played, closed: () => closed, advance: (ms: number) => { now += ms } }
  }

  it('nada toca antes do primeiro gesto na janela', () => {
    const { effects, played } = makeEffects()
    effects.notify('delivery')
    expect(played).toEqual([])
    effects.gesture()
    effects.notify('delivery')
    expect(played).toEqual(['delivery'])
  })

  it('respeita o intervalo de dois segundos e a janela de silêncio', () => {
    const { effects, played, advance } = makeEffects()
    effects.gesture()
    effects.notify('sent')
    effects.notify('sent')
    expect(played).toEqual(['sent'])
    advance(SOUND_MIN_GAP_MS)
    effects.notify('sent')
    expect(played).toEqual(['sent', 'sent'])
    effects.setQuiet(true)
    advance(SOUND_MIN_GAP_MS)
    effects.notify('delivery')
    expect(played).toEqual(['sent', 'sent'])
  })

  it('DM não toca com a conversa focada; desligado não toca nada', () => {
    const { effects, played, advance } = makeEffects()
    effects.gesture()
    effects.setConversationFocused(true)
    effects.notify('dm')
    expect(played).toEqual([])
    effects.setConversationFocused(false)
    effects.notify('dm')
    expect(played).toEqual(['dm'])
    advance(SOUND_MIN_GAP_MS)
    const off = makeEffects({ enabled: () => false })
    off.effects.gesture()
    off.effects.notify('delivery')
    expect(off.played).toEqual([])
  })

  it('fecha o tocador ao sair', () => {
    const { effects, closed } = makeEffects()
    effects.dispose()
    expect(closed()).toBe(1)
  })
})
