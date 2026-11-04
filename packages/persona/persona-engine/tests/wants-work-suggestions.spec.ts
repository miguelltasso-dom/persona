/**
 * Every suggestion the UI offers goes through the router: a request for work becomes a Ticket, a question stays a
 * conversation (D-073, Atlas). The suggestions are read from the locale sources the client ships (pt and en), so a new
 * chip that nobody classified fails here instead of silently landing in the wrong lane.
 */
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { wantsWork, workSkipReason } from '../src/wants-work.ts'

type Lane = 'work' | 'talk'

const LOCALES = new URL('../../client-ui-persona/locale-sources/', import.meta.url)

function load(file: string): Record<string, string> {
  return JSON.parse(readFileSync(new URL(file, LOCALES), 'utf8')) as Record<string, string>
}

/** Empty-DM chips (pt and en share the keys): one lane per key, decided by the meaning, not by the words. */
const DM_CHIPS: Readonly<Record<string, Lane>> = {
  'dm.suggest.coordination.1': 'work', // Organize as prioridades desta semana
  'dm.suggest.coordination.2': 'talk', // Quem está livre para pegar uma tarefa nova?   (contains "tarefa")
  'dm.suggest.coordination.3': 'work', // Me dê um resumo do que ficou parado
  'dm.suggest.engineering.1': 'work', // Revise o último código
  'dm.suggest.engineering.2': 'work', // Escreva os testes que estão faltando
  'dm.suggest.engineering.3': 'talk', // O que dá para automatizar no nosso fluxo?
  'dm.suggest.research.1': 'work', // Pesquise 3 concorrentes e compare preços
  'dm.suggest.research.2': 'work', // Resuma este assunto em 5 pontos
  'dm.suggest.research.3': 'talk', // Que dados a gente precisa para decidir isso?
  'dm.suggest.support.1': 'work', // Responda as mensagens de clientes pendentes
  'dm.suggest.support.2': 'work', // Crie respostas-modelo
  'dm.suggest.support.3': 'talk', // Quais clientes estão esperando há mais tempo?
  'dm.suggest.content.1': 'work', // Proponha 5 ideias de post
  'dm.suggest.content.2': 'work', // Revise o tom deste texto
  'dm.suggest.content.3': 'work', // Monte um calendário de conteúdo do mês
  'dm.suggest.default.1': 'talk', // O que você pode fazer por mim hoje?   (contains "fazer")
  'dm.suggest.default.2': 'work', // Leia o Cofre e me diga o que entendeu da empresa
  'dm.suggest.default.3': 'work', // Proponha uma primeira tarefa para você
}

/** Onboarding step 5 and the overview card: the requests the app sends for the person. */
const OTHER: Readonly<Record<string, { file: string; lane: Lane }>> = {
  'step5.taskPreview': { file: 'onboarding', lane: 'work' },
  'step5.taskPreviewEmpty': { file: 'onboarding', lane: 'work' },
  'step5.activationPrompt': { file: 'onboarding', lane: 'work' },
  'step5.activationPromptEmpty': { file: 'onboarding', lane: 'work' },
  'overview.suggestedTaskBody': { file: 'shell', lane: 'work' },
}

/** Suggestions the design docs promise (UX-BEYOND-T3 A-6 / A-7, NEXT-STEP): not in a locale file yet. */
const DESIGN_SUGGESTIONS: readonly { readonly text: string; readonly lane: Lane }[] = [
  { text: 'Monte o cardápio da semana com preços', lane: 'work' },
  { text: 'Pesquise 3 concorrentes e compare preços.', lane: 'work' },
  { text: 'Peça revisão do filtro de pedidos ao Bento.', lane: 'work' },
  { text: 'Qual o horário do standup?', lane: 'talk' },
  { text: 'Quanto custou a semana passada?', lane: 'talk' },
  { text: 'Quem revisa o filtro de pedidos?', lane: 'talk' },
]

