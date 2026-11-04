import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { applyVaultExport, exportMarkdownOneWay, leftoverDestFiles, planVaultExport } from '../src/vault-export.ts'

describe('SB-6 one-way vault export', () => {
  it('writes new pages, skips same hash, never deletes extras', () => {
    const dest = new Map<string, string>([['keep.md', 'old extra']])
    const first = exportMarkdownOneWay(
      [{ rel: 'empresa.md', body: '# Empresa' }, { rel: '../escape.md', body: 'nope' }],
      (rel, body) => { dest.set(rel, body) },
    )
    expect(first.written).toBe(1)
    expect(dest.get('keep.md')).toBe('old extra')
    expect(dest.get('empresa.md')).toBe('# Empresa')
    const hash = createHash('sha256').update('# Empresa').digest('hex')
    const same = exportMarkdownOneWay(
      [{ rel: 'empresa.md', body: '# Empresa' }],
      (rel, body) => { dest.set(rel, body) },
      () => hash,
    )
    expect(same).toEqual({ written: 0, skipped: 1 })
    expect(leftoverDestFiles(['keep.md', 'empresa.md', '../x.md'], ['empresa.md'])).toEqual(['keep.md'])
    expect(planVaultExport(
      [{ rel: 'empresa.md', body: '# Empresa' }],
      ['keep.md', 'empresa.md'],
      () => hash,
    )).toEqual({ written: 0, skipped: 1, leftover: ['keep.md'] })
    const applied = new Map<string, string>()
    expect(applyVaultExport(
      [{ rel: 'empresa.md', body: '# Empresa' }],
      ['keep.md'],
      (rel, body) => { applied.set(rel, body) },
    )).toEqual({ written: 1, skipped: 0, leftover: ['keep.md'] })
    expect(applied.get('empresa.md')).toBe('# Empresa')
    expect(applied.has('keep.md')).toBe(false)
  })
})
