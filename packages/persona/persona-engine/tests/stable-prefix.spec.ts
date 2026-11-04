import { expect, it } from 'vitest'
import {
  PREFIX_LAYER_ORDER,
  assertPrefixStable,
  composeStablePrefix,
  composeTurnPrompt,
  prefixCacheHitRate,
  prefixLooksVolatile,
  toolsForTurn,
  trimVariableAlreadyInPrefix,
  composeTalkStable,
  composePersonaStable,
  finalizeTalkReply,
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
  expect(trimVariableAlreadyInPrefix(
    'Nunca inventar preço.\nAtlas coordena.',
    'Nunca inventar preço.\n\nAna pediu 20 pães.',
  )).toBe('Ana pediu 20 pães.')
  const dup = composeTurnPrompt({
    fields: {
      identity: { name: 'Atlas', title: 'Coordenação' },
      personality: 'Calmo.',
      instructions: 'Despache.',
      functionLabel: 'coordenação',
      vault: '',
    },
    part: 'talk',
    tools: ['files'],
    required: 'Nunca inventar preço.',
    subject: 'Nunca inventar preço.',
    message: 'Cardápio de sábado?',
  })
  expect(dup.variable).not.toContain('Nunca inventar preço.')
  expect(dup.variable).toContain('Cardápio')
})

it('talk stable prefix keeps the user line out of the cache; reply is lean (OPT-3/6)', () => {
  const built = composeTalkStable({
    identity: { name: 'Atlas', title: 'Coordenação' },
    personality: 'Calmo.',
    instructions: 'Despache.',
    functionLabel: 'coordenação',
    colleagues: [{ name: 'Nina', title: 'Design' }],
    context: 'Nunca inventar preço.',
    userText: 'Cardápio de sábado?',
    capabilities: 'resposta de conversa',
  })
  expect(built.prefix).not.toContain('Cardápio')
  expect(built.variable).toContain('Cardápio')
  expect(built.variable).toContain('Nunca inventar preço.')
  expect(built.prefix).toContain('Atlas')
  expect(finalizeTalkReply('Cardápio de sábado? Sábado tem pão.', 'Cardápio de sábado?'))
    .toBe('Sábado tem pão.')
})

it('persona stable keeps the user line out of the cache and vault in required (OPT-3)', () => {
  const built = composePersonaStable({
    fields: {
      identity: { name: 'Atlas', title: 'Coordenação' },
      personality: 'Calmo.',
      instructions: 'Despache.',
      functionLabel: 'coordenação',
      vault: 'Nunca inventar preço.',
      capabilities: 'resposta de conversa',
    },
    surface: 'channel',
    userText: 'Cardápio de sábado?',
  })
  expect(built.prefix).toContain('Atlas')
  expect(built.prefix).toContain('Nunca inventar preço.')
  expect(built.prefix).not.toContain('Cardápio')
  expect(built.variable).toContain('Cardápio')
})
