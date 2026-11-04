import { expect, it } from 'vitest'
import {
  consultPermission,
  consultPermissionPages,
  grantFromPermissionPage,
  markPermissionUsed,
  permissionPageFromGrant,
  rememberPermission,
  revokePermission,
} from '../src/index.ts'

const DAY = 86_400_000
const grantedAt = Date.parse('2026-11-03T12:00:00.000Z')

function grant(overrides: Partial<ReturnType<typeof rememberPermission>> = {}) {
  return rememberPermission({
    id: 'g1',
    grantorId: 'miguel',
    personaId: 'atlas',
    action: 'draft-reply',
    target: 'whatsapp:padaria',
    validity: 'until_revoked',
    now: grantedAt,
    ...overrides,
  })
}

it('skips the same persona + action + target and writes the audit line', () => {
  const hit = consultPermission(grant(), {
    personaId: 'atlas',
    action: 'draft-reply',
    target: 'whatsapp:padaria',
    now: grantedAt + 1000,
  })
  expect(hit).toEqual({
    kind: 'skip',
    grantId: 'g1',
    audit: 'não perguntei porque você permitiu em 03/11',
  })
})

it.each(['personaId', 'action', 'target'] as const)('never covers empty or wildcard %s, including persisted permission pages', (field) => {
  const valid = grant()
  for (const value of ['', '   ', '*', 'prefix:*']) {
    const invalid = { ...valid, [field]: value }
    expect(() => grant({ [field]: value })).toThrow('INVALID_BRAIN')
    const ask = { personaId: invalid.personaId, action: invalid.action, target: invalid.target, now: grantedAt }
    expect(consultPermission(invalid, ask)).toEqual({ kind: 'ask', why: 'escopo ambíguo' })
    expect(consultPermission(valid, ask)).toEqual({ kind: 'ask', why: 'escopo ambíguo' })
    const page = permissionPageFromGrant(invalid, 'ws', { kind: 'workspace' })
    expect(grantFromPermissionPage(page)).toBeUndefined()
  }
})

it('never expands a broader action (adversarial)', () => {
  const hit = consultPermission(grant(), {
    personaId: 'atlas',
    action: 'send-reply',
    target: 'whatsapp:padaria',
    now: grantedAt + 1000,
  })
  expect(hit).toEqual({ kind: 'ask', why: 'ação diferente ou mais ampla' })
})

it('asks again for another target (adversarial)', () => {
  const hit = consultPermission(grant(), {
    personaId: 'atlas',
    action: 'draft-reply',
    target: 'whatsapp:outro-cliente',
    now: grantedAt + 1000,
  })
  expect(hit).toEqual({ kind: 'ask', why: 'outro alvo' })
})

it('does not transfer a grant to another persona (adversarial)', () => {
  const hit = consultPermission(grant(), {
    personaId: 'bento',
    action: 'draft-reply',
    target: 'whatsapp:padaria',
    now: grantedAt + 1000,
  })
  expect(hit).toEqual({ kind: 'ask', why: 'outra persona' })
})

it('asks again after the 7-day window (adversarial, fake clock)', () => {
  const week = grant({ validity: 'days7' })
  expect(week.expiresAt).toBe(grantedAt + 7 * DAY)
  const inside = consultPermission(week, {
    personaId: 'atlas',
    action: 'draft-reply',
    target: 'whatsapp:padaria',
    now: grantedAt + 6 * DAY,
  })
  expect(inside.kind).toBe('skip')
  const expired = consultPermission(week, {
    personaId: 'atlas',
    action: 'draft-reply',
    target: 'whatsapp:padaria',
    now: grantedAt + 7 * DAY,
  })
  expect(expired).toEqual({ kind: 'ask', why: 'expirada' })
})

it('revoke is immediate: the next identical action asks again (adversarial)', () => {
  const closed = revokePermission(grant())
  const hit = consultPermission(closed, {
    personaId: 'atlas',
    action: 'draft-reply',
    target: 'whatsapp:padaria',
    now: grantedAt + 1000,
  })
  expect(hit).toEqual({ kind: 'ask', why: 'revogada' })
})

it('treats omitted action or target as uncovered (adversarial)', () => {
  expect(() => rememberPermission({
    id: 'g2',
    grantorId: 'miguel',
    personaId: 'atlas',
    action: '',
    target: 'whatsapp:padaria',
    validity: 'until_revoked',
    now: grantedAt,
  })).toThrow('INVALID_BRAIN')
  const page = permissionPageFromGrant(grant(), 'ws', { kind: 'workspace' })
  const ambiguous = {
    ...page,
    properties: { ...page.properties, action: '', target: '' },
  }
  expect(grantFromPermissionPage(ambiguous)).toBeUndefined()
  expect(consultPermissionPages([ambiguous], {
    personaId: 'atlas',
    action: 'draft-reply',
    target: 'whatsapp:padaria',
    now: grantedAt + 1000,
  })).toEqual({ kind: 'ask', why: 'sem permissão lembrada' })
})

it('once grants spend after a single skip', () => {
  const once = grant({ validity: 'once' })
  expect(once.maxUses).toBe(1)
  const first = consultPermission(once, {
    personaId: 'atlas',
    action: 'draft-reply',
    target: 'whatsapp:padaria',
    now: grantedAt + 1,
  })
  expect(first.kind).toBe('skip')
  const spent = markPermissionUsed(once)
  expect(consultPermission(spent, {
    personaId: 'atlas',
    action: 'draft-reply',
    target: 'whatsapp:padaria',
    now: grantedAt + 2,
  })).toEqual({ kind: 'ask', why: 'já usada uma vez' })
})

it('reads the covering grant from a Permissão concedida page', () => {
  const stored = permissionPageFromGrant(grant(), 'ws', { kind: 'workspace' })
  expect(stored.kind).toBe('permission')
  const hit = consultPermissionPages([stored], {
    personaId: 'atlas',
    action: 'draft-reply',
    target: 'whatsapp:padaria',
    now: grantedAt + 1000,
  })
  expect(hit.kind).toBe('skip')
  expect(hit.kind === 'skip' && hit.audit).toContain('03/11')
})
