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
      expect(old[0]).not.toHaveProperty('envMode') // D-085: nothing is back-filled either
    } finally {
      migrated.close()
    }
  } finally {
    await temp.dispose()
  }
})

it('D-085: keeps the mode a call ran in when the runner reported it, and leaves it absent otherwise', async () => {
  await withTempStore(async (store) => {
    const book = new TurnLedgerRepos(store)
    for (const [id, mode] of [['n', 'native'], ['a', 'answer-only'], ['d', 'needed']] as const) book.put('pp', entry({ id, envMode: mode }))
    book.put('pp', entry({ id: 'unknown' }))
    const rows = new Map(book.list({ projectId: 'pp' }).map(row => [row.id, row]))
    expect(rows.get('n')?.envMode).toBe('native')
    expect(rows.get('a')?.envMode).toBe('answer-only')
    expect(rows.get('d')?.envMode).toBe('needed')
    expect(rows.get('unknown')).not.toHaveProperty('envMode') // never a made-up mode
    // Only the three known modes are recorded: the core refuses anything else before it reaches the book.
    expect(() => book.put('pp', entry({ id: 'bad', envMode: 'sandbox' as unknown as 'native' }))).toThrow()
    expect(book.list({ projectId: 'pp' }).some(row => row.id === 'bad')).toBe(false)
  })
})

it('EFF-1: keeps the model and effort the person chose (and what the engine dropped) with the row, without a schema change', async () => {
  await withTempStore(async (store) => {
    const version = PERSONA_SCHEMA_VERSION
    const book = new TurnLedgerRepos(store)
    book.put('pp', entry({ id: 'opus-max', model: 'opus', modelRequested: 'opus', effortRequested: 'max' }))
    book.put('pp', entry({ id: 'dropped', model: 'default', modelRequested: 'claude-nope-9', modelDropped: 'claude-nope-9', effortRequested: 'xhigh', effortDropped: 'xhigh' }))
    book.put('pp', entry({ id: 'default', model: 'default' })) // "Padrão do motor": nothing chosen, nothing said
    book.put('other', entry({ id: 'opus-max-other', modelRequested: 'sonnet' }))
    const rows = new Map(book.list({ projectId: 'pp' }).map(row => [row.id, row]))
    expect(rows.get('opus-max')).toMatchObject({ model: 'opus', modelRequested: 'opus', effortRequested: 'max' })
    expect(rows.get('opus-max')).not.toHaveProperty('modelDropped')
    expect(rows.get('opus-max')).not.toHaveProperty('effortDropped')
    expect(rows.get('dropped')).toMatchObject({ model: 'default', modelRequested: 'claude-nope-9', modelDropped: 'claude-nope-9', effortRequested: 'xhigh', effortDropped: 'xhigh' })
    for (const field of ['model', 'modelRequested', 'effortRequested', 'modelDropped', 'effortDropped']) expect(rows.get('default')).not.toHaveProperty(field)
    // The detail is per project: another tenant's row with the same kind never leaks into this book.
    expect(book.list({ projectId: 'other' })[0]).toMatchObject({ id: 'opus-max-other', modelRequested: 'sonnet' })
    expect(book.list({ projectId: 'pp', personaId: 'atlas' })).toHaveLength(3)
    // Written as a JSON detail (screen_doc), only for the turns with a choice: no column, no migration.
    const docs = store.db.prepare('SELECT project_id, id FROM screen_doc WHERE kind = ? ORDER BY project_id, id').all('turn_engine')
    expect(docs.map(doc => `${String(doc.project_id)}:${String(doc.id)}`)).toEqual(['other:opus-max-other', 'pp:dropped', 'pp:opus-max'])
    expect(PERSONA_SCHEMA_VERSION).toBe(version)
    // Replacing a row without a choice drops its old detail (the book never shows a choice the turn did not have).
    book.put('pp', entry({ id: 'opus-max' }))
    expect(book.list({ projectId: 'pp' }).find(row => row.id === 'opus-max')).not.toHaveProperty('modelRequested')
    expect(store.db.prepare('SELECT COUNT(*) AS n FROM screen_doc WHERE kind = ? AND id = ?').get('turn_engine', 'opus-max')?.n).toBe(0)
    // Values are identifiers, never prose: the core refuses anything else before it reaches the book.
    expect(() => book.put('pp', entry({ id: 'prose', modelRequested: 'use o melhor modelo' }))).toThrow()
    expect(book.list({ projectId: 'pp' }).some(row => row.id === 'prose')).toBe(false)
    // A damaged detail is left out field by field; the row still reads.
    store.db.prepare('INSERT INTO screen_doc (project_id, kind, id, body, updated_at) VALUES (?, ?, ?, ?, ?)').run('pp', 'turn_engine', 'default', '{"modelRequested":"bad value","effortRequested":"high"', at)
    expect(book.list({ projectId: 'pp' }).find(row => row.id === 'default')).not.toHaveProperty('effortRequested')
    store.db.prepare('UPDATE screen_doc SET body = ? WHERE kind = ? AND id = ?').run('{"modelRequested":"bad value","effortRequested":"high"}', 'turn_engine', 'default')
    const damaged = book.list({ projectId: 'pp' }).find(row => row.id === 'default')
    expect(damaged?.effortRequested).toBe('high')
    expect(damaged).not.toHaveProperty('modelRequested')
  })
})
