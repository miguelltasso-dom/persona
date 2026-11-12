/**
 * COLHEITA §6 (Quill) · a linha do passo: o texto embaixo do balão "digitando" depois de 5 s de trabalho.
 * Puro (sem host, sem React). A fonte é o turno ativo, um evento real; os 5 s são só o atraso de exibição, nunca o estado.
 */

/** Depois de quantos ms de trabalho a linha aparece. */
export const WORK_STEP_DELAY_MS = 5000
/** No máximo uma troca de texto a cada 2 s. */
export const WORK_STEP_MIN_SWAP_MS = 2000
/** Limite do texto da linha (reticências contam dentro do limite). */
export const WORK_STEP_MAX_CHARS = 56

/** Corta o texto em `max` caracteres Unicode (não bytes, não unidades UTF-16), com "…" no fim quando corta. */
export function capStepText(text: string, max: number = WORK_STEP_MAX_CHARS): string {
  const chars = Array.from(text)
  if (chars.length <= max) return text
  return `${chars.slice(0, max - 1).join('')}…`
}

export type SwapDecision =
  | { readonly kind: 'hold' }
  | { readonly kind: 'swap' }
  | { readonly kind: 'wait'; readonly ms: number }

/**
 * Decide se o texto na tela (`shown`) troca para `target` agora. `lastSwapAt` é o instante (ms) da última troca, `null` se nunca trocou.
 * Nunca mais de uma troca a cada `minGapMs`: se for cedo, devolve quanto falta.
 */
export function decideSwap(input: {
  readonly shown: string
  readonly target: string
  readonly lastSwapAt: number | null
  readonly now: number
  readonly minGapMs?: number
}): SwapDecision {
  if (input.target === input.shown) return { kind: 'hold' }
  if (input.lastSwapAt === null) return { kind: 'swap' }
  const gap = input.minGapMs ?? WORK_STEP_MIN_SWAP_MS
  const elapsed = input.now - input.lastSwapAt
  if (elapsed >= gap) return { kind: 'swap' }
  return { kind: 'wait', ms: gap - elapsed }
}

export interface WorkStepLabels {
  /** "{name} · {text}" */
  readonly line: (name: string, text: string) => string
  /** "Trabalhando": o que aparece quando não há frase do passo. */
  readonly working: string
}

/**
 * A frase simples do passo, quando o host manda uma. Frase com caminho, barra, crase ou contrabarra vira "Trabalhando":
 * a regra da spec é que o texto da linha nunca leve caminho, comando nem nome de ferramenta.
 */
export function plainStepSentence(step: string | undefined): string | undefined {
  const clean = (step ?? '').replace(/\s+/gu, ' ').trim()
  if (clean === '') return undefined
  if (/[\\/`]/u.test(clean)) return undefined
  return clean.charAt(0).toLocaleUpperCase('pt-BR') + clean.slice(1)
}

/** O texto da linha: "Nome · frase do passo" ou "Nome · Trabalhando", sempre cortado em 56 caracteres. */
export function workStepText(input: { readonly name: string; readonly step?: string | undefined; readonly labels: WorkStepLabels }): string {
  const sentence = plainStepSentence(input.step) ?? input.labels.working
  return capStepText(input.labels.line(input.name, sentence))
}
