import { expect, it } from 'vitest'
import {
  CHANNEL_WORD_LIMIT,
  batchInitiative,
  capChannelReply,
  countWords,
  leanChannelReply,
  formatLeanStructuredReport,
  composeHostTalk,
  engineClassForTurn,
  finishHostTalk,
  foldHostTalkUsed,
  initiativeCadenceDays,
  measureLeanVsNaive,
  trimInitiativeToBudget,
} from '../src/index.ts'

it('caps a channel reply at 100 words and batches initiative per persona per day', () => {
  const long = Array.from({ length: 140 }, (_, i) => `w${String(i)}`).join(' ')
  const capped = capChannelReply(long)
  expect(countWords(capped)).toBe(CHANNEL_WORD_LIMIT)
  const batches = batchInitiative([
    { id: 'a1', personaId: 'nina', title: 'cardápio', day: '2026-11-04' },
    { id: 'a2', personaId: 'nina', title: 'encomenda', day: '2026-11-04' },
    { id: 'b1', personaId: 'bento', title: 'teste', day: '2026-11-04' },
  ])
  expect(batches).toHaveLength(2)
  expect(batches.find(row => row.personaId === 'nina')?.ids).toEqual(['a1', 'a2'])
  expect(engineClassForTurn('triage')).toBe('cheap')
  expect(engineClassForTurn('execution')).toBe('persona')
  const trimmed = trimInitiativeToBudget([
    { id: 'a1', personaId: 'nina', title: 'cardápio', day: '2026-11-04' },
    { id: 'a2', personaId: 'nina', title: 'encomenda', day: '2026-11-04' },
    { id: 'a3', personaId: 'nina', title: 'extra', day: '2026-11-04' },
  ], 200, 400)
  expect(trimmed.map(row => row.id)).toEqual(['a1', 'a2'])
  expect(initiativeCadenceDays(0.2)).toBe(3)
  expect(initiativeCadenceDays(0.5)).toBe(2)
  expect(initiativeCadenceDays(0.8)).toBe(1)
  expect(leanChannelReply('Cardápio de sábado? Sábado tem pão e café.', 'Cardápio de sábado?'))
    .toBe('Sábado tem pão e café.')
  expect(leanChannelReply('Vou agora abrir o arquivo.\nPronto: cardápio publicado.'))
    .toBe('Pronto: cardápio publicado.')
  expect(formatLeanStructuredReport({
    decision: 'Publicar o cardápio.',
    result: 'Sábado tem pão e café.',
    block: 'Falta o preço do bolo.',
  })).toBe('Publicar o cardápio. Sábado tem pão e café. Falta o preço do bolo.')
})

it('host talk uses the stable prefix and finishes lean without hedge', () => {
  const fields = {
    identity: { name: 'Atlas', title: 'Coordenação' },
    personality: 'Calmo.',
    instructions: 'Despache.',
    functionLabel: 'coordenação',
    vault: 'Lilás é a cor oficial.',
    sector: 'Operações',
    capabilities: 'resposta de conversa',
  }
  const userText = 'status do quadro?'
  const talk = composeHostTalk({ fields, surface: 'talk', userText })
  expect(talk.prefix).toContain('Atlas')
  expect(talk.prefix.toLowerCase()).not.toContain(userText)
  expect(talk.variable.toLowerCase()).toContain(userText)
  expect(finishHostTalk(
    `${userText}\nVou agora abrir o quadro.\nPronto: 3 cards. Posso fazer o e2e se você quiser.`,
    userText,
    true,
  )).toBe('Pronto: 3 cards.')
  const vs = measureLeanVsNaive()
  expect(vs.prefixHasUser).toBe(false)
  expect(vs.leanWords).toBeLessThan(vs.naiveWords)
})

it('host talk keeps colleagues in the prefix and recall/subject in the tail', () => {
  const fields = {
    identity: { name: 'Atlas', title: 'Coordenação' },
    personality: 'Calmo.',
    instructions: 'Despache.',
    functionLabel: 'coordenação',
    vault: '',
    colleagues: [{ name: 'Nina', title: 'Pesquisa', role: 'pesquisa' }],
    capabilities: 'resposta de conversa',
  }
  const used = foldHostTalkUsed([
    { id: 'v1', kind: 'constraint', body: 'Nunca inventar preço.', required: true, restricted: false },
    { id: 's1', kind: 'subject_summary', body: 'Assunto: cardápio.', required: false, restricted: false },
    { id: 'm1', kind: 'memory', body: 'Sábado tem pão.', required: false, restricted: false },
    { id: 'dm', kind: 'memory', body: 'segredo', required: false, restricted: true },
  ])
  expect(used.required).toContain('Nunca inventar preço.')
  expect(used.subject).toContain('cardápio')
  expect(used.recall).toContain('Sábado tem pão.')
  expect(used.recall).not.toContain('segredo')
  const talk = composeHostTalk({
    fields,
    surface: 'talk',
    userText: 'status do quadro?',
    required: used.required,
    subject: used.subject,
    recall: used.recall,
  })
  expect(talk.prefix).toContain('Nina')
  expect(talk.prefix).not.toContain('status do quadro?')
  expect(talk.prefix).not.toContain('cardápio')
  expect(talk.variable).toContain('cardápio')
  expect(talk.variable).toContain('Sábado tem pão.')
  expect(talk.variable).toContain('status do quadro?')
  expect(talk.text).toContain('Nunca inventar preço.')
})
