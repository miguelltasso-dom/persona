import { expect, it } from 'vitest'
import {
  PREFIX_LAYER_ORDER,
  VARIABLE_LAYER_BUDGET,
  assertPrefixStable,
  clipTextToTokens,
  composeStablePrefix,
  composeTurnPrompt,
  measureOpt3Acceptance,
  measureOpt4Acceptance,
  prefixCacheHitRate,
  prefixLooksVolatile,
  PROMPT_TEMPLATES,
  composeHostTalk,
  toolsForTurn,
  trimVariableAlreadyInPrefix,
  composeTalkStable,
  composePersonaStable,
  finalizeTalkReply,
} from '../src/index.ts'
import { prefixHasGeneratedClock } from '../src/prompts/stable-prefix.ts'

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
  expect(measureOpt3Acceptance()).toEqual({ passed: 3, total: 3, failed: [] })
  expect(measureOpt4Acceptance()).toEqual({ passed: 3, total: 3, failed: [] })
  const clipped = clipTextToTokens('assunto '.repeat(400), VARIABLE_LAYER_BUDGET.subject)
  expect(clipped.length).toBeLessThan('assunto '.repeat(400).length)
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

it('user-authored words never silence a persona; a machine clock still does (OPT-3)', () => {
  const talk = (patch: { instructions?: string; personality?: string; required?: string }): string => composeHostTalk({
    fields: {
      identity: { name: 'Atlas', title: 'Contador' },
      personality: patch.personality ?? 'Calmo.',
      instructions: patch.instructions ?? 'Despache.',
      functionLabel: 'coordenação',
      vault: '',
      capabilities: 'resposta de conversa',
    },
    surface: 'talk',
    userText: 'oi',
    ...(patch.required === undefined ? {} : { required: patch.required }),
  }).prefix
  for (const patch of [
    { instructions: 'Avise a equipe hoje se faltar farinha.' },
    { instructions: 'Responda agora quando o cliente perguntar.' },
    { personality: 'Fala como um contador paciente.' },
    { required: 'regra: standup às 10:00 no #geral.' },
  ]) {
    expect(talk(patch).length).toBeGreaterThan(100)
  }
  expect(() => talk({ required: 'prazo: 2026-11-04T09:00 para a entrega.' })).toThrow('UNSTABLE_PREFIX')
  expect(() => talk({ required: 'turno #7 da equipe' })).toThrow('UNSTABLE_PREFIX')
  expect(prefixHasGeneratedClock('agora 10:00 hoje')).toBe(false)
  expect(prefixHasGeneratedClock('gerado em 1730710000000')).toBe(true)
})

it('every engine prompt template is clock-free (strict guard, engine-owned text)', () => {
  for (const [part, text] of Object.entries(PROMPT_TEMPLATES)) {
    expect(prefixLooksVolatile(text), part).toBe(false)
  }
})

it('the stable prefix does not move when only the message, recall or subject change (OPT-3)', () => {
  const fields = {
    identity: { name: 'Atlas', title: 'Coordenação' },
    personality: 'Calmo.',
    instructions: 'Despache.',
    functionLabel: 'coordenação',
    vault: '',
    colleagues: [{ name: 'Nina', title: 'Padeira' }],
    capabilities: 'resposta de conversa',
  }
  const required = 'regra: nunca inventar preço.'
  const one = composeHostTalk({ fields, surface: 'talk', userText: 'Qual o horário?', required, recall: 'nota: abre às 7h' })
  const two = composeHostTalk({ fields, surface: 'talk', userText: 'Cardápio de sábado?', required, subject: 'Ana pediu 40 pães', recall: 'nota: forno a 180 graus' })
  expect(two.prefix).toBe(one.prefix)
  expect(two.text.startsWith(one.prefix)).toBe(true)
  expect(one.variable).not.toBe(two.variable)
})

it('a work-order message can be kept whole; the default still caps it (OPT-4 / first delivery)', () => {
  const fields = {
    identity: { name: 'Nina', title: 'Padeira-chefe' },
    personality: 'Calmo.',
    instructions: 'Entregue.',
    functionLabel: 'executora',
    vault: '',
  }
  const order = `Tarefa: ${'monte a equipe e o cardápio completo, com preço e horário. '.repeat(40)}FIM-DO-PEDIDO`
  const capped = composeTurnPrompt({ fields, part: 'worker', tools: [], required: 'regra: nunca inventar preço.', message: order })
  const whole = composeTurnPrompt({
    fields, part: 'worker', tools: [], required: 'regra: nunca inventar preço.', message: order, messageLimit: Number.POSITIVE_INFINITY,
  })
  expect(capped.text).not.toContain('FIM-DO-PEDIDO')
  expect(capped.layers.message).toBeLessThanOrEqual(VARIABLE_LAYER_BUDGET.message)
  expect(whole.text).toContain('FIM-DO-PEDIDO')
  expect(whole.prefix).toBe(capped.prefix)
  expect(whole.variable.endsWith('FIM-DO-PEDIDO')).toBe(true)
})
