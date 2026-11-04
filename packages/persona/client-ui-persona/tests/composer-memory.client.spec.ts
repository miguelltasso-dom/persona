// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import {
  clearComposerPocket,
  pushSentHistory,
  readComposerPocket,
  readSentHistory,
  saveComposerPocket,
} from '../src/client/chat/composer-memory.ts'
import { activeSlashToken, filterSlashCommands } from '../src/client/chat/composer-slash-commands.ts'

afterEach(() => {
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

describe('composer slash (T3-UX-HARVEST §6)', () => {
  it('filters commands from an active token', () => {
    expect(activeSlashToken('/lim', 4)).toEqual({ query: 'lim', start: 0 })
    expect(filterSlashCommands('lim').map(row => row.id)).toContain('limites')
  })
})
