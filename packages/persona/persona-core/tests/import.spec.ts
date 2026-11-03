import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import {
  IMPORT_ADAPTERS,
  MemoryImportStore,
  applyImport,
  looksLikeSecret,
  previewImport,
  rollbackImport,
} from '../src/index.ts'

const dir = dirname(fileURLToPath(import.meta.url))

it('imports a ChatGPT export as proposed messages and refuses secrets', () => {
  const text = readFileSync(join(dir, 'fixtures/chatgpt-conversations.json'), 'utf8')
  const preview = previewImport(IMPORT_ADAPTERS, [{ name: 'conversations.json', text }])
  expect(preview.adapterId).toBe('chatgpt')
  expect(preview.accepted[0]).toMatchObject({ externalId: 'chatgpt:c1', status: 'proposed', privacy: 'private' })
  expect(looksLikeSecret('Authorization: Bearer abc')).toBe(true)
  const dirty = previewImport(IMPORT_ADAPTERS, [{
    name: 'conversations.json',
    text: JSON.stringify([{ id: 'c2', title: 'x', mapping: { n: { message: { content: { parts: ['cookie=abc'] } } } } }]),
  }])
  expect(dirty.accepted).toEqual([])
  expect(dirty.rejected[0]?.reason).toBe('SECRET')
})

it('dedupes on external id and rolls a batch back', () => {
  const store = new MemoryImportStore()
  const text = readFileSync(join(dir, 'fixtures/claude-conversations.json'), 'utf8')
  const preview = previewImport(IMPORT_ADAPTERS, [{ name: 'conversations.json', text }])
  expect(preview.adapterId).toBe('claude')
  const first = applyImport(store, preview, 'b1')
  expect(first.applied).toHaveLength(1)
  expect(applyImport(store, preview, 'b2').applied).toHaveLength(0)
  expect(rollbackImport(store, 'b1').rolledBack).toBe(true)
  expect(applyImport(store, preview, 'b3').applied).toHaveLength(1)
})

it('imports a markdown folder as proposed memories', () => {
  const text = readFileSync(join(dir, 'fixtures/notes/sobre.md'), 'utf8')
  const preview = previewImport(IMPORT_ADAPTERS, [{ name: 'sobre.md', text }])
  expect(preview.adapterId).toBe('markdown')
  expect(preview.accepted[0]?.kind).toBe('memory')
})

it('keeps the Grok adapter as an extension that does not sniff yet', () => {
  const grok = IMPORT_ADAPTERS.find(item => item.id === 'grok')
  expect(grok?.sniff([{ name: 'grok.json', text: '{}' }])).toBe(false)
})
