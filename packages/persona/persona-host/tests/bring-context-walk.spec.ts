import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { previewBringContextVaultFolder } from '../src/bring-context-walk.ts'

describe('previewBringContextVaultFolder', () => {
  it('imports .md and ignores .obsidian', () => {
    const root = join(tmpdir(), `persona-byc-${Date.now()}`)
    mkdirSync(join(root, '.obsidian'), { recursive: true })
    writeFileSync(join(root, 'nota.md'), '# Clientes\n\n## Sobre mim\nMiguel, fundador.\n')
    writeFileSync(join(root, '.obsidian', 'workspace.json'), '{}')
    writeFileSync(join(root, 'logo.png'), 'fake')
    const preview = previewBringContextVaultFolder(root)
    expect(preview.source).toBe('vault')
    expect(preview.proposals.length).toBeGreaterThan(0)
    expect(preview.ignored.some(row => row.path.includes('logo.png'))).toBe(true)
  })
})
