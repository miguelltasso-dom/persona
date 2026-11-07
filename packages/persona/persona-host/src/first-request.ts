/**
 * A-6: the first request of the onboarding is the person's own words. The host keeps it (≤ 500 characters, trimmed). That very text
 * is the ONLY thing the thread shows (LEAK-1); the instructions around it (answer-only, no tools, the company brief as data) form the
 * first-delivery assignment, which lives in the host-owned route and never reaches a message. Without a request, a short human line
 * stands in (`firstDeliveryVisibleLine`).
 * Suggestions come from what the person wrote about the business — never from facts the host invented.
 */

import { firstDeliveryAsk, wantsWork } from '@deepseek-ai/dsh-persona-engine'

/** Longest first request the host accepts. */
export const FIRST_REQUEST_MAX = 500
const TOPIC_MAX = 60

/**
 * Whitespace collapsed, trimmed, clipped to {@link FIRST_REQUEST_MAX}. Empty means “use the default ask”.
 * @param raw - Text from the onboarding field.
 */
export function normalizeFirstRequest(raw: string | undefined): string {
  const text = (raw ?? '').replace(/\s+/gu, ' ').trim()
  return text.length <= FIRST_REQUEST_MAX ? text : `${text.slice(0, FIRST_REQUEST_MAX - 1).trimEnd()}…`
}

/**
 * The ASSIGNMENT (internal instructions, never shown in the thread) of a first delivery that carries the person's own request. Same
 * guard rails as the default ask (answer-only, no tools, the company text is data), and the request is quoted as written.
 * @param request - Normalized first request (non-empty).
 * @param companyBrief - Company text from the Cofre seed.
 */
export function firstRequestAsk(request: string, companyBrief: string): string {
  const base = firstDeliveryAsk({ companyBrief })
  const brief = base.slice(base.indexOf('Brief da empresa'))
  const ask = [
    'A Coordenação: faça o pedido abaixo, em português do Brasil, usando somente os dados da empresa fornecidos.',
    'Esta tarefa pede apenas uma resposta em texto. Todo o contexto necessário está nesta mensagem.',
    'Não use ferramentas, inclusive ferramentas da Persona. Não leia nem escreva arquivos, não execute comandos e não acesse a internet.',
    'Não inspecione o diretório de trabalho nem o histórico. Entregue o resultado no texto final.',
    'Não invente preço, cliente ou ferramenta que não esteja no brief; se faltar dado, diga o que falta.',
    '',
    `Pedido da pessoa: ${request}`,
    '',
    brief,
  ].join('\n')
  if (!wantsWork(ask)) throw new Error('first request ask must wantsWork')
  return ask
}

/**
 * Up to three short requests derived from the first line the person wrote about the business. Empty when there is
 * nothing to derive from, so the UI keeps its fixed suggestions instead of pretending to know the company.
 * @param cofreSeed - “Contexto da empresa” text.
 */
export function suggestFirstRequests(cofreSeed: string): string[] {
  const line = cofreSeed.split(/\r?\n/u).map(item => item.trim()).find(item => item !== '') ?? ''
  const topic = clipTopic(line.replace(/[“”"]/gu, ''))
  if (topic.length < 4 || !/\p{L}{3}/u.test(topic)) return []
  return [
    `Sobre “${topic}”: crie cinco ideias para atrair mais clientes.`,
    `Sobre “${topic}”: escreva um texto curto para apresentar o negócio nas redes sociais.`,
    `Sobre “${topic}”: organize o que falta fazer nesta semana, com dono e prazo.`,
  ]
}

function clipTopic(line: string): string {
  if (line.length <= TOPIC_MAX) return line
  const cut = line.slice(0, TOPIC_MAX)
  const space = cut.lastIndexOf(' ')
  return `${(space > 20 ? cut.slice(0, space) : cut).trimEnd()}…`
}
