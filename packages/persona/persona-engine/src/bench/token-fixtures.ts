/**
 * Realistic text fixtures for the faithful token bench (OPT-2). The numbers a
 * scenario reports come from prompts built over THESE strings, not constants.
 * Padaria Lua is the dogfood company; sizes are close to what the host feeds
 * the composers (Cofre rows, subject history, tool descriptions).
 */

export interface FixturePersona {
  readonly id: string
  readonly name: string
  readonly title: string
  readonly personality: string
  readonly instructions: string
}

export const FIXTURE_ATLAS: FixturePersona = {
  id: 'atlas',
  name: 'Atlas',
  title: 'Coordenação',
  personality: 'Calmo, direto e organizado. Fala pouco, decide rápido e avisa a pessoa sem rodeios.',
  instructions: 'Triar cada pedido, despachar para quem tem o mandato certo, responder a pessoa em até 100 palavras e nunca prometer um prazo que a equipe não confirmou.',
}

export const FIXTURE_NINA: FixturePersona = {
  id: 'nina',
  name: 'Nina',
  title: 'Padeira-chefe',
  personality: 'Caprichosa, prática e bem-humorada. Gosta de números exatos e de receitas testadas.',
  instructions: 'Montar cardápios, calcular encomendas e conferir estoque antes de confirmar. Registrar o que decidiu e o que falta.',
}

export const FIXTURE_BENTO: FixturePersona = {
  id: 'bento',
  name: 'Bento',
  title: 'Revisor',
  personality: 'Criterioso e gentil. Aponta o problema e já propõe a correção.',
  instructions: 'Revisar entregas contra o critério de pronto da Tarefa. Aprovar só com evidência; devolver com a lista curta do que falta.',
}

export const FIXTURE_TEAM = [FIXTURE_ATLAS, FIXTURE_NINA, FIXTURE_BENTO] as const

/** Cofre rows marked required (always in the cacheable prefix). */
export const FIXTURE_REQUIRED_VAULT = [
  'regra: nunca inventar preço; usar sempre a tabela do Cofre.',
  'marca: lilás é a cor oficial da Padaria Lua; tom caloroso e curto.',
  'privacidade: telefone e endereço de cliente nunca vão para canal público.',
].join('\n')

/**
 * Non-required recall rows, in retrieval order (NOT relevance order). The row a
 * scenario needs sits late on purpose: a head-clip drops it, a relevance ranking keeps it.
 */
export const FIXTURE_RECALL_ROWS: readonly string[] = [
  'nota: a Padaria Lua abre às 7h de terça a sábado e fecha às 13h aos domingos; segunda é folga da equipe.',
  'nota: fornecedor de farinha entrega às quartas pela manhã; pedido mínimo de 50 kg com 48 h de antecedência.',
  'nota: a vitrine é trocada às sextas; fotos novas vão para o Instagram até as 16h com a legenda curta de sempre.',
  'nota: a máquina de café precisa de descalcificação a cada 30 dias; a última foi feita na primeira semana do mês.',
  'nota: o pão de queijo congelado rende 40 unidades por bandeja e leva 22 minutos no forno a 180 graus.',
  'nota: reclamações de clientes vão para a Ana primeiro; só escalam para a Coordenação depois de um dia sem resposta.',
  'nota: promoção do mês passado (combo café e pão) terminou; não reativar sem aprovação da dona.',
  'nota: a entrega por aplicativo cobra 18% de comissão; encomendas diretas pelo WhatsApp não têm taxa.',
  'nota: a equipe tem standup às 10h no canal #geral, todos os dias úteis, com no máximo 10 minutos.',
  'nota: o freezer 2 está com a porta desalinhada; manter a lista de itens perecíveis atualizada até o conserto.',
  'nota: Ana Souza encomenda toda sexta 30 pães de fermentação natural e 2 bolos de fubá para retirada às 9h.',
  'nota: a embalagem kraft acaba em duas semanas; o pedido ao fornecedor é feito pela Nina, não pelo caixa.',
]

/** Raw topic history (what the host listed before the incremental summary). */
export const FIXTURE_SUBJECT_HISTORY: readonly string[] = [
  'Ana: oi pessoal, vou querer a encomenda de sábado como sempre, mas dessa vez com mais pães.',
  'Atlas: anotado, Ana. Quantos pães a mais você quer e o bolo continua o de fubá?',
  'Ana: 40 pães de fermentação natural em vez de 30; o bolo de fubá continua, só um.',
  'Nina: consigo os 40 pães se a farinha chegar na quarta; vou confirmar o estoque.',
  'Nina: estoque ok, farinha de quarta já está reservada; os 40 pães cabem na produção de sexta.',
  'Atlas: decisão: encomenda da Ana de sábado fica em 40 pães e 1 bolo de fubá, retirada às 9h.',
  'Ana: perfeito. Posso trocar o bolo de fubá por um de cenoura se o fubá acabar?',
  'Nina: pode sim, cenoura tem a mesma massa base; aviso na sexta se precisar trocar.',
  'Bento: revisei o cardápio de sábado do mês passado; faltou colocar o preço do pão de queijo na tabela.',
  'Nina: corrigi a tabela, o pão de queijo entra a R$ 3,50 a unidade.',
  'Atlas: regra: nunca divulgar preço novo sem a dona aprovar; a tabela do Cofre é a fonte.',
  'Ana: combinado. Obrigada, equipe!',
  'Atlas: de nada. Sábado a gente fecha o cardápio e avisa você.',
  'Nina: lembrete: sexta de manhã separar a embalagem kraft para as 40 unidades da Ana.',
]

/**
 * The tools a write-level worker is offered through the Persona MCP gateway, with the REAL one-line
 * descriptions from persona-runners/src/mcp/* (the gateway filters by tool level only, not by task).
 */
export const FIXTURE_TOOL_DESCRIPTIONS: Readonly<Record<string, string>> = {
  persona_report: 'Report assignment progress to the ticket.',
  persona_recall: 'Recall authorized memory for this run.',
  persona_ask: 'Ask the person a question on the ticket.',
  persona_browser_open: 'Open a page in the hosted browser (read).',
  persona_browser_read: 'Read the current page text.',
  persona_browser_act: 'Click or type in the hosted browser (external; needs approval).',
  persona_computer_screenshot: 'Capture the local screen (read).',
  persona_computer_click: 'Click on the local screen (external; needs approval).',
  persona_computer_type: 'Type into the focused local window (external; needs approval).',
  brain_search: 'Search Segundo cérebro pages (ACL per page; no title if denied).',
  brain_read: 'Read a brain page and recall linked neighbors (ACL each hop).',
  brain_propose: 'Propose a brain page edit. Required rules need human accept.',
  persona_telegram_send: 'Reply on the origin Telegram chat (external; needs approval).',
  persona_email_send: 'Reply on the origin email thread (external; needs approval).',
}

export const FIXTURE_MANDATE_TOOLS = Object.keys(FIXTURE_TOOL_DESCRIPTIONS)

/** What the MCP list carries per tool besides name and description. */
export const FIXTURE_TOOL_SCHEMA = '{"type":"object","additionalProperties":true}'

/** Verbose "legacy" model habits that the lean-output rules strip. */
export const FIXTURE_NARRATION = 'Vou agora abrir o quadro e conferir os cartões antes de responder.'
export const FIXTURE_HEDGE = 'Posso fazer o restante se você quiser.'
