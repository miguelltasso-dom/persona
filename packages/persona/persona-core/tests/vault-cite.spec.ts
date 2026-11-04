import { expect, it } from 'vitest'
import { compileContext, formatVaultCitation, toUsedDocumentCite } from '../src/index.ts'
import type { ContextRecord, ContextScope, VaultDocumentCite } from '../src/index.ts'

const cite: VaultDocumentCite = {
  id: 'chk-1',
  documentId: 'doc-contrato',
  title: 'Contrato.pdf',
  locator: 'seção Contratos',
  body: 'Clausula do contrato: prazo 30 dias.',
  restricted: false,
}

it('formats title + locator for Contexto usado', () => {
  expect(formatVaultCitation(cite)).toBe('Contrato.pdf · seção Contratos')
  expect(formatVaultCitation({ title: '  ', locator: '' })).toBe('Documento')
  expect(formatVaultCitation({ ...cite, restricted: true })).toBe('Contrato.pdf · seção Contratos (restrito)')
})

it('maps a search hit onto a document row with title/locator and hides restricted body', () => {
  expect(toUsedDocumentCite(cite)).toEqual({
    id: 'chk-1',
    kind: 'document',
    body: 'Clausula do contrato: prazo 30 dias.',
    required: false,
    restricted: false,
    title: 'Contrato.pdf',
    locator: 'seção Contratos',
  })
  expect(toUsedDocumentCite({ ...cite, restricted: true }).body).toBe('')
})

it('compileContext keeps title/locator on the payload and omits them when unset (v14 cache)', async () => {
  const scope: ContextScope = {
    workspaceId: 'ws',
    projectId: 'pp',
    agentId: 'nina',
    actorId: 'miguel',
    audienceId: 'ch',
    policyRevision: '1',
  }
  const cited: ContextRecord = {
    id: 'chk-1',
    workspaceId: 'ws',
    projectId: 'pp',
    revision: 1,
    kind: 'memory',
    status: 'active',
    body: 'Clausula do contrato: prazo 30 dias.',
    sourceIds: [],
    title: 'Contrato.pdf',
    locator: 'seção Contratos',
  }
  const plain: ContextRecord = {
    id: 'v-brief',
    workspaceId: 'ws',
    projectId: 'pp',
    revision: 1,
    kind: 'brief',
    status: 'active',
    body: 'Somos a Padaria Lua.',
    sourceIds: [],
  }
  const compiled = await compileContext({
    scope,
    snapshot: { revision: 's1', requiredIds: [], records: [cited, plain] },
    budgetTokens: 10_000,
    countTokens: (text: string) => text.length,
    authorize: async () => true,
  })
  const payload = JSON.parse(compiled.text) as {
    records: Array<{ id: string; title?: string; locator?: string }>
  }
  expect(payload.records.find(row => row.id === 'chk-1')).toMatchObject({
    title: 'Contrato.pdf',
    locator: 'seção Contratos',
  })
  expect(payload.records.find(row => row.id === 'v-brief')).not.toHaveProperty('title')
})
