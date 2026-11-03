import { expect, it } from 'vitest'
import { admitTrigger } from '../../src/index.ts'
import { owner } from './helpers.ts'

it('retry de rotina: o mesmo trigger admite o mesmo resultado (idempotente)', () => {
  const coordinator = { ...owner, systemRoles: ['coordination'] as const }
  const input = { projectId: 'launch', human: true, addressed: 'mention' as const }
  expect(admitTrigger(coordinator, input)).toEqual(admitTrigger(coordinator, input))
  expect(admitTrigger(coordinator, input)).toEqual({ admissible: true, strength: 'explicit' })
})
