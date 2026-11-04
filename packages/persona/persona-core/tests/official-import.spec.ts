import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { applyImport, IMPORT_ADAPTERS, MemoryImportStore, previewImport } from '../src/index.ts'

const dir = dirname(fileURLToPath(import.meta.url))
const official = join(dir, 'fixtures/official')

it('ChatGPT oficial: mapping em árvore, ramos, anexo e caracteres; conversation_id', () => {
  const text = readFileSync(join(official, 'chatgpt-conversations.json'), 'utf8')
  const preview = previewImport(IMPORT_ADAPTERS, [{ name: 'conversations.json', text }])
  expect(preview.adapterId).toBe('chatgpt')
  expect(preview.presumedSchema).toBe(true)
  expect(preview.accepted[0]?.externalId).toBe('chatgpt:conv-oficial-1')
  const body = preview.accepted[0]?.body ?? ''
  expect(body).toContain('São Paulo')
  expect(body).toContain('Ramo A')
  expect(body).toContain('Ramo B')
  expect(body).toContain('日本語')
  expect(body).toContain('📎')
  expect(body).not.toContain('file-service://')
})

it('ChatGPT oficial: carga grande (80 nós + parte longa) não explode', () => {
  const mapping: Record<string, unknown> = {
    root: { id: 'root', parent: null, children: ['n0'], message: null },
  }
  for (let i = 0; i < 80; i += 1) {
    mapping[`n${String(i)}`] = {
      id: `n${String(i)}`,
      parent: i === 0 ? 'root' : `n${String(i - 1)}`,
      children: i === 79 ? [] : [`n${String(i + 1)}`],
      message: {
        content: { content_type: 'text', parts: [i === 79 ? `FIM ${'x'.repeat(20_000)}` : `passo ${String(i)}`] },
      },
    }
  }
  const text = JSON.stringify([{ conversation_id: 'huge', title: 'Grande', mapping }])
  const preview = previewImport(IMPORT_ADAPTERS, [{ name: 'conversations.json', text }])
  expect(preview.accepted[0]?.externalId).toBe('chatgpt:huge')
  expect(preview.accepted[0]?.body.length).toBeGreaterThan(20_000)
  expect(preview.accepted[0]?.body).toContain('passo 0')
  expect(preview.accepted[0]?.body).toContain('FIM')
})

it('Claude.ai oficial: content[], anexos recusados, caracteres', () => {
  const text = readFileSync(join(official, 'claude-conversations.json'), 'utf8')
  const preview = previewImport(IMPORT_ADAPTERS, [{ name: 'conversations.json', text }])
  expect(preview.adapterId).toBe('claude')
  expect(preview.accepted[0]?.externalId).toBe('claude:claude-oficial-1')
  expect(preview.accepted[0]?.body).toContain('lilás')
  expect(preview.accepted[0]?.body).toContain('Registro no Cofre')
  expect(preview.accepted[0]?.body).toContain('日本語')
  expect(preview.rejected.filter(row => row.reason === 'ATTACHMENT')).toHaveLength(2)
})

it('Gemini oficial: conversation_id, model_messages, content[] e partes não-texto', () => {
  const text = readFileSync(join(official, 'gemini-conversations.json'), 'utf8')
  const preview = previewImport(IMPORT_ADAPTERS, [{ name: 'Takeout/Gemini/conversations.json', text }])
  expect(preview.adapterId).toBe('gemini')
  expect(preview.presumedSchema).toBe(true)
  expect(preview.accepted[0]?.externalId).toBe('gemini:gemini-oficial-1')
  expect(preview.accepted[0]?.body).toContain('São Paulo')
  expect(preview.accepted[0]?.body).toContain('brief do projeto')
  expect(preview.accepted[0]?.body).toContain('日本語')
  expect(preview.accepted[0]?.body).toContain('anexo ignorado')
  expect(preview.accepted[0]?.body).not.toContain('file-service://')
})

it('Grok oficial: conversation_id, content[] e campos extras', () => {
  const text = readFileSync(join(official, 'grok-conversations.json'), 'utf8')
  const preview = previewImport(IMPORT_ADAPTERS, [{ name: 'grok-conversations.json', text }])
  expect(preview.adapterId).toBe('grok')
  expect(preview.presumedSchema).toBe(true)
  expect(preview.accepted[0]?.externalId).toBe('grok:grok-oficial-1')
  expect(preview.accepted[0]?.body).toContain('São Paulo')
  expect(preview.accepted[0]?.body).toContain('Registro no Cofre')
  expect(preview.accepted[0]?.body).toContain('日本語')
})

it('Notion oficial: csv+md, colunas extras, caracteres e anexo', () => {
  const csv = readFileSync(join(official, 'notion/pages.csv'), 'utf8')
  const brief = readFileSync(join(official, 'notion/Brief do projeto.md'), 'utf8')
  const preview = previewImport(IMPORT_ADAPTERS, [
    { name: 'Notion/pages.csv', text: csv },
    { name: 'Notion/Brief do projeto.md', text: brief },
    { name: 'Notion/assets/diagrama.png', text: 'binary' },
  ])
  expect(preview.adapterId).toBe('notion')
  expect(preview.presumedSchema).toBe(true)
  expect(preview.accepted.some(row => row.body.includes('São Paulo'))).toBe(true)
  expect(preview.accepted.some(row => row.body.includes('日本語'))).toBe(true)
  expect(preview.accepted.every(row => row.externalId.startsWith('notion:'))).toBe(true)
  expect(preview.rejected.some(row => row.reason === 'ATTACHMENT' && row.externalId.includes('diagrama.png'))).toBe(true)
})

