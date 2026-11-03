import { expect, it } from 'vitest'
import { applySkillEval, nextSkillVersion, publishSkill, rollbackSkill } from '../src/index.ts'
import type { SkillRecord } from '../src/index.ts'

function skill(overrides: Partial<SkillRecord> = {}): SkillRecord {
  return {
    id: 's1',
    name: 'review-pr',
    version: 1,
    scope: 'persona',
    origin: 'library',
    body: 'Check the diff.',
    enabled: true,
    personaId: 'bento',
    ...overrides,
  }
}

it('refuses to publish a DM-derived skill beyond the persona', () => {
  const dm = skill({ origin: 'dm' })
  expect(publishSkill(dm, 'persona').scope).toBe('persona')
  expect(() => publishSkill(dm, 'project')).toThrow('ACCESS_ESCALATION')
  expect(() => publishSkill(dm, 'team')).toThrow('ACCESS_ESCALATION')
  expect(publishSkill(skill({ origin: 'learned' }), 'project').scope).toBe('project')
})

it('bumps the version and disables on a new body, then rollback restores the previous body', () => {
  const next = nextSkillVersion(skill(), 'New recipe')
  expect(next).toMatchObject({ version: 2, body: 'New recipe', enabled: false })
  const rolled = rollbackSkill(next, 'Check the diff.')
  expect(rolled).toMatchObject({ version: 3, body: 'Check the diff.' })
})

it('disables a skill that fails evaluation without rewriting the body', () => {
  expect(applySkillEval(skill(), 'fail').enabled).toBe(false)
  expect(applySkillEval(skill(), 'pass').enabled).toBe(true)
})
