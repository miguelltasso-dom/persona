/**
 * Why a card in Bloqueado stopped, in ONE plain line for the card ("Falta o login do Mercado Pago"): `TaskView.blockedReason` (Keel, 12/11, follow-up of the Muse ticket). Additive: it is derived from what the
 * host ALREADY keeps when a ticket stops, never from a new store:
 *   - `blocked`: the worker's own report (`assignment.report.summary`), kept only if it is plain words;
 *   - `failed` : the code of the failed run (`[[run-error:…]]` on the turn's closing message), said in plain words; without a code, the report only if it is plain words.
 * A card that waits for the OWNER (answer, delivery, review, retry) carries none: the amber chip "Esperando você" already says it. Technical text (a path, an address, an id, a stack, a marker, JSON, a code
 * fence) is DROPPED, never cleaned: the card then says only "Parado". Pure: the host gives it the ticket and one event lookup.
 */

import type { Ticket } from '@deepseek-ai/dsh-persona-engine'
import { runErrorFromBody } from './run-error-wire.ts'
import { doneEventId } from './ticket-done.ts'
import type { RunErrorCode } from './types.ts'

/** The longest line the card draws before the word cut. */
const MAX_LINE = 120

/** Shapes of text a person should never read on a card. */
const TECHNICAL: readonly RegExp[] = [
  /https?:\/\//iu, /\bwww\./iu, // an address
  /[A-Za-z]:\\/u, /\\\\/u, /(?:^|\s)\.{0,2}\/[\w.-]+\/[\w.-]+/u, // a path
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/iu, // a uuid
  /\b[0-9a-f]{12,}\b/iu, /\b[a-z]{1,5}-[0-9a-f]{8,}\b/iu, // an id
  /\[\[|\]\]|[`{}]/u, // a marker, a code fence, JSON
  /\bat\s+\S+\s*\(/u, // a stack frame
  /\b(?:Error|Exception|TypeError|RangeError|ENOENT|EACCES|ETIMEDOUT|ECONN\w*|EPIPE|stderr|stdout|traceback|undefined|null|NaN)\b|node:/iu,
]

/**
 * @param text - A line the host kept when the ticket stopped (a worker's report, a closing message).
 * @returns One plain line of at most 120 characters (cut at a word), or `undefined` when there is nothing plain to say.
 */
export function plainReason(text: string): string | undefined {
  const first = text.split(/\r?\n/u).map(line => line.trim()).find(line => line !== '')
  if (first === undefined || first.length < 4) return undefined
  if (TECHNICAL.some(shape => shape.test(first))) return undefined
  if (first.length <= MAX_LINE) return first
  const cut = first.slice(0, MAX_LINE + 1)
  const at = cut.lastIndexOf(' ')
  return `${(at > 40 ? cut.slice(0, at) : first.slice(0, MAX_LINE)).trimEnd().replace(/[,;:.\s]+$/u, '')}…`
}

const ENGINE_NAME: Readonly<Record<string, string>> = { claude: 'O Claude', codex: 'O Codex', cursor: 'O Cursor', opencode: 'O OpenCode' }

/**
 * @param code - The code of a failed run.
 * @param provider - The engine the run used, when the closing message said it.
 * @returns The plain sentence for that failure (no code, no engine id).
 */
function sentenceOfRunError(code: RunErrorCode, provider: string | undefined): string {
  const engine = ENGINE_NAME[(provider ?? '').toLowerCase()] ?? 'A IA'
  switch (code) {
    case 'not_logged_in': return `${engine} não está conectado neste computador`
    case 'cli_not_found': return `${engine} não está instalado neste computador`
    case 'model_unavailable': return 'O modelo escolhido não está disponível'
    case 'quota_exhausted': return 'O limite do plano da IA acabou por agora'
    case 'budget_exhausted': return 'O orçamento de IA da equipe acabou'
    case 'provider_unreachable': return 'Não consegui falar com a IA agora'
    case 'engine_unavailable': return 'A IA não está disponível agora'
    case 'app_offline': return 'O Persona está sem internet'
  }
}

/**
 * @param ticket - The ticket of the card.
 * @param stageAction - What the person's stage is waiting for (`blocked`, `failed`, `answer`, `delivery`, `review`, `retry`, …).
 * @param events - Lookup of the stored closing message of the turn.
 * @returns The one plain line, or `undefined` (the card then says only "Parado").
 */
export function blockedReasonOf(ticket: Pick<Ticket, 'id' | 'assignments'>, stageAction: string, events: { get(id: string): { readonly body: string } | undefined }): string | undefined {
  if (stageAction !== 'blocked' && stageAction !== 'failed') return undefined
  const report = ticket.assignments.at(-1)?.report
  if (report === undefined || report.state !== stageAction) return undefined
  if (stageAction === 'failed') {
    const error = runErrorFromBody(events.get(doneEventId(ticket))?.body ?? '')
    if (error !== undefined) return sentenceOfRunError(error.code, error.provider)
  }
  return plainReason(report.summary)
}

/**
 * The field for `TaskView`: present only when there is a plain reason (absent, never empty).
 * @param ticket - The ticket of the card (`undefined` when it is gone).
 * @param stageAction - What the person's stage is waiting for.
 * @param events - Lookup of the stored closing message of the turn.
 */
export function blockedReasonField(ticket: Pick<Ticket, 'id' | 'assignments'> | undefined, stageAction: string, events: { get(id: string): { readonly body: string } | undefined }): { readonly blockedReason?: string } {
  const reason = ticket === undefined ? undefined : blockedReasonOf(ticket, stageAction, events)
  return reason === undefined ? {} : { blockedReason: reason }
}
