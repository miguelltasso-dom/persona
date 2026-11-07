/**
 * W3 for SHORT ANSWERS ONLY (Atlas, 05/11: "re-evaluate W3 only for simple short-answer tasks; handoff and review keep the full report / bilhete").
 *
 * W3 is the worker's lean final report ("Resultado:" / "Bloqueio:", at most 100 words; `WORKER_LEAN_REPORT_RULE`). It cuts output tokens, and output costs
 * several times the input, but it also cuts what a deliverable needs to say. So it applies only to a task whose natural answer IS short: a question, a lookup,
 * a check, a small calculation. This function is the gate and it is deliberately CONSERVATIVE: when in doubt the report stays full (a task that should have
 * been lean and was not costs a few hundred tokens; a deliverable cut to 100 words is a failed delivery).
 *
 * It never fires for: a first delivery or any prompt that already is a worker prompt, a handoff or review request (the `<bilhete>` blocks), a message with
 * several lines or sentences, anything long, anything asking for a deliverable (report, plan, text, table, code, list, summary, research, comparison…), or
 * anything that is not phrased as a question or a lookup/check/calculation verb.
 */

export interface ShortAnswerVerdict {
  readonly short: boolean
  /** One reason, for the tests and the report. */
  readonly why: string
}

/** Longest request that can still be a short-answer task. */
export const SHORT_ANSWER_MAX_CHARS = 240
const MAX_SENTENCES = 2

const L = '(?<![\\p{L}\\p{N}])'
const R = '(?![\\p{L}\\p{N}])'
const words = (stems: readonly string[], whole = false): RegExp => new RegExp(`${L}(?:${stems.join('|')})${whole ? R : ''}`, 'iu')

/** Phrasing of a lookup / check / calculation, or a question. */
const ASKS = words(['qual', 'quais', 'quanto', 'quantos', 'quantas', 'quando', 'onde', 'quem', 'calcule', 'some', 'subtraia', 'converta', 'confira', 'verifique', 'diga', 'informe', 'indique', 'responda', 'existe', 'há', 'ha'], true)

/** Anything that asks for a thing to be PRODUCED. Stems, so "relatório", "relatórios", "escreva", "escrever" all match. */
const DELIVERABLE = words([
  'relat[óo]rio', 'document', 'plano', 'an[áa]lis', 'roteiro', 'planilha', 'tabela', 'c[óo]digo', 'script', 'implement', 'desenvolv', 'cri[ae]', 'criar', 'escrev', 'redij', 'mont[aeo]',
  'elabor', 'prepar', 'ger[ae]', 'gerar', 'desenh', 'layout', 'post', 'artigo', 'texto', 'apresenta', 'cronograma', 'proposta', 'estrat[ée]gia', 'pesquis', 'compar', 'levant',
  'revis', 'audit', 'passo a passo', 'detalh', 'complet', 'todos', 'todas', 'lista', 'resum', 'ideias', 'op[çc][õo]es', 'campanha', 'card[áa]pio', 'receita', 'explique', 'explica',
  'justifi', 'argument', 'sugest', 'sugira', 'recomend', 'melhor', 'melhore', 'corrija', 'refator', 'traduza', 'tradu[çc]',
])

/** Blocks and sentences that mark another kind of request. */
const NOT_SHORT_MARKS = ['<bilhete>', '<entrega>', 'Brief da empresa', 'Você executa a Tarefa autorizada']

function sentencesOf(text: string): number {
  return text.split(/[.!?]+(?:\s+|$)/u).map(part => part.trim()).filter(part => part !== '').length
}

/**
 * Is this assignment a short-answer task, so the lean report (W3) may apply?
 * @param text - The assignment text the worker receives.
 * @param context - `images`: the request carries images (an image asks for a look, not a one-liner).
 */
export function classifyShortAnswer(text: string, context: { readonly images?: number } = {}): ShortAnswerVerdict {
  const flat = text.trim()
  const no = (why: string): ShortAnswerVerdict => ({ short: false, why })
  if (flat === '') return no('vazio')
  if (NOT_SHORT_MARKS.some(mark => flat.includes(mark))) return no('bilhete, revisão, primeira entrega ou prompt de worker: relato inteiro')
  if ((context.images ?? 0) > 0) return no('tem imagem')
  if (flat.length > SHORT_ANSWER_MAX_CHARS) return no('longo')
  if (flat.split(/\r?\n/u).filter(line => line.trim() !== '').length > 1) return no('várias linhas')
  if (sentencesOf(flat) > MAX_SENTENCES) return no('várias frases')
  if (DELIVERABLE.test(flat)) return no('pede um entregável')
  if (!flat.endsWith('?') && !ASKS.test(flat)) return no('não é pergunta nem consulta/conferência/cálculo')
  return { short: true, why: 'pergunta ou consulta curta, sem entregável' }
}

/**
 * @param text - The assignment text.
 * @param context - See {@link classifyShortAnswer}.
 */
export function isShortAnswerTask(text: string, context: { readonly images?: number } = {}): boolean {
  return classifyShortAnswer(text, context).short
}
