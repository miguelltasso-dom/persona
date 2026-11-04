import { expect, it } from 'vitest'
import { safeUsedContext } from '../src/used-context-safety.ts'

it.each([
  'Nunca divulgar tokens.',
  'Never send password to another person.',
  'API keys must stay in the encrypted vault.',
  'Senha do banco:\nNunca enviar senha para ninguém.',
  'A política explica como revogar um token.',
])('keeps safe guidance in required context: %s', (body) => {
  const row = { id: 'safe-rule', kind: 'constraint', body, required: true, restricted: false }
  expect(safeUsedContext([row])).toEqual([row])
})

it.each(['body', 'title', 'locator'] as const)('omits a labelled secret in %s without changing the source', (field) => {
  const value = ['synthetic', 'credential'].join('-')
  const row = { id: 'context-row', kind: 'memory', body: 'Safe business note.', title: 'Document',
    locator: 'Section', required: false, restricted: false, [field]: `api_key=${value}` }
  const snapshot = { ...row }
  expect(safeUsedContext([row])).toEqual([{ ...row, body: '', title: '', locator: '', restricted: true }])
  expect(row).toEqual(snapshot)
})

it.each([
  'Never send password: synthetic-value',
  'Nunca divulgar tokens: synthetic-value',
  '{"senha da conta":"synthetic-value"}',
])('does not treat guidance wording as permission to include an assigned value: %s', (body) => {
  const row = { id: 'unsafe-rule', kind: 'constraint', body, required: true, restricted: false }
  expect(safeUsedContext([row])).toEqual([{ ...row, body: '', restricted: true }])
})
