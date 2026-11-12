/**
 * Item 1 (colheita): the work a persona handed to a colleague is TRACKED, so it comes back by itself, once, and she never has to remember it. The host already keeps a record per
 * request (`Handoffs`: asked → delivered → resumed) and wakes the asker with the delivery; this module is the pure part on top of it — what is still pending, and the short paragraph
 * the asker reads in her later turns ("Trabalho que você repassou aqui") so she does not ask again, does not do it in the colleague's place and does not say "Pronto" while it is out.
 * No I/O, no model: the same rows always give the same paragraph.
 */

/** How a request stands, in the words of the person (the records have more states than a persona needs to read). */
export type TrackedState = 'working' | 'paused' | 'delivered' | 'failed'

/** One request the persona made in this Task. */
export interface TrackedRequest {
  readonly requestId: string
  /** `help`: she waits for the answer. `handoff`: the work went on to the colleague (she does not wait). */
  readonly mode: 'help' | 'handoff'
  readonly toName: string
  readonly title: string
  readonly state: TrackedState
}

/** The record status of a request, as the host keeps it. */
export type RecordStatus = 'asked' | 'held' | 'blocked' | 'delivered' | 'resumed' | 'failed' | (string & {})

/**
 * The state of a request in words a persona can act on.
 * @param status - The host's record status (`asked`, `held`, `blocked`, `delivered`, `resumed`…).
 * @param awaitingConnector - The request waits for the person to let a connector through: nothing is lost, it is just not started.
 */
export function trackedStateOf(status: RecordStatus, awaitingConnector = false): TrackedState {
  if (status === 'delivered' || status === 'resumed') return 'delivered'
  if (status === 'held') return 'paused'
  if (status === 'blocked' && !awaitingConnector) return 'failed'
  return 'working'
}

/** Does the Task wait for an answer? Only a `help` that is not back yet: a pass-on never holds the persona. */
export function waitsForColleague(rows: readonly TrackedRequest[]): boolean {
  return rows.some(row => row.mode === 'help' && (row.state === 'working' || row.state === 'paused'))
}

const SHOWN = 6
const TITLE_MAX = 80

const clip = (text: string, max: number): string => {
  const flat = text.replace(/\s+/gu, ' ').trim()
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`
}

const SAYS: Readonly<Record<TrackedState, string>> = {
  working: 'ainda está fazendo',
  paused: 'está em pausa; o pedido volta quando a pessoa retomar',
  delivered: 'já entregou e o resultado chegou a você',
  failed: 'não conseguiu fazer; siga sem essa ajuda ou diga o que falta',
}

/**
 * The paragraph a persona reads in a turn of a Task that handed work to colleagues.
 * @param rows - The requests of this Task, oldest first (reviews are not here: they are the host's step).
 * @returns The paragraph (pt-BR, plain words), or undefined when she handed nothing.
 */
export function trackedParagraph(rows: readonly TrackedRequest[]): string | undefined {
  if (rows.length === 0) return undefined
  const shown = rows.slice(-SHOWN)
  const lines = shown.map(row => `- ${row.toName} — ${clip(row.title, TITLE_MAX)}: ${SAYS[row.state]}.`)
  const more = rows.length > shown.length ? [`(e mais ${String(rows.length - shown.length)} pedidos antigos)`] : []
  return [
    'Trabalho que você repassou nesta tarefa (o app acompanha e traz o resultado de volta sozinho, uma vez: não peça de novo e não faça no lugar do colega):',
    ...more,
    ...lines,
  ].join('\n')
}
