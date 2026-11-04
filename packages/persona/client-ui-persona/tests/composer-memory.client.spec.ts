// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearComposerPocket,
  pushSentHistory,
  readComposerPocket,
  pastedThousands,
  readSentHistory,
  saveComposerPocket,
} from '../src/client/chat/composer-memory.ts'
import { activeSlashToken, filterSlashCommands } from '../src/client/chat/composer-slash-commands.ts'

afterEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

describe('composer memory (T3-UX-HARVEST §3)', () => {
  it('stores sent history per conversation and dedupes', () => {
    pushSentHistory('dm:nina', 'primeiro')
    pushSentHistory('dm:nina', 'segundo')
    pushSentHistory('dm:nina', 'primeiro')
    expect(readSentHistory('dm:nina')).toEqual(['primeiro', 'segundo'])
    expect(readSentHistory('dm:atlas')).toEqual([])
  })

  it('saves and restores a draft pocket', () => {
    saveComposerPocket('ch:1', { text: 'rascunho', savedAt: '2026-11-04T12:00:00.000Z', attachmentNames: ['a.txt'] })
    expect(readComposerPocket('ch:1')?.text).toBe('rascunho')
    clearComposerPocket('ch:1')
    expect(readComposerPocket('ch:1')).toBeNull()
  })
})

describe('composer memory persists and never breaks (P0-17)', () => {
  it('guarda em localStorage: sobrevive a trocar de tela e a reabrir o app (sessionStorage não é usado)', () => {
    pushSentHistory('dm:nina', 'oi')
    saveComposerPocket('dm:nina', { text: 'rascunho', savedAt: '2026-11-04T12:00:00.000Z', attachmentNames: [] })
    expect(localStorage.length).toBe(2)
    expect(sessionStorage.length).toBe(0)
    expect(readSentHistory('dm:nina')).toEqual(['oi'])
    expect(readComposerPocket('dm:nina')?.text).toBe('rascunho')
  })

  it('storage cheio: o envio segue sem histórico e o bolso diz que NÃO guardou', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('cheio', 'QuotaExceededError') })
    expect(() => { pushSentHistory('dm:nina', 'oi') }).not.toThrow()
    expect(saveComposerPocket('dm:nina', { text: 'x'.repeat(10), savedAt: '2026-11-04T12:00:00.000Z', attachmentNames: [] })).toBe(false)
    spy.mockRestore()
    expect(saveComposerPocket('dm:nina', { text: 'ok', savedAt: '2026-11-04T12:00:00.000Z', attachmentNames: [] })).toBe(true)
  })

  it('storage bloqueado na leitura e na limpeza: devolve vazio e não lança', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('bloqueado', 'SecurityError') })
    expect(readSentHistory('dm:nina')).toEqual([])
    expect(readComposerPocket('dm:nina')).toBeNull()
    spy.mockRestore()
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new DOMException('bloqueado', 'SecurityError') })
    expect(() => { clearComposerPocket('dm:nina') }).not.toThrow()
    remove.mockRestore()
  })

  it('milhares de caracteres do cartão de colagem grande: arredondado e nunca menos de 1', () => {
    expect(pastedThousands(48_200)).toBe(48)
    expect(pastedThousands(32_768)).toBe(33)
    expect(pastedThousands(200)).toBe(1)
  })
})

describe('composer slash (T3-UX-HARVEST §6)', () => {
  it('filters commands from an active token', () => {
    expect(activeSlashToken('/lim', 4)).toEqual({ query: 'lim', start: 0 })
    expect(filterSlashCommands('lim').map(row => row.id)).toContain('limites')
  })
})
