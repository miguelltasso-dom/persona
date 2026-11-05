import { describe, expect, it } from 'vitest'
import { checkRuntimeImports } from '../src/index.ts'

describe('checkRuntimeImports (ENG-1: every runner runtime must load, or the pack fails)', () => {
  it('loads OAR and every runtime the product can use, in a stable order', async () => {
    const rows = await checkRuntimeImports()
    expect(rows.map(row => row.runtime)).toEqual(['oar', 'claude', 'codex', 'opencode', 'cursor-sdk'])
    expect(rows.filter(row => !row.ok)).toEqual([])
    // A cold import of OAR + the Cursor SDK takes several seconds on a busy machine.
  }, 90_000)
})
