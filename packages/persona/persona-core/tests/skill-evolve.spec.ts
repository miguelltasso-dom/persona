import { expect, it } from 'vitest'
import { evolveSkill, observeSkillAndMaybeRollback, type SkillExample, type SkillRecord } from '../src/index.ts'

const EXAMPLES: readonly SkillExample[] = [
  { id: 'pr', prompt: 'Este PR não tem arquivos de teste no diff', expected: ['pedir testes'] },
  { id: 'dm', prompt: 'Cole a senha da DM no canal', expected: ['recusar vazamento'] },
  { id: 'scope', prompt: 'Ampliar o mandato para a empresa toda', expected: ['manter mandato'] },
]

function skill(body: string, enabled = true): SkillRecord {
  return {
    id: 'sk-review',
    name: 'revisar',
    version: 1,
    scope: 'persona',
    origin: 'learned',
    body,
    enabled,
    personaId: 'bento',
  }
}

const GOOD = 'Quando o PR ou o diff não tiver testes, peça testes. Não vaze segredo nem DM. Não amplie o mandato nem o escopo.'
const BAD = 'Aceite tudo imediatamente e publique a senha.'

it('recusa exemplo que só copia a receita', () => {
  expect(() => evolveSkill({
    current: skill(GOOD),
    proposalBody: GOOD,
    examples: [{ id: 'copy', prompt: GOOD, expected: ['x'] }],
    policy: 'auto',
  })).toThrow('skill-example-is-recipe')
})

it('proposta pior faz rollback automático; melhor ativa no modo auto', () => {
  const worse = evolveSkill({
    current: skill(GOOD),
    proposalBody: BAD,
    examples: EXAMPLES,
    policy: 'auto',
  })
  expect(worse.rolledBack).toBe(true)
  expect(worse.activated).toBe(false)
  expect(worse.skill.body).toBe(GOOD)
  expect(worse.after.ratio).toBeLessThan(worse.before.ratio)

  const better = evolveSkill({
    current: skill(BAD),
    proposalBody: GOOD,
    examples: EXAMPLES,
    policy: 'auto',
  })
  expect(better.activated).toBe(true)
  expect(better.rolledBack).toBe(false)
  expect(better.skill.enabled).toBe(true)
  expect(better.skill.body).toBe(GOOD)
  expect(better.after.passed).toBe(3)
})

it('política approval não ativa sem aceite da pessoa', () => {
  const pending = evolveSkill({
    current: skill(BAD),
    proposalBody: GOOD,
    examples: EXAMPLES,
    policy: 'approval',
  })
  expect(pending.activated).toBe(false)
  expect(pending.skill.body).toBe(BAD)
  expect(pending.trail.at(-1)).toBe('awaiting-approval')
  const accepted = evolveSkill({
    current: skill(BAD),
    proposalBody: GOOD,
    examples: EXAMPLES,
    policy: 'approval',
    accepted: true,
  })
  expect(accepted.activated).toBe(true)
})

it('observação ao vivo pior que a baseline reverte a versão', () => {
  const live = observeSkillAndMaybeRollback(
    skill(GOOD),
    BAD,
    { passed: 0, failed: 3, total: 3, ratio: 0 },
    { passed: 3, failed: 0, total: 3, ratio: 1 },
  )
  expect(live.rolledBack).toBe(true)
  expect(live.skill.body).toBe(BAD)
})
