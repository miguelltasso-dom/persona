import { afterEach, expect, it } from 'vitest'
import {
  ProductRepos,
  StoreError,
  VaultDocError,
  VaultRepos,
  detectVaultKind,
  extractVaultDocument,
  openTempStore,
  sampleDocx,
  samplePdf,
  type TempStore,
} from '../src/index.ts'

const temps: TempStore[] = []
let tick = 0
const now = (): string => {
  tick += 1
  return `2026-11-03T17:00:${String(tick).padStart(2, '0')}.000Z`
}

afterEach(async () => {
  tick = 0
  await Promise.all(temps.splice(0).map(temp => temp.dispose()))
})

async function setup(): Promise<VaultRepos> {
  const handle = await openTempStore()
  temps.push(handle)
  const product = new ProductRepos(handle.store, now)
  product.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  return new VaultRepos(handle.store, now)
}

it('extracts MD, TXT, CSV, PDF and DOCX with locators', () => {
  expect(extractVaultDocument(Buffer.from('# Contratos\nNunca publicar sem aprovação.\n'), 'regras.md')).toEqual([
    { locator: 'seção Contratos', text: 'Nunca publicar sem aprovação.' },
  ])
  expect(extractVaultDocument(Buffer.from('tom de voz calmo'), 'nota.txt')[0]?.locator).toBe('seção 1')
  expect(extractVaultDocument(Buffer.from('produto,preco\npao,4\n'), 'tabela.csv')[0]?.locator).toMatch(/produto/)
  const pdf = extractVaultDocument(samplePdf(['Pagina um do Cofre', 'Pagina dois do Cofre']), 'manual.pdf')
  expect(pdf.map(item => item.locator)).toEqual(['página 1', 'página 2'])
  expect(pdf[0]?.text).toContain('Pagina um')
  const docx = extractVaultDocument(sampleDocx('Politica', ['Nunca enviar senha.']), 'politica.docx')
  expect(docx.some(item => item.locator === 'seção Politica')).toBe(true)
  expect(docx.some(item => item.text.includes('senha'))).toBe(true)
})

it('refuses empty, oversized and unknown formats with a pt-BR line', () => {
  expect(() => detectVaultKind(new Uint8Array(), 'x.txt')).toThrow(VaultDocError)
  try {
    detectVaultKind(Buffer.alloc(8 * 1024 * 1024 + 1, 0x61), 'big.txt')
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(VaultDocError)
    expect((error as VaultDocError).userMessage).toMatch(/8 MB/)
  }
  try {
    detectVaultKind(Buffer.from([0x4d, 0x5a]), 'x.exe')
    expect.fail('expected type-rejected')
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(VaultDocError)
    expect((error as VaultDocError).code).toBe('type-rejected')
    expect((error as VaultDocError).userMessage).toMatch(/PDF, DOCX, Markdown, TXT ou CSV/)
  }
})

it('ingests sample documents into chunks and FTS', async () => {
  const vault = await setup()
  const md = vault.ingestDocument({
    id: 'd-md', workspaceId: 'ws', projectId: 'pp', filename: 'regras.md',
    bytes: Buffer.from('# Contratos\nClausula unica do Cofre.\n'),
    authorId: 'ana', visibility: { kind: 'workspace' },
  })
  expect(md.filename).toBe('regras.md')
  expect(vault.listChunks('d-md')[0]?.locator).toBe('seção Contratos')
  expect(vault.searchChunks('pp', 'Clausula').map(item => item.documentId)).toEqual(['d-md'])

  vault.ingestDocument({
    id: 'd-pdf', workspaceId: 'ws', projectId: 'pp', filename: 'manual.pdf',
    bytes: samplePdf(['Texto raro da pagina']),
    authorId: 'ana', visibility: { kind: 'workspace' },
  })
  const hit = vault.searchChunks('pp', 'pagina')[0]
  expect(hit?.locator).toBe('página 1')
  expect(hit?.title).toBe('manual')

  vault.ingestDocument({
    id: 'd-docx', workspaceId: 'ws', projectId: 'pp', filename: 'guia.docx',
    bytes: sampleDocx('Onboarding', ['Passo um do Cofre.']),
    authorId: 'ana', visibility: { kind: 'workspace' },
  })
  expect(vault.searchChunks('pp', 'Passo').some(item => item.locator === 'seção Onboarding')).toBe(true)
})

it('reprocesses on replace and drops chunks on delete', async () => {
  const vault = await setup()
  vault.ingestDocument({
    id: 'd1', workspaceId: 'ws', projectId: 'pp', filename: 'a.txt',
    bytes: Buffer.from('palavra-antiga-unica'),
    authorId: 'ana', visibility: { kind: 'workspace' },
  })
  vault.replaceDocument('d1', 'b.txt', Buffer.from('palavra-nova-unica'), 'bia')
  expect(vault.searchChunks('pp', 'palavra-antiga-unica')).toEqual([])
  expect(vault.searchChunks('pp', 'palavra-nova-unica').map(item => item.documentId)).toEqual(['d1'])
  expect(vault.getDocument('d1')?.revision).toBe(2)
  vault.deleteDocument('d1')
  expect(vault.getDocument('d1')).toBeUndefined()
  expect(vault.listChunks('d1')).toEqual([])
  expect(vault.searchChunks('pp', 'palavra-nova-unica')).toEqual([])
})

it('keeps document visibility for ACL and refuses a missing replace', async () => {
  const vault = await setup()
  const doc = vault.ingestDocument({
    id: 'priv', workspaceId: 'ws', projectId: 'pp', filename: 'so-nina.txt',
    bytes: Buffer.from('segredo da nina'),
    authorId: 'ana', visibility: { kind: 'persona', personaId: 'nina' },
  })
  expect(doc.visibility).toEqual({ kind: 'persona', personaId: 'nina' })
  expect(() => { vault.replaceDocument('nope', 'x.txt', Buffer.from('x'), 'ana') }).toThrow(StoreError)
  expect(() => { vault.deleteDocument('nope') }).toThrow(StoreError)
})
