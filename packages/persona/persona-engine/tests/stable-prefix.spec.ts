import { expect, it } from 'vitest'
import {
  PREFIX_LAYER_ORDER,
  assertPrefixStable,
  composeStablePrefix,
  composeTurnPrompt,
  prefixCacheHitRate,
  prefixLooksVolatile,
  toolsForTurn,
} from '../src/index.ts'

it('keeps system → persona → tools → required and rejects a volatile prefix', () => {
  expect(PREFIX_LAYER_ORDER).toEqual(['system', 'persona', 'tools', 'required'])
  const built = composeStablePrefix({
    system: 'Você coordena a equipe.',
    persona: 'Atlas, Coordenação. Calmo.',
    tools: 'files: lê o projeto.',
    required: 'Nunca inventar preço.',
    subject: 'Padaria Lua',
    message: 'Cardápio de sábado?',
  })
  expect(built.prefix.startsWith('Você coordena')).toBe(true)
  expect(built.prefix.includes('Cardápio')).toBe(false)
  expect(built.variable).toContain('Cardápio')
  expect(prefixLooksVolatile('hoje 14:32 turno #9')).toBe(true)
  expect(() => assertPrefixStable('Standup agora às 10:00')).toThrow('UNSTABLE_PREFIX')
  expect(prefixCacheHitRate(60, 40)).toBeCloseTo(0.6)
  expect(toolsForTurn(['files', 'recall'], ['files', 'shell'])).toEqual(['files'])
  const turn = composeTurnPrompt({
    fields: {
      identity: { name: 'Atlas', title: 'Coordenação' },
      personality: 'Calmo.',
      instructions: 'Despache.',
      functionLabel: 'coordenação',
      vault: '',
    },
    part: 'talk',
    tools: ['files: lê o projeto autorizado.'],
    required: 'Nunca inventar preço.',
    message: 'Cardápio de sábado?',
  })
  expect(turn.prefix).not.toContain('Cardápio')
  expect(turn.variable).toContain('Cardápio')
  expect(turn.text.startsWith(turn.prefix)).toBe(true)
})
