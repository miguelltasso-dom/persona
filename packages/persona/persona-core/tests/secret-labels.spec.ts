import { expect, it } from 'vitest'
import { containsSecretValue, decideBringApply, looksLikeSecret, parseBringPaste, refuseSecrets, sensitiveWhy } from '../src/index.ts'

it.each([
  'Senha do banco: hunter2', 'senha=hunter2', 'SENHA DA CONTA = hunter2',
  'Senha para serviço: hunter2', 'Senha Wi-Fi: hunter2', 'senha: x',
  'senha: "hunter2"', "senha: 'hunter2'", '{"senha":"hunter2"}',
  '{"Senha do banco": "hunter2"}', 'Observação; senha do banco: hunter2',
  '{"senha":"", "senha do banco":"hunter2"}', '{"senha":null, "senha do banco":"hunter2"}',
  '**Senha do banco**: hunter2', '`senha`: hunter2', '{"se\\u006eha":"hunter2"}',
  'Dados: {"senha":"", "senha do banco":"hunter2"}',
  JSON.stringify({ payload: '{"se\\u006eha":"hunter2"}' }),
  'Dados: {"se\\u006eha":"hunter2"}', '```json\n{"se\\u006eha":"hunter2"}\n```',
])('classifies a Portuguese password label with a value: %s', (body) => {
  expect(looksLikeSecret(body)).toBe(true)
  expect(containsSecretValue(body)).toBe(true)
  expect(sensitiveWhy(body)).not.toBe('')
})

it.each([
  'Nunca enviar senha.', 'Nunca enviar senha para ninguém.', 'Peça a senha pelo canal seguro.',
  'Senha do banco:', 'senha =   ', 'senha:\nOutra regra segura.', 'senha do banco:\t\nNunca enviar senha.',
  'senha: ""', "senha: ''", '{"senha":"", "nota":"Nunca enviar senha."}',
  '{"nota":"Nunca enviar senha", "prazo":"sexta"}',
  'Regra de senha: nunca compartilhar credenciais.', '{"senha":null}',
])('preserves safe unassigned password guidance: %s', (body) => {
  expect(looksLikeSecret(body)).toBe(false)
  expect(containsSecretValue(body)).toBe(false)
})

it.each(['Nunca divulgar tokens.', 'Never send password.', 'Password policy: never share credentials.'])('keeps broad import classification separate from actual values: %s', (body) => {
  expect(looksLikeSecret(body)).toBe(true)
  expect(containsSecretValue(body)).toBe(false)
})

it.each(['api_key=abc123zzz', '{"password":"hunter2"}', 'token: short', 'chave da API: abc123zzz',
  'Never send password: hunter2', 'Nunca divulgar senha do banco: hunter2',
  'Regra de senha: nunca compartilhar credenciais; api_key=abc123zzz',
  'senha: Nunca-abc123', 'password=Never-abc123', '{"payload":{"access_token":"short"}}',
  'Regra de senha: hunter2', 'Password policy: hunter2', '{"password policy":"hunter2"}',
  'key: hunter2', '{"key":"hunter2"}',
  'Nunca divulgar tokens: synthetic-value', 'tokens: short', '{"chaves":["short"]}',
  'password=""hunter2', "senha=''hunter2",
])('does not exempt a real labelled value because it appears in a rule: %s', (body) => {
  expect(containsSecretValue(body)).toBe(true)
})

it('refuses the labelled secret without changing the safe rule or the source records', () => {
  const preview = { accepted: [{ externalId: 'secret', body: 'Senha do banco: hunter2' },
    { externalId: 'policy', body: 'Nunca enviar senha.' }], rejected: [] }
  const original = structuredClone(preview)
  const result = refuseSecrets(preview)
  expect(result.accepted).toEqual([{ externalId: 'policy', body: 'Nunca enviar senha.' }])
  expect(result.rejected).toEqual([{ externalId: 'secret', reason: 'SECRET' }])
  expect(preview).toEqual(original)
})

it('keeps an edit sensitive when a document number is replaced by a labelled password', () => {
  const preview = parseBringPaste({ text: '## Pessoas e contatos de trabalho\n- CPF 123.456.789-00.',
    provider: 'other', at: '2026-11-04T00:00:00.000Z' })
  const id = preview.proposals[0]!.id
  expect(decideBringApply(preview, [{ id, action: 'edit', body: 'Senha do banco: hunter2' }])).toEqual([])
  expect(decideBringApply(preview, [{ id, action: 'edit', body: 'Nunca enviar senha.' }])[0]?.body).toBe('Nunca enviar senha.')
})

it('detects a credential after empty fragments and preserves safe JSON collections', () => {
  expect(containsSecretValue(`password=${'""'.repeat(20_000)}hunter2`)).toBe(true)
  const records = Array.from({ length: 20_000 }, () => ({ note: 'Never send password.' }))
  expect(containsSecretValue(JSON.stringify(records))).toBe(false)
  expect(containsSecretValue(JSON.stringify([...records, { senha: 'hunter2' }]))).toBe(true)
})
