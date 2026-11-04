/**
 * `readLedgerEvidence` reads the paid-turn totals from a Persona home without touching the original database.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { canonicalLedgerRows, readLedgerEvidence } from '../src/ledger-evidence.ts'

const homes: string[] = []
afterEach(() => {
  while (homes.length > 0) rmSync(homes.pop()!, { recursive: true, force: true })
})

function seedHome(rows: readonly [kind: string, input: number, output: number, origin: string | null][]): string {
  const home = mkdtempSync(join(tmpdir(), 'ledger-evidence-'))
  homes.push(home)
  mkdirSync(join(home, 'db'))
  const db = new DatabaseSync(join(home, 'db', 'persona.db'))
  db.exec(`CREATE TABLE turn_ledger (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, persona_id TEXT NOT NULL, engine TEXT NOT NULL, account_id TEXT,
    kind TEXT NOT NULL, input_tokens INTEGER NOT NULL, output_tokens INTEGER NOT NULL, cache_read_tokens INTEGER NOT NULL,
    cache_write_tokens INTEGER NOT NULL, layer_system INTEGER NOT NULL, layer_tools INTEGER NOT NULL, layer_required INTEGER NOT NULL,
    layer_subject INTEGER NOT NULL, layer_recall INTEGER NOT NULL, layer_message INTEGER NOT NULL, ticket_id TEXT, origin TEXT, at TEXT NOT NULL
  ) STRICT`)
  const insert = db.prepare('INSERT INTO turn_ledger VALUES (?, \'pp\', \'p1\', \'claude\', NULL, ?, ?, ?, 7, 3, 0, 0, 0, 0, 0, 0, \'t1\', ?, ?)')
  rows.forEach(([kind, input, output, origin], index) => insert.run(`id-${String(index)}`, kind, input, output, origin, `2026-11-04T12:00:0${String(index)}Z`))
  db.close()
  return home
}

describe('readLedgerEvidence', () => {
  it('sums input, output and cache tokens and reports whether every turn was measured', () => {
    const home = seedHome([['execution', 1000, 80, 'measured'], ['triage', 200, 20, 'measured']])
    const evidence = readLedgerEvidence(home)!
    expect(evidence.turns).toBe(2)
    expect(evidence.inputTokens).toBe(1200)
    expect(evidence.outputTokens).toBe(100)
    expect(evidence.cacheReadTokens).toBe(14)
    expect(evidence.cacheWriteTokens).toBe(6)
    expect(evidence.allMeasured).toBe(true)
    expect(evidence.rows.map(row => row.kind)).toEqual(['execution', 'triage'])
  })

  it('flags estimates and returns undefined without a database', () => {
    expect(readLedgerEvidence(seedHome([['execution', 10, 1, 'estimate']]))!.allMeasured).toBe(false)
    const empty = mkdtempSync(join(tmpdir(), 'ledger-empty-'))
    homes.push(empty)
    expect(readLedgerEvidence(empty)).toBeUndefined()
  })

  it('does not modify the original database (read-only evidence)', () => {
    const home = seedHome([['execution', 5, 1, 'measured']])
    const file = join(home, 'db', 'persona.db')
    const before = { bytes: readFileSync(file), mtime: statSync(file).mtimeMs }
    readLedgerEvidence(home)
    expect(readFileSync(file).equals(before.bytes)).toBe(true)
    expect(statSync(file).mtimeMs).toBe(before.mtime)
  })

  it('converts SQL rows to the canonical entry without inventing defaults (optional NULLs omitted, required NULLs kept for the verifier to reject)', () => {
    const home = seedHome([['execution', 1000, 80, 'measured']])
    const [entry] = canonicalLedgerRows(readLedgerEvidence(home)!.rawRows)
    expect(entry).toEqual({
      id: 'id-0', personaId: 'p1', engine: 'claude', kind: 'execution',
      inputTokens: 1000, outputTokens: 80, cacheReadTokens: 7, cacheWriteTokens: 3,
      layers: { system: 0, tools: 0, required: 0, subject: 0, recall: 0, message: 0 },
      at: '2026-11-04T12:00:00Z', ticketId: 't1', origin: 'measured',
    })
    expect(entry).not.toHaveProperty('accountId') // optional NULL is omitted, not null/''
    const broken = canonicalLedgerRows([{ id: 'x', persona_id: null, engine: 'claude', kind: 'execution', input_tokens: 1, output_tokens: 1,
      cache_read_tokens: 0, cache_write_tokens: 0, layer_system: 0, layer_tools: 0, layer_required: 0, layer_subject: 0, layer_recall: 0,
      layer_message: 0, ticket_id: null, origin: null, account_id: null, at: '2026-11-04T12:00:00Z' }])
    expect(broken[0]!.personaId).toBeNull() // a required NULL is NOT replaced by '' or 0: the verifier rejects it
    expect(broken[0]).not.toHaveProperty('origin')
  })
})
