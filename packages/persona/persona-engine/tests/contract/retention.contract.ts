/**
 * Retention contract. Parameterize with a factory; Anvil runs the same suite
 * against SQLite (VACUUM / FTS).
 */

import { describe, expect, it } from 'vitest'
import {
  DAY_MS,
  DEFAULT_RETENTION,
  applyRetention,
  type RetentionPolicy,
  type RetentionRecord,
  type RetentionStore,
} from '../../src/index.ts'

export type RetentionFactory = () => RetentionStore

function row(id: string, overrides: Partial<RetentionRecord> = {}): RetentionRecord {
  return {
    id,
    kind: 'trigger',
    createdAt: 0,
    derivativeIds: [],
    indexKeys: [`idx:${id}`],
    ...overrides,
  }
}

export function defineRetentionSuite(open: RetentionFactory, label = 'memory'): void {
  describe(`retention contract (${label})`, () => {
    it('arquivar não apaga o registro', () => {
      const store = open()
      store.save(row('t1'))
      const policy: RetentionPolicy = { windows: [{ kind: 'trigger', archiveAfterMs: 10 }] }
      const result = applyRetention(store, policy, 20)
      expect(result.archived).toEqual(['t1'])
      expect(store.get('t1')?.archivedAt).toBe(20)
      expect(store.get('t1')?.id).toBe('t1')
    })

    it('excluir é recusado enquanto há derivados e não deixa índice nem cache', () => {
      const store = open()
      store.save(row('src', { kind: 'message', createdAt: 0, derivativeIds: ['mem-1'] }))
      store.save(row('clean', { kind: 'outbox', createdAt: 0 }))
      const policy: RetentionPolicy = {
        windows: [
          { kind: 'message', archiveAfterMs: 1, deleteAfterMs: 2 },
          { kind: 'outbox', archiveAfterMs: 1, deleteAfterMs: 2 },
        ],
      }
      const result = applyRetention(store, policy, 5)
      expect(result.refused).toContain('src')
      expect(store.get('src')).toBeDefined()
      expect(result.deleted).toContain('clean')
      expect(store.get('clean')).toBeUndefined()
      expect(store.hasIndex('idx:clean')).toBe(false)
      expect(store.hasCache('clean')).toBe(false)
    })

    it('defaults cobrem todos os tipos e nunca apagam trigger/decision', () => {
      const kinds = DEFAULT_RETENTION.windows.map(window => window.kind)
      expect(kinds).toEqual([
        'trigger', 'disposition', 'decision', 'outbox', 'effect', 'input', 'message', 'usage',
      ])
      expect(DEFAULT_RETENTION.windows.find(window => window.kind === 'trigger')?.deleteAfterMs).toBeUndefined()
      expect(DEFAULT_RETENTION.windows.find(window => window.kind === 'decision')?.deleteAfterMs).toBeUndefined()
      expect(DAY_MS).toBe(86_400_000)
    })
  })
}
