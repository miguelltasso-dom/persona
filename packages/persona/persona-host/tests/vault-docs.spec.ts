import { expect } from 'vitest'
import { sampleDocx, samplePdf } from '@deepseek-ai/dsh-persona-store'
import { VaultDocsHost } from '../src/vault-docs.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()
const scope = { workspaceId: 'ws', projectId: 'pp' } as const

function seed() {
  const h = host()
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({
    id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner',
  })
  h.createMember({
    id: 'cia', workspaceId: 'ws', projectId: 'pp', displayName: 'Cia', handle: 'cia', role: 'guest',
  })
  return h
}

function docsOf(h: ReturnType<typeof host>, memberId = 'ana') {
  return new VaultDocsHost(h.product, h.vault, (workspaceId) => {
    const member = h.product.listMembers(workspaceId).find(item => item.id === memberId)
    if (member === undefined) return undefined
    return {
      kind: 'user',
      id: member.id,
      workspaceId,
      workspaceRole: member.role,
      projectIds: ['pp'],
    }
  })
}

it('ingests PDF, DOCX, MD, TXT and CSV, cites locator, and reprocesses on replace', () => {
  const h = seed()
  const docs = docsOf(h)
  const md = docs.ingest({
    ...scope, id: 'd-md', name: 'regras.md',
    bytesBase64: Buffer.from('# Contratos\nClausula unica do Cofre.\n').toString('base64'),
  }, 'ana')
  expect(md.chunks).toBeGreaterThan(0)
  expect(docs.search({ ...scope, query: 'Clausula' })[0]?.locator).toBe('seção Contratos')

  docs.ingest({
    ...scope, id: 'd-txt', name: 'nota.txt',
    bytesBase64: Buffer.from('tom de voz calmo').toString('base64'),
  }, 'ana')
  docs.ingest({
    ...scope, id: 'd-csv', name: 'precos.csv',
    bytesBase64: Buffer.from('produto,preco\npao,4\n').toString('base64'),
  }, 'ana')
  docs.ingest({
    ...scope, id: 'd-pdf', name: 'manual.pdf',
    bytesBase64: Buffer.from(samplePdf(['Texto raro da pagina'])).toString('base64'),
  }, 'ana')
  expect(docs.search({ ...scope, query: 'pagina' })[0]?.locator).toBe('página 1')
  docs.ingest({
    ...scope, id: 'd-docx', name: 'guia.docx',
    bytesBase64: Buffer.from(sampleDocx('Onboarding', ['Passo um do Cofre.'])).toString('base64'),
  }, 'ana')
  expect(docs.search({ ...scope, query: 'Passo' })[0]?.locator).toBe('seção Onboarding')

  const cited = docs.citeUsed('ws', 'pp', 'Clausula')
  expect(cited[0]?.title).toBe('regras')
  expect(cited[0]?.locator).toBe('seção Contratos')
  expect(cited[0]?.kind).toBe('document')

  docs.replace({
    ...scope, documentId: 'd-md', name: 'regras.md',
    bytesBase64: Buffer.from('# Contratos\nTexto novo do Cofre.\n').toString('base64'),
  }, 'ana')
  expect(docs.search({ ...scope, query: 'Clausula' })).toEqual([])
  expect(docs.search({ ...scope, query: 'novo' })[0]?.documentId).toBe('d-md')
  expect(docs.delete('ws', 'pp', 'd-md')).toBe(true)
  expect(docs.search({ ...scope, query: 'novo' })).toEqual([])
  expect(docs.list('ws', 'pp').map(item => item.id)).not.toContain('d-md')
})

it('refuses oversized and unknown files with a clear pt-BR line', () => {
  const h = seed()
  const docs = docsOf(h)
  expect(() => docs.ingest({
    ...scope, id: 'big', name: 'big.txt',
    bytesBase64: Buffer.alloc(8 * 1024 * 1024 + 1, 0x61).toString('base64'),
  }, 'ana')).toThrow(/8 MB/)
  expect(() => docs.ingest({
    ...scope, id: 'exe', name: 'x.exe',
    bytesBase64: Buffer.from([0x4d, 0x5a, 0x00]).toString('base64'),
  }, 'ana')).toThrow(/PDF, DOCX, Markdown, TXT ou CSV/)
})

it('host remotes ingest and cite document+locator in Contexto usado', async () => {
  const h = seed()
  h.createPersona({
    workspaceId: 'ws', projectId: 'pp', id: 'coord', name: 'Guia', title: 'Coordenação',
    description: 'Triagem.', personality: 'Calma.', instructions: 'Aceite pedidos claros.',
    avatarKind: 'gallery', avatarRef: 'guia', runnerKind: 'dsh', runnerCli: '',
    runnerModel: 'm', canRecruit: true, createdBy: 'ana',
  })
  h.createChannel({ id: 'geral', workspaceId: 'ws', projectId: 'pp', name: 'geral', topic: '' })
  h.ingestVaultDocument({
    ...scope, id: 'd-ctx', name: 'regras.md',
    bytesBase64: Buffer.from('# Contratos\nClausula unica do Cofre.\n').toString('base64'),
  })
  h.postMessage({
    id: 'm-cofre', ...scope, streamKind: 'channel', ownerId: 'geral',
    body: 'Clausula do contrato', actorId: 'ana', subjectId: 't',
    occurredAt: '2026-11-03T21:00:00.000Z',
  })
  await h.orchestration.flush(scope.projectId)
  const used = h.listUsedContext({ ...scope, eventId: 'm-cofre' })
  const doc = used.records.find(item => item.kind === 'document')
  expect(doc?.title).toBe('regras')
  expect(doc?.locator).toBe('seção Contratos')
  expect(h.searchVaultDocuments({ ...scope, query: 'Clausula' })[0]?.locator).toBe('seção Contratos')
})

it('hides persona-visible documents from another member', () => {
  const h = seed()
  const owner = docsOf(h, 'ana')
  owner.ingest({
    ...scope, id: 'priv', name: 'nina.txt',
    bytesBase64: Buffer.from('segredo da nina').toString('base64'),
    visibility: 'persona', personaId: 'nina',
  }, 'ana')
  expect(docsOf(h, 'cia').search({ ...scope, query: 'segredo' })).toEqual([])
  expect(docsOf(h, 'cia').list('ws', 'pp').map(item => item.id)).not.toContain('priv')
  expect(owner.search({ ...scope, query: 'segredo' })).toEqual([])
  expect(owner.list('ws', 'pp').map(item => item.id)).not.toContain('priv')
})
