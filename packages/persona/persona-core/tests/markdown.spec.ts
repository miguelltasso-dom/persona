import { expect, it } from 'vitest'
import { markdownToVault, memoryToMarkdown, parseVaultRecord, vaultToMarkdown } from '../src/index.ts'
import type { AgedMemory } from '../src/index.ts'

it('round-trips a vault record through markdown', () => {
  const record = parseVaultRecord({
    id: 'v1',
    workspaceId: 'ws',
    kind: 'brief',
    body: 'Somos uma agência.\n\nAtendemos no-show.',
    status: 'active',
    sourceIds: [],
    authorId: 'miguel',
    visibility: { kind: 'workspace' },
    createdAt: '2026-11-03T13:00:00Z',
    revision: 2,
  })
  const md = vaultToMarkdown(record)
  expect(md).toContain('id: v1')
  expect(md).toContain('Somos uma agência.')
  const back = markdownToVault(md)
  expect(back).toMatchObject({
    id: 'v1', kind: 'brief', revision: 2, status: 'active', workspaceId: 'ws',
    body: 'Somos uma agência.\n\nAtendemos no-show.',
  })
})

it('exports a memory as fenced markdown with front matter', () => {
  const memory: AgedMemory = {
    id: 'm1', layer: 'semantic', body: 'Prefere fatura semanal.', score: 0.75, uses: 3, archived: false,
  }
  const md = memoryToMarkdown(memory)
  expect(md).toContain('id: m1')
  expect(md).toContain('layer: semantic')
  expect(md).toContain('Prefere fatura semanal.')
})

it('rejects markdown without a front-matter fence', () => {
  expect(() => markdownToVault('no front matter')).toThrow('INVALID_MARKDOWN')
})
