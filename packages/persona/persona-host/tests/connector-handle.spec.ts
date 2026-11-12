import { expect, it } from 'vitest'
import { auditBodyForReader, connectorHandleOf, eventIdForReader, grantLineIdOf } from '../src/connector-handle.ts'

/** CONN-1/CONN-3 (Lumen): what a reader gets instead of the proxy URL of an account connector (it carries the key). One definition of the handle for every reader. */
const KEY = '0f'.repeat(24)
const URL_ID = `https://proxy.example.test/v1/mcp/${KEY}`
const AT = '2026-11-12T12:00:00.000Z'

it('a URL id becomes a stable handle with no key in it; a name is not a secret and stays', () => {
  const handle = connectorHandleOf(URL_ID)
  expect(handle).toMatch(/^account:[0-9a-f]{12}$/u)
  expect(handle).not.toContain(KEY)
  expect(connectorHandleOf(URL_ID)).toBe(handle) // stable: the same connector is always the same handle
  expect(connectorHandleOf(`${URL_ID}x`)).not.toBe(handle)
  expect(connectorHandleOf('notes-mcp')).toBe('notes-mcp')
})

it('the id of the "you gave her permission" line is stable (written once) and never carries the connector id', () => {
  const id = grantLineIdOf('p1', 'claude', URL_ID, AT)
  expect(id).toBe(`connector-grant:p1:claude:${connectorHandleOf(URL_ID)}:${AT}`)
  expect(id).not.toContain(KEY)
  expect(grantLineIdOf('p1', 'claude', URL_ID, AT)).toBe(id)
  expect(grantLineIdOf('p1', 'claude', 'notes-mcp', AT)).toBe(`connector-grant:p1:claude:notes-mcp:${AT}`)
})

it('a line written BEFORE the handle (its id holds the URL) is read with the handle in its place — and the new id is already the same thing', () => {
  const old = `connector-grant:p1:claude:${URL_ID}:${AT}`
  expect(eventIdForReader(old)).toBe(grantLineIdOf('p1', 'claude', URL_ID, AT))
  expect(eventIdForReader(old)).not.toContain(KEY)
  expect(eventIdForReader(grantLineIdOf('p1', 'claude', URL_ID, AT))).toBe(grantLineIdOf('p1', 'claude', URL_ID, AT))
  expect(eventIdForReader('u1')).toBe('u1') // any other id is untouched
})

it('the audit body: only the connectorId of a connector.* line is made safe; other actions and local ids are untouched', () => {
  const body = JSON.stringify({ personaId: 'p1', cli: 'claude', connectorId: URL_ID, name: 'Gmail' })
  expect(auditBodyForReader('connector.grant', body)).not.toContain(KEY)
  expect(auditBodyForReader('connector.grant', body)).toContain(connectorHandleOf(URL_ID))
  expect(auditBodyForReader('skill.import', body)).toBe(body)
  expect(auditBodyForReader('connector.grant', JSON.stringify({ connectorId: 'notes-mcp' }))).toBe(JSON.stringify({ connectorId: 'notes-mcp' }))
})
