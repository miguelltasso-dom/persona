import { expect } from 'vitest'
import { runErrorFromBody } from '../src/run-error-wire.ts'
import { it } from './host-harness.ts'

it('parses a run-error marker into a typed payload', () => {
  expect(runErrorFromBody('[[run-error:{"code":"not_logged_in","provider":"Claude","persona":"Guia","command":"claude login"}]]'))
    .toEqual({
      code: 'not_logged_in',
      provider: 'Claude',
      persona: 'Guia',
      command: 'claude login',
    })
})

it('keeps otherAccount only when true and ignores unknown codes', () => {
  expect(runErrorFromBody('hello\n\n[[run-error:{"code":"quota_exhausted","provider":"Codex","otherAccount":true}]]'))
    .toEqual({ code: 'quota_exhausted', provider: 'Codex', otherAccount: true })
  expect(runErrorFromBody('[[run-error:{"code":"nope"}]]')).toBeUndefined()
  expect(runErrorFromBody('[[run-error:not-json]]')).toBeUndefined()
  expect(runErrorFromBody('[[run-error:null]]')).toBeUndefined()
  expect(runErrorFromBody('[[run-error:1]]')).toBeUndefined()
  expect(runErrorFromBody('[[run-error:{"code":"app_offline","otherAccount":false}]]'))
    .toEqual({ code: 'app_offline' })
  expect(runErrorFromBody('plain')).toBeUndefined()
  expect(runErrorFromBody('[[run-error:]]')).toBeUndefined()
})
