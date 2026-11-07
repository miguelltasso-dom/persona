/**
 * CV-9 (CONVERSAS-SPEC §CV-9, balões): quais mensagens formam UM grupo.
 * Mensagens seguidas do MESMO autor com menos de 5 minutos entre elas formam um grupo: o rosto e a linha do nome só no 1º,
 * 4 px entre os balões e os cantos de dentro fechados. Uma mensagem com cartão estruturado (plano do Gestor, ficha da tarefa,
 * erro de execução…) nunca entra num grupo: o cartão é um cartão, não faz parte de uma sequência de balões.
 */

/** Menos que isto entre duas mensagens do mesmo autor = o mesmo grupo. */
export const GROUP_WINDOW_MS = 5 * 60_000

export type GroupPosition = 'single' | 'first' | 'middle' | 'last'

export interface GroupableMessage {
  readonly authorId: string
  /** Instante ISO da mensagem (o host). Sem ele, vale o `timeLabel` ("14:05"). */
  readonly occurredAt?: string | undefined
  readonly timeLabel: string
  /** Traz um cartão estruturado: fica sozinha e quebra o grupo. */
  readonly structured?: boolean | undefined
}

/** "14:05" → ms desde a meia-noite; qualquer outra forma → `null`. */
function labelMs(label: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/u.exec(label.trim())
  if (match === null) return null
  return (Number(match[1]) * 60 + Number(match[2])) * 60_000
}

function isoMs(value: string | undefined): number | null {
  if (value === undefined || value === '') return null
  const time = Date.parse(value)
  return Number.isNaN(time) ? null : time
}

/**
 * A distância em ms entre duas mensagens, ou `null` quando não dá para medir. Com o instante ISO nas duas é exata (e atravessa a
 * meia-noite); senão usa a hora do rótulo (só confiável no mesmo dia, o que basta para "menos de 5 minutos").
 */
export function gapMs(a: GroupableMessage, b: GroupableMessage): number | null {
  const isoA = isoMs(a.occurredAt)
  const isoB = isoMs(b.occurredAt)
  if (isoA !== null && isoB !== null) return isoB - isoA
  const labelA = labelMs(a.timeLabel)
  const labelB = labelMs(b.timeLabel)
  if (labelA === null || labelB === null) return null
  return labelB - labelA
}

/** `true` quando `next` continua o grupo de `previous`. */
export function continuesGroup(previous: GroupableMessage | undefined, next: GroupableMessage): boolean {
  if (previous === undefined) return false
  if (previous.structured === true || next.structured === true) return false
  if (previous.authorId !== next.authorId) return false
  const gap = gapMs(previous, next)
  return gap !== null && gap >= 0 && gap < GROUP_WINDOW_MS
}

/** A posição de cada mensagem no seu grupo, na mesma ordem da lista. */
export function groupPositions(messages: readonly GroupableMessage[]): readonly GroupPosition[] {
  return messages.map((message, index) => {
    const joinsPrevious = continuesGroup(messages[index - 1], message)
    const next = messages[index + 1]
    const joinsNext = next !== undefined && continuesGroup(message, next)
    if (joinsPrevious) return joinsNext ? 'middle' : 'last'
    return joinsNext ? 'first' : 'single'
  })
}

/** O balão precisa da largura maior (860 px) quando o texto traz tabela ou bloco de código. */
export function bubbleNeedsWidth(body: string): boolean {
  if (body.includes('```')) return true
  // tabela: uma linha de separação "|---|---|" (com ou sem dois-pontos de alinhamento)
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/mu.test(body)
}
