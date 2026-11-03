import { expect } from 'vitest'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()

it('a failing effect becomes Precisa de você and recovers on retry', () => {
  const h = host()
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  const scope = { workspaceId: 'ws', projectId: 'pp' }
  let boom = true
  const send = (): void => { if (boom) throw new Error('Não consegui enviar a resposta.') }
  expect(h.deadLetters.attempt('pp', 'fx-1', 'Não consegui enviar a resposta.', send)).toBe('retrying')
  expect(h.deadLetters.attempt('pp', 'fx-1', 'Não consegui enviar a resposta.', send)).toBe('retrying')
  expect(h.listDeadLetters(scope)).toEqual([])
  expect(h.deadLetters.attempt('pp', 'fx-1', 'Não consegui enviar a resposta.', send)).toBe('dead')
  const letters = h.listDeadLetters(scope)
  expect(letters[0]?.attempts).toBe(3)
  expect(letters[0]?.actionRetry).toBe('Tentar de novo')
  expect(letters[0]?.actionDiscard).toBe('Descartar')
  expect(h.getOverview(scope).needsYou.some(item => item.id === 'fx-1')).toBe(true)
  boom = false
  expect(h.retryDeadLetter({ ...scope, id: 'fx-1' })).toBe(true)
  expect(h.deadLetters.attempt('pp', 'fx-1', 'Não consegui enviar a resposta.', send)).toBe('ok')
  expect(h.listDeadLetters(scope)).toEqual([])
  expect(h.getOverview(scope).needsYou).toEqual([])
  h.deadLetters.record('pp', 'fx-2', 'Falha no outbox.')
  h.deadLetters.record('pp', 'fx-2', 'Falha no outbox.')
  h.deadLetters.record('pp', 'fx-2', 'Falha no outbox.')
  expect(h.discardDeadLetter({ ...scope, id: 'fx-2' })).toBe(true)
  expect(h.listDeadLetters(scope)).toEqual([])
})
