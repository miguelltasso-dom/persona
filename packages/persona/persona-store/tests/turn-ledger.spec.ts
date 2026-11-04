import { EMPTY_LAYERS, foldUsagePanel } from '@deepseek-ai/dsh-persona-core'
import { usagePortWindow } from '@deepseek-ai/dsh-persona-usage'
import type { TurnLedgerEntry } from '@deepseek-ai/dsh-persona-core'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { StoreError } from '../src/errors.ts'
import { PERSONA_MIGRATIONS, PERSONA_SCHEMA_VERSION, openPersonaStore } from '../src/index.ts'
import { TurnLedgerRepos } from '../src/ledger/repos.ts'
import { openTempStore, withTempStore } from '../src/test-helpers.ts'

const at = '2026-11-04T03:30:00.000Z'

function entry(overrides: Partial<TurnLedgerEntry> = {}): TurnLedgerEntry {
  return {
    id: 't1',
    personaId: 'atlas',
    engine: 'claude',
    kind: 'execution',
    inputTokens: 40,
    outputTokens: 10,
    cacheReadTokens: 0,
    cacheWriteTokens: 28,
    layers: { ...EMPTY_LAYERS, system: 20, tools: 8, message: 12 },
    at,
    ticketId: 'task-1',
    origin: 'measured',
    ...overrides,
  }
}

it('persists canonical execution/evaluation and refuses Rivet port tags', async () => {
  await withTempStore(async (store) => {
    const book = new TurnLedgerRepos(store)
    book.put('pp', entry())
    book.put('pp', entry({
      id: 't2',
      personaId: 'nina',
      kind: 'evaluation',
      inputTokens: 50,
      outputTokens: 20,
      cacheReadTokens: 28,
      cacheWriteTokens: 0,
      layers: { ...EMPTY_LAYERS, system: 20, tools: 8, message: 22 },
    }))
    const rows = book.list({ projectId: 'pp' })
    expect(rows.map(row => row.kind)).toEqual(['execution', 'evaluation'])
    expect(rows[0]?.layers.message).toBe(12)
    expect(() => book.put('pp', entry({
      id: 'bad',
      kind: 'exec' as TurnLedgerEntry['kind'],
    }))).toThrow(StoreError)
    expect(usagePortWindow('execution')).toBe('exec')
    expect(usagePortWindow('evaluation')).toBe('eval')
    const panel = foldUsagePanel(rows, ['task-1'])
    expect(panel.origin).toBe('measured')
    expect(panel.tokensPerSuccessfulTask).toBe(120)
    expect(panel.byKind.map(row => row.key)).toEqual(['execution', 'evaluation'])
    expect(book.list({ projectId: 'other' })).toEqual([])
  })
})

it('OPT-9: keeps the measured wall time of a turn, and leaves it absent when the runner did not report it', async () => {
  await withTempStore(async (store) => {
    const book = new TurnLedgerRepos(store)
    book.put('pp', entry({ id: 'timed', durationMs: 4_200 }))
    book.put('pp', entry({ id: 'untimed', at: '2026-11-04T03:31:00.000Z' }))
    book.put('pp', entry({ id: 'instant', at: '2026-11-04T03:32:00.000Z', durationMs: 0 }))
    const rows = new Map(book.list({ projectId: 'pp' }).map(row => [row.id, row]))
    expect(rows.get('timed')?.durationMs).toBe(4_200)
    expect(rows.get('instant')?.durationMs).toBe(0) // a measured zero is not "unknown"
    expect(rows.get('untimed')).not.toHaveProperty('durationMs') // never a made-up 0
    // Replacing a row replaces its time too (the book is "append or replace", nothing is merged behind the person's back).
    book.put('pp', entry({ id: 'timed', durationMs: 5_000 }))
    expect(book.list({ projectId: 'pp' }).find(row => row.id === 'timed')?.durationMs).toBe(5_000)
    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => book.put('pp', entry({ id: `bad-${String(bad)}`, durationMs: bad }))).toThrow()
    }
    expect(book.list({ projectId: 'pp' }).some(row => row.id.startsWith('bad-'))).toBe(false)
  })
})

it('OPT-9: a v19 database opens at v20 with its ledger rows intact and no time invented for them', async () => {
  const temp = await openTempStore({ migrations: PERSONA_MIGRATIONS.filter(item => item.version <= 19) })
  try {
    expect(temp.store.schemaVersion()).toBe(19)
    temp.store.db.exec(`INSERT INTO turn_ledger
      (id, project_id, persona_id, engine, account_id, kind, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
       layer_system, layer_tools, layer_required, layer_subject, layer_recall, layer_message, ticket_id, origin, at)
      VALUES ('old', 'pp', 'atlas', 'claude', NULL, 'reply', 30, 5, 0, 0, 0, 0, 0, 0, 0, 0, NULL, 'measured', '${at}')`)
    temp.store.close()
    const migrated = openPersonaStore({ path: temp.path, backupDir: join(temp.dir, 'backups') })
    try {
      expect(migrated.schemaVersion()).toBe(PERSONA_SCHEMA_VERSION)
      const old = new TurnLedgerRepos(migrated).list({ projectId: 'pp' })
      expect(old).toHaveLength(1)
      expect(old[0]).toMatchObject({ id: 'old', inputTokens: 30, outputTokens: 5, origin: 'measured' })
      expect(old[0]).not.toHaveProperty('durationMs')
    } finally {
      migrated.close()
    }
  } finally {
    await temp.dispose()
  }
})
