/**
 * HT-8/HT-9 (D-084): what kind of action a tool is (strictest of annotation and name wins, unknown fails closed), and the two ways
 * of looking at a call's arguments: the canonical hash that approval is checked against, and the bounded, masked preview.
 */
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { classifyTool } from '../src/resolve/tool-action.ts'
import { INPUT_MAX_FIELDS, INPUT_MAX_STRING_BYTES, INPUT_MAX_TOTAL_BYTES, MASKED, argsHash, boundedInput, canonicalJson } from '../src/resolve/tool-input.ts'

describe('classifyTool: class and verb, strictest of annotation and name', () => {
  it('reads the verb of the TOOL (not the server) from camelCase, snake_case and mcp__server__tool names', () => {
    expect(classifyTool('mcp__gmail__send_message')).toEqual({ actionClass: 'send', verb: 'send' })
    expect(classifyTool('mcp__x__publishPost')).toEqual({ actionClass: 'send', verb: 'publish' })
    expect(classifyTool('mcp__bank__create-payment')).toEqual({ actionClass: 'pay', verb: 'payment' })
    expect(classifyTool('mcp__drive__trash_file')).toEqual({ actionClass: 'delete', verb: 'trash' })
    expect(classifyTool('mcp__cal__update_event')).toEqual({ actionClass: 'change', verb: 'update' })
  })

  it('the SERVER part never counts: a server called "delete_tools" with a read-only tool is not a delete', () => {
    expect(classifyTool('mcp__delete_tools__x', { readOnlyHint: true })).toEqual({ actionClass: 'read', verb: 'read' })
  })

  it('the strictest class among several verbs wins: delete > pay > send > change', () => {
    expect(classifyTool('mcp__m__send_and_delete').actionClass).toBe('delete')
    expect(classifyTool('mcp__m__create_and_send').actionClass).toBe('send')
    expect(classifyTool('mcp__m__charge_and_send_receipt').actionClass).toBe('pay')
  })

  it('a readOnly annotation proves a read, but a server that LIES about it on a destructive name is still the destructive class', () => {
    expect(classifyTool('mcp__m__list_threads', { readOnlyHint: true })).toEqual({ actionClass: 'read', verb: 'list' })
    expect(classifyTool('mcp__m__delete_message', { readOnlyHint: true }).actionClass).toBe('delete')
    expect(classifyTool('mcp__m__send_email', { readOnlyHint: true }).actionClass).toBe('send')
    expect(classifyTool('mcp__m__pay_invoice', { readOnlyHint: true }).actionClass).toBe('pay')
  })

  it('a destructive annotation makes it delete whatever the name says', () => {
    expect(classifyTool('mcp__m__sync', { destructiveHint: true })).toEqual({ actionClass: 'delete', verb: 'delete' })
  })

  it('FAILS CLOSED: no annotation and no recognised verb is an action that leaves (send); a harmless-looking name is not trusted', () => {
    expect(classifyTool('mcp__m__do_thing')).toEqual({ actionClass: 'send', verb: 'send' })
    expect(classifyTool('mcp__m__get_inbox')).toEqual({ actionClass: 'send', verb: 'send' })
    expect(classifyTool('mcp__m__get_inbox', { readOnlyHint: false })).toEqual({ actionClass: 'send', verb: 'send' })
    expect(classifyTool('mcp__m__get_inbox', {})).toEqual({ actionClass: 'send', verb: 'send' })
  })

  it('pay and delete are classes of their own, never read or change', () => {
    for (const name of ['mcp__m__refund', 'mcp__m__transfer_funds', 'mcp__m__purchase']) expect(classifyTool(name).actionClass).toBe('pay')
    for (const name of ['mcp__m__remove_member', 'mcp__m__purge', 'mcp__m__erase_history']) expect(classifyTool(name).actionClass).toBe('delete')
  })
})


