import { expect, it } from 'vitest'
import {
  DomainError,
  HANDOFF_MAX_COUNT,
  HANDOFF_MAX_DEPTH,
  assertHandoffAllowed,
  claimHandoff,
  resolveHandoffRef,
} from '../src/index.ts'
import type { HandoffObject } from '../src/index.ts'

function handoff(overrides: Partial<HandoffObject> = {}): HandoffObject {
  return {
    id: 'h1',
    ticketId: 't1',
    objective: 'Ship',
    decisionIds: ['d1'],
    evidence: [{ id: 'e1', summary: 'diff' }],
    nextAction: 'review',
    fromPersonaId: 'bento',
    toPersonaId: 'nina',
    depth: 1,
    ...overrides,
  }
}

it('rejects a cycle, an over-deep chain and a full budget of handoffs', () => {
  expect(() => assertHandoffAllowed([handoff()], handoff({ id: 'h2', fromPersonaId: 'nina', toPersonaId: 'bento' })))
    .toThrow(DomainError)
  expect(() => assertHandoffAllowed([], handoff({ depth: HANDOFF_MAX_DEPTH + 1 }))).toThrow('ACCESS_ESCALATION')
  const full = Array.from({ length: HANDOFF_MAX_COUNT }, (_, i) => handoff({
    id: `h${String(i)}`, fromPersonaId: `p${String(i)}`, toPersonaId: `p${String(i + 1)}`,
  }))
  expect(() => assertHandoffAllowed(full, handoff({ id: 'h-new', fromPersonaId: 'px', toPersonaId: 'py' }))).toThrow('ACCESS_ESCALATION')
})

it('lets the first claimant keep the object', () => {
  const first = claimHandoff(handoff(), 'nina')
  expect(first.claimedBy).toBe('nina')
  expect(claimHandoff(first, 'nina').claimedBy).toBe('nina')
  expect(() => claimHandoff(first, 'sol')).toThrow('ACCESS_ESCALATION')
})

it('hides a reference until the reader is authorized', () => {
  const item = claimHandoff(handoff(), 'nina')
  expect(resolveHandoffRef(item, 'nina', false)).toBeUndefined()
  expect(resolveHandoffRef(item, 'outsider', true)).toBeUndefined()
  expect(resolveHandoffRef(item, 'nina', true)?.id).toBe('h1')
  expect(resolveHandoffRef(item, 'bento', true)?.id).toBe('h1')
})
