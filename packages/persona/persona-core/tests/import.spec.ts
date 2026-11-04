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

it('Grok só fareja arquivo com grok no nome e conversas', () => {
  const grok = IMPORT_ADAPTERS.find(item => item.id === 'grok')
  expect(grok?.sniff([{ name: 'grok.json', text: '{}' }])).toBe(false)
  expect(grok?.sniff([{ name: 'notes.md', text: '{"conversations":[]}' }])).toBe(false)
})

it('ChatGPT export sem id não cria candidato', () => {
  const noId = previewImport(IMPORT_ADAPTERS, [{
    name: 'conversations.json',
    text: JSON.stringify([{ title: 'sem id', mapping: { n: { message: { content: { parts: ['oi'] } } } } }]),
  }])
  expect(noId.adapterId).toBe('chatgpt')
  expect(noId.accepted).toEqual([])
})

it('recusa arquivo irreconhecível em pt-BR', () => {
  expect(() => previewImport(IMPORT_ADAPTERS, [{ name: 'lixo.bin', text: '????' }])).toThrow(/IMPORT_REFUSED/)
  try {
    previewImport(IMPORT_ADAPTERS, [{ name: 'lixo.bin', text: '????' }])
  }
  catch (error) {
    expect(error).toMatchObject({ detail: expect.stringMatching(/Não reconheci/) })
  }
})

it('Markdown/Obsidian: wikilink, frontmatter, anexo com aviso', () => {
  const preview = previewImport(IMPORT_ADAPTERS, [
    { name: 'nota.md', text: '---\ntitle: Casa\n---\nVer [[Outra|aqui]].\n' },
    { name: 'foto.png', text: 'binary' },
  ])
  expect(preview.adapterId).toBe('markdown')
  expect(preview.presumedSchema).toBe(true)
  expect(preview.accepted[0]?.body).toContain('Casa')
  expect(preview.accepted[0]?.body).toContain('aqui')
  expect(preview.rejected.some(row => row.reason === 'ATTACHMENT')).toBe(true)
  expect(preview.counts?.discarded).toBeGreaterThan(0)
})

it('Notion csv+md ignora colunas extras', () => {
  const preview = previewImport(IMPORT_ADAPTERS, [
    { name: 'Notion/pages.csv', text: 'Name,Created time,Extra,Text\nBrief,2026-01-01,foo,olá\n' },
    { name: 'Notion/Brief.md', text: '# Brief\ntexto\n' },
  ])
  expect(preview.adapterId).toBe('notion')
  expect(preview.accepted.length).toBeGreaterThanOrEqual(2)
  expect(preview.accepted.every(row => row.externalId.startsWith('notion:'))).toBe(true)
})

it('Gemini Takeout ignora campos extras', () => {
  const preview = previewImport(IMPORT_ADAPTERS, [{
    name: 'Takeout/Gemini/conversations.json',
    text: JSON.stringify({
      conversations: [{ id: 'g1', title: 'Oi', extra: true, messages: [{ text: 'olá', unused: 1 }] }],
    }),
  }])
  expect(preview.adapterId).toBe('gemini')
  expect(preview.accepted[0]).toMatchObject({ externalId: 'gemini:g1', status: 'proposed' })
})

it('DM sem compartilhamento não sobe; reimportar não duplica', () => {
  const store = new MemoryImportStore()
  const files = [{ name: 'chat.md', text: 'segredo da dm', dm: true as const }]
  const blocked = previewImport(IMPORT_ADAPTERS, files)
  expect(blocked.accepted).toEqual([])
  expect(blocked.rejected[0]?.reason).toBe('DM_UNSHARED')
  const shared = previewImport(IMPORT_ADAPTERS, [{ ...files[0]!, shared: true }])
  const first = applyImport(store, shared, 'b1')
  expect(first.applied).toHaveLength(1)
  const again = previewImport(IMPORT_ADAPTERS, [{ ...files[0]!, shared: true }], store)
  expect(again.counts?.duplicates).toBe(1)
  expect(applyImport(store, shared, 'b2').applied).toHaveLength(0)
})