describe('argsHash: SHA-256 of the canonical JSON of the REAL arguments', () => {
  it('does not depend on key order at any depth, nor on undefined fields', () => {
    const a = { to: 'ana@x.com', body: 'oi', meta: { b: 1, a: [1, 2, { z: true, y: null }] } }
    const b = { meta: { a: [1, 2, { y: null, z: true }], b: 1 }, body: 'oi', ignored: undefined, to: 'ana@x.com' }
    expect(argsHash(a)).toBe(argsHash(b))
    expect(canonicalJson(a)).toBe('{"body":"oi","meta":{"a":[1,2,{"y":null,"z":true}],"b":1},"to":"ana@x.com"}')
  })

  it('is the documented hash: lowercase hex SHA-256 of the UTF-8 canonical text', () => {
    const input = { to: 'ana@x.com', subject: 'olá ✓' }
    expect(argsHash(input)).toBe(createHash('sha256').update('{"subject":"olá ✓","to":"ana@x.com"}', 'utf8').digest('hex'))
    expect(argsHash(input)).toMatch(/^[0-9a-f]{64}$/u)
  })

  it('"I approved A, it sent B": any change of any value, key, array order or type changes the hash', () => {
    const approved = argsHash({ to: 'ana@x.com', body: 'oi' })
    expect(argsHash({ to: 'ana@x.com', body: 'oi!' })).not.toBe(approved)
    expect(argsHash({ to: 'bia@x.com', body: 'oi' })).not.toBe(approved)
    expect(argsHash({ to: 'ana@x.com', body: 'oi', cc: 'x' })).not.toBe(approved)
    expect(argsHash({ list: [1, 2] })).not.toBe(argsHash({ list: [2, 1] }))
    expect(argsHash({ n: 1 })).not.toBe(argsHash({ n: '1' }))
  })

  it('treats -0 as 0, keeps array order and writes non-finite numbers as null', () => {
    expect(argsHash({ n: -0 })).toBe(argsHash({ n: 0 }))
    expect(canonicalJson({ n: Number.NaN, a: [undefined, 1] })).toBe('{"a":[null,1],"n":null}')
  })

  it('hashes the WHOLE input, not the preview: two inputs equal in their first 4 KiB but different after still differ', () => {
    const head = 'x'.repeat(INPUT_MAX_STRING_BYTES + 10)
    expect(argsHash({ body: `${head}A` })).not.toBe(argsHash({ body: `${head}B` }))
    expect(boundedInput({ body: `${head}A` }).fields.body).toBe(boundedInput({ body: `${head}B` }).fields.body)
  })
})

describe('boundedInput: the preview is flat, small and carries no secret', () => {
  it('flattens nested objects and arrays into paths', () => {
    const view = boundedInput({ to: 'ana@x.com', cc: ['a@x.com', 'b@x.com'], meta: { urgent: true, n: 3, none: null } })
    expect(view.fields).toEqual({ to: 'ana@x.com', 'cc[0]': 'a@x.com', 'cc[1]': 'b@x.com', 'meta.urgent': true, 'meta.n': 3, 'meta.none': null })
    expect(view.truncated).toBe(false)
    expect(view.masked).toBe(false)
  })

  it('keeps at most 20 fields and says it left some out', () => {
    const many = Object.fromEntries(Array.from({ length: 30 }, (_, index) => [`f${String(index)}`, index]))
    const view = boundedInput(many)
    expect(Object.keys(view.fields)).toHaveLength(INPUT_MAX_FIELDS)
    expect(view.truncated).toBe(true)
  })

  it('cuts a long string at 4 KiB on a character boundary, with an ellipsis, and says it did', () => {
    const view = boundedInput({ body: 'ç'.repeat(5000) })
    const text = String(view.fields.body)
    expect(Buffer.byteLength(text, 'utf8')).toBeLessThanOrEqual(INPUT_MAX_STRING_BYTES)
    expect(text.endsWith('…')).toBe(true)
    expect(text).not.toContain('�')
    expect(view.truncated).toBe(true)
  })

  it('keeps the total under 16 KiB', () => {
    const view = boundedInput(Object.fromEntries(Array.from({ length: 10 }, (_, index) => [`p${String(index)}`, 'a'.repeat(3000)])))
    const bytes = Object.values(view.fields).reduce<number>((total, value) => total + Buffer.byteLength(String(value), 'utf8'), 0)
    expect(bytes).toBeLessThanOrEqual(INPUT_MAX_TOTAL_BYTES)
    expect(view.truncated).toBe(true)
  })

  it('masks a field NAMED like a credential and a value SHAPED like one, wherever it sits, and says it did', () => {
    const view = boundedInput({
      to: 'ana@x.com',
      apiKey: 'qualquer-coisa',
      headers: { Authorization: 'Bearer abcdefghijklmnop1234' },
      note: 'use sk-abcdefghijklmnopqrstuv para entrar',
      token: 42,
    })
    expect(view.fields.to).toBe('ana@x.com')
    expect(view.fields.apiKey).toBe(MASKED)
    expect(view.fields['headers.Authorization']).toBe(MASKED)
    expect(view.fields.note).toBe(MASKED)
    expect(view.fields.token).toBe(MASKED)
    expect(view.masked).toBe(true)
    expect(JSON.stringify(view)).not.toMatch(/sk-abcdef|abcdefghijklmnop1234|qualquer-coisa/u)
  })

  it('also masks what the host\'s own detector flags', () => {
    const view = boundedInput({ text: 'segredo-interno-123' }, { isSecret: value => value.includes('segredo-interno') })
    expect(view.fields.text).toBe(MASKED)
    expect(view.masked).toBe(true)
  })

  it('a scalar or empty input still gives a field the card can show', () => {
    expect(boundedInput('só texto').fields).toEqual({ value: 'só texto' })
    expect(boundedInput({}).fields).toEqual({ value: '{}' })
  })
})