it('Obsidian oficial: frontmatter, wikilinks e anexo do vault', () => {
  const home = readFileSync(join(official, 'obsidian/Home.md'), 'utf8')
  const brief = readFileSync(join(official, 'obsidian/Brief do projeto.md'), 'utf8')
  const preview = previewImport(IMPORT_ADAPTERS, [
    { name: 'Home.md', text: home },
    { name: 'Brief do projeto.md', text: brief },
    { name: 'assets/diagrama.png', text: 'binary' },
  ])
  expect(preview.adapterId).toBe('markdown')
  expect(preview.accepted.map(row => row.kind)).toEqual(['memory', 'memory'])
  expect(preview.accepted.some(row => row.body.includes('Casa do vault'))).toBe(true)
  expect(preview.accepted.some(row => row.body.includes('brief'))).toBe(true)
  expect(preview.rejected.some(row => row.reason === 'ATTACHMENT' && row.externalId.includes('diagrama.png'))).toBe(true)
})

const realDir = process.env.PERSONA_REAL_IMPORTS ?? ''

function collectImportFiles(root: string, prefix = ''): { name: string; text: string }[] {
  const out: { name: string; text: string }[] = []
  for (const name of readdirSync(root)) {
    const path = join(root, name)
    const rel = prefix === '' ? name : `${prefix}/${name}`
    if (statSync(path).isDirectory()) {
      out.push(...collectImportFiles(path, rel))
      continue
    }
    if (!/\.(json|md|html|csv)$/iu.test(name)) continue
    out.push({ name: rel, text: readFileSync(path, 'utf8') })
  }
  return out
}

it('F1 oficial: 2º passe não duplica em ChatGPT, Claude, Gemini, Grok, Notion e Obsidian', () => {
  const packs: { name: string; files: { name: string; text: string }[] }[] = [
    { name: 'conversations.json', files: [{ name: 'conversations.json', text: readFileSync(join(official, 'chatgpt-conversations.json'), 'utf8') }] },
    { name: 'claude.json', files: [{ name: 'conversations.json', text: readFileSync(join(official, 'claude-conversations.json'), 'utf8') }] },
    { name: 'gemini.json', files: [{ name: 'Takeout/Gemini/conversations.json', text: readFileSync(join(official, 'gemini-conversations.json'), 'utf8') }] },
    { name: 'grok.json', files: [{ name: 'grok-conversations.json', text: readFileSync(join(official, 'grok-conversations.json'), 'utf8') }] },
    {
      name: 'notion',
      files: [
        { name: 'Notion/pages.csv', text: readFileSync(join(official, 'notion/pages.csv'), 'utf8') },
        { name: 'Notion/Brief do projeto.md', text: readFileSync(join(official, 'notion/Brief do projeto.md'), 'utf8') },
      ],
    },
    {
      name: 'obsidian',
      files: [
        { name: 'Home.md', text: readFileSync(join(official, 'obsidian/Home.md'), 'utf8') },
        { name: 'Brief do projeto.md', text: readFileSync(join(official, 'obsidian/Brief do projeto.md'), 'utf8') },
      ],
    },
  ]
  for (const pack of packs) {
    const store = new MemoryImportStore()
    const first = previewImport(IMPORT_ADAPTERS, pack.files, store)
    expect(first.accepted.length, pack.name).toBeGreaterThan(0)
    expect(applyImport(store, first, `${pack.name}-1`).applied).toHaveLength(first.accepted.length)
    const again = previewImport(IMPORT_ADAPTERS, pack.files, store)
    expect(again.counts?.duplicates, pack.name).toBe(first.accepted.length)
    expect(applyImport(store, again, `${pack.name}-2`).applied).toHaveLength(0)
  }
})

it('F1: mensagem com cara de segredo não entra (fixture oficial + api_key)', () => {
  const text = JSON.stringify([{
    conversation_id: 'secret-1',
    title: 'Chave',
    mapping: {
      n0: {
        id: 'n0',
        parent: null,
        children: [],
        message: { content: { content_type: 'text', parts: ['api_key=sk-test-not-real'] } },
      },
    },
  }])
  const preview = previewImport(IMPORT_ADAPTERS, [{ name: 'conversations.json', text }])
  expect(preview.accepted).toHaveLength(0)
  expect(preview.rejected.some(row => row.reason === 'SECRET')).toBe(true)
})

it.skipIf(realDir === '' || !existsSync(realDir))('F1 amostra real: preview aplica e o 2º passe não duplica', () => {
  const files = collectImportFiles(realDir)
  expect(files.length).toBeGreaterThan(0)
  const store = new MemoryImportStore()
  const first = previewImport(IMPORT_ADAPTERS, files, store)
  expect(first.accepted.length).toBeGreaterThan(0)
  expect(applyImport(store, first, 'real-1').applied).toHaveLength(first.accepted.length)
  const again = previewImport(IMPORT_ADAPTERS, files, store)
  expect(again.counts?.duplicates).toBe(first.accepted.length)
  expect(applyImport(store, again, 'real-2').applied).toHaveLength(0)
})
