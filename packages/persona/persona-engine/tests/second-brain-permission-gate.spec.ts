import { expect, it } from 'vitest'
import {
  gateRememberedPermission,
  gateRememberedPermissionPages,
  rememberApprovalPermission,
  revokeRememberedPermission,
  spendRememberedPermission,
} from '../src/index.ts'
import { permissionPageFromGrant } from '@deepseek-ai/dsh-persona-core'

const grantedAt = Date.parse('2026-11-03T12:00:00.000Z')
const DAY = 86_400_000

function grant() {
  return rememberApprovalPermission({
    id: 'g1',
    grantorId: 'miguel',
    personaId: 'atlas',
    action: 'draft-reply',
    target: 'whatsapp:padaria',
    validity: 'until_revoked',
    now: grantedAt,
  })
}

const same = {
  personaId: 'atlas',
  action: 'draft-reply',
  target: 'whatsapp:padaria',
  now: grantedAt + 60_000,
}

it('exact scope/limits/persona/validity → allow + audit', () => {
  const hit = gateRememberedPermission([grant()], same)
  expect(hit).toEqual({
    kind: 'skip',
    grantId: 'g1',
    audit: 'não perguntei porque você permitiu em 03/11',
  })
})

it('broader action asks again and never expands (adversarial)', () => {
  expect(gateRememberedPermission([grant()], { ...same, action: 'send-reply' }))
    .toEqual({ kind: 'ask', why: 'ação diferente ou mais ampla' })
})

it('other target asks again (adversarial)', () => {
  expect(gateRememberedPermission([grant()], { ...same, target: 'email:cliente' }))
    .toEqual({ kind: 'ask', why: 'outro alvo' })
})

it('persona A grant never skips persona B (adversarial)', () => {
  expect(gateRememberedPermission([grant()], { ...same, personaId: 'bento' }))
    .toEqual({ kind: 'ask', why: 'outra persona' })
})

it('expired 7-day grant asks again (adversarial, fake clock)', () => {
  const week = rememberApprovalPermission({
    id: 'g7',
    grantorId: 'miguel',
    personaId: 'atlas',
    action: 'draft-reply',
    target: 'whatsapp:padaria',
    validity: 'days7',
    now: grantedAt,
  })
  expect(gateRememberedPermission([week], { ...same, now: grantedAt + 7 * DAY }))
    .toEqual({ kind: 'ask', why: 'expirada' })
})

it('revoke ignores the grant immediately, no stale skip (adversarial)', () => {
  const closed = revokeRememberedPermission(grant())
  expect(gateRememberedPermission([closed], same)).toEqual({ kind: 'ask', why: 'revogada' })
})

it('ambiguous permission page is uncovered and asks (adversarial)', () => {
  const page = permissionPageFromGrant(grant(), 'ws', { kind: 'workspace' })
  const broken = { ...page, properties: { ...page.properties, action: '' } }
  expect(gateRememberedPermissionPages([broken], same))
    .toEqual({ kind: 'ask', why: 'sem permissão lembrada' })
})

it('once grant spends after the skip', () => {
  const once = rememberApprovalPermission({
    id: 'g-once',
    grantorId: 'miguel',
    personaId: 'atlas',
    action: 'draft-reply',
    target: 'whatsapp:padaria',
    validity: 'once',
    now: grantedAt,
  })
  expect(gateRememberedPermission([once], same).kind).toBe('skip')
  const spent = spendRememberedPermission(once)
  expect(gateRememberedPermission([spent], same)).toEqual({ kind: 'ask', why: 'já usada uma vez' })
})