for (const lang of ['pt', 'en'] as const) {
  it(`${lang}: every empty-DM chip lands in the lane its meaning asks for`, () => {
    const chat = load(`chat.${lang}.json`)
    const keys = Object.keys(chat).filter(key => key.startsWith('dm.suggest.') && key !== 'dm.suggestTitle')
    // a chip nobody classified fails here
    expect(keys.filter(key => DM_CHIPS[key] === undefined)).toEqual([])
    expect(Object.keys(DM_CHIPS).filter(key => chat[key] === undefined)).toEqual([])
    const wrong = keys.filter(key => wantsWork(chat[key]!) !== (DM_CHIPS[key] === 'work'))
    expect(wrong.map(key => `${key}: ${chat[key]!}`)).toEqual([])
  })

  it(`${lang}: the first-delivery request, the step 5 preview and the overview suggestion are all work`, () => {
    for (const [key, spec] of Object.entries(OTHER)) {
      const text = load(`${spec.file}.${lang}.json`)[key]
      expect(text, key).toBeDefined()
      expect(wantsWork(text!), `${key}: ${text!}`).toBe(spec.lane === 'work')
      if (spec.lane === 'work') expect(workSkipReason(text!), key).toBeUndefined()
    }
  })
}

it('the design suggestions land in their lane', () => {
  for (const item of DESIGN_SUGGESTIONS) expect(wantsWork(item.text), item.text).toBe(item.lane === 'work')
})

it('the new verbs in pt and en start a Ticket', () => {
  const asks = [
    'Pesquise 3 concorrentes da padaria', 'Compare os planos de assinatura', 'Levante os custos do mês', 'Procure um fornecedor de farinha',
    'Busque as avaliações do Google', 'Investigue a queda de vendas', 'Analise o funil de pedidos', 'Verifique o estoque de farinha',
    'Encontre os pedidos atrasados', 'Prepare a pauta da reunião', 'Escreva o texto do post', 'Crie uma planilha de custos',
    'Pode revisar o filtro de pedidos?', 'Poderia montar o cardápio de sábado?', 'Por favor, pesquise preços de embalagem',
    'Equipe, por favor: listem 3 ideias e executem a primeira', 'Research 3 competitors and compare prices.',
    'Find the late orders', 'Look up the supplier list', 'Investigate the drop in sales', 'Analyze the order funnel',
    'Verify the stock', 'Prepare the meeting agenda', 'Write the post copy', 'Can you review the filter?',
    'Could you draft the reply to Ana?', 'Give me a summary of what is stuck.', 'Me dê um relatório das vendas',
    'Oi! Monte a equipe da agência', 'Resuma o Cofre. Quem é o responsável?',
    'aprovar o deploy em staging?', 'Revisar o filtro de pedidos?', 'Como combinado, monte a equipe',
  ]
  expect(asks.filter(text => !wantsWork(text))).toEqual([])
})

it('questions and chatter stay conversation even when they carry a work word', () => {
  const talk = [
    'O que você pode fazer por mim hoje?', 'Quem está livre para pegar uma tarefa nova?', 'Qual o horário do standup?',
    'Como faço para criar um filtro?', 'Por que o deploy falhou?', 'Quando o relatório fica pronto?', 'Tem café?',
    'Onde está o cardápio de sábado?', 'Quanto custa o plano?', 'Será que dá para resumir isso?', 'Preciso saber quando o pedido chega',
    'What can you do for me today?', 'Who is free to pick up a new task?', 'How do I create a filter?', 'Which customers are waiting?',
    'Is the deploy done?', 'oi, tudo bem?', 'obrigado', 'legal o lilás', 'Verificou o estoque?', 'Quero saber como foi a semana',
  ]
  expect(talk.filter(text => wantsWork(text))).toEqual([])
  expect(workSkipReason('oi, tudo bem?')).toBe('courtesy')
  expect(workSkipReason('Qual o horário do standup?')).toBe('not-work')
  expect(workSkipReason('')).toBe('empty')
})

it('keeps what already worked', () => {
  for (const text of [
    'preciso de um README no projeto', 'Monte a equipe da Agência Ponto para o site e a campanha do cliente.',
    'Resuma o Cofre em 5 pontos e proponha a primeira tarefa da semana.', 'Implemente o filtro de pedidos.',
    'Bento, revise o filtro de pedidos.', 'Cardápio de sábado e encomenda da Ana: monte e confirme.',
  ]) expect(wantsWork(text), text).toBe(true)
})
