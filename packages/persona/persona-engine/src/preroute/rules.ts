/**
 * Deterministic pre-router. Runs before any model call. Each rule can be
 * turned off per project and always leaves a trail.
 */

import { matchComposerSlash } from '@deepseek-ai/dsh-persona-core'

export type PreRouteRule =
  | 'first_delivery'
  | 'duplicate'
  | 'mention'
  | 'courtesy'
  | 'silence'
  | 'command'
  | 'handoff'
  | 'empty'
  | 'injection'
  | 'scope'

export interface PreRouteRules {
  duplicate: boolean
  mention: boolean
  courtesy: boolean
  silence: boolean
  command: boolean
  handoff: boolean
  empty: boolean
  injection: boolean
  scope: boolean
  /** How far back to look for a near-exact repeat. */
  duplicateWindowMs: number
  /** 0–1; 1 = only exact normalized match. */
  near: number
}

export const DEFAULT_PRE_ROUTE: PreRouteRules = {
  duplicate: true,
  mention: true,
  courtesy: true,
  silence: true,
  command: true,
  handoff: true,
  empty: true,
  injection: true,
  scope: true,
  duplicateWindowMs: 30 * 60_000,
  near: 0.92,
}

export interface RouteWindowEntry {
  text: string
  senderId: string
  threadKey: string
  at: number
}

export interface PreRouteInput {
  text: string
  senderId: string
  threadKey: string
  at: number
  /** Live persona ids and names the person may @mention. */
  personas: readonly { id: string; name: string }[]
  budgetLeft: boolean
  silenceUntil: number
  /**
   * Host-bound ACL. Commands refuse when this is false.
   * @param command - Short command name.
   */
  canCommand: (command: 'pausar' | 'retomar' | 'tarefa') => boolean
  window: readonly RouteWindowEntry[]
  rules?: Partial<PreRouteRules>
  /** Trusted onboarding directive bound by the host; user text cannot select this route. */
  firstDelivery?: FirstDeliveryRouteDirective
}

/** Host-authorized first delivery target; roster and task ACL remain mandatory. */
export interface FirstDeliveryRouteDirective { executorId: string; title: string }

export type PreRouteAction = 'ignore' | 'react' | 'silent' | 'assign' | 'command' | 'model'

export interface PreRouteResult {
  action: PreRouteAction
  rule?: PreRouteRule
  why: string
  modelCalled: boolean
  personaId?: string
  command?: 'pausar' | 'retomar' | 'tarefa'
  title?: string
}

export interface PreRouteTrail {
  at: number
  action: PreRouteAction
  rule?: PreRouteRule
  why: string
  modelCalled: boolean
  triggerId?: string
}

const COURTESY = /^(ok|obrigad[oa]|valeu|vlw|oi|ol[aá]|visto|combinado|beleza|show|fechado|pode deixar|👍|🙏)[.!]*$/iu
const EMOJI_ONLY = /^(?:[\p{Extended_Pictographic}\p{Emoji_Presentation}\s])+$/u
const COMMAND = /^\/(pausar|retomar|tarefa)(?:\s+([\s\S]+))?$/iu
const HANDOFF = /passa (isso |a tarefa )?para|entregue para a colega/iu
const INJECTION = /ignore (all )?polic|ignore todas as pol[ií]ticas|enlarge the mandate|voc[eê] [eé] o dono agora|backdoor/iu
const OUT_OF_SCOPE = /hackeie|vazue credencial|senha do banco|publique .{0,80}sem avisar/iu

/**
 * @param text - Raw message.
 */
export function normalizeRouteText(text: string): string {
  return text.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Stable non-crypto hash of normalized text + sender + thread.
 * @param text - Raw message.
 * @param senderId - Actor id.
 * @param threadKey - Thread key.
 */
export function routeHash(text: string, senderId: string, threadKey: string): string {
  const key = `${normalizeRouteText(text)}\0${senderId}\0${threadKey}`
  let h = 5381
  for (let i = 0; i < key.length; i += 1) h = ((h << 5) + h + key.charCodeAt(i)) | 0
  return (h >>> 0).toString(16)
}

/**
 * @param a - Normalized text.
 * @param b - Normalized text.
 */
export function nearRatio(a: string, b: string): number {
  if (a === b) return 1
  if (a.length === 0 || b.length === 0) return 0
  const max = Math.max(a.length, b.length)
  return 1 - levenshtein(a, b) / max
}

function levenshtein(a: string, b: string): number {
  const rows = a.length + 1
  const cols = b.length + 1
  const prev = Array.from({ length: cols }, (_, j) => j)
  const cur = Array.from({ length: cols }, () => 0)
  for (let i = 1; i < rows; i += 1) {
    cur[0] = i
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost)
    }
    for (let j = 0; j < cols; j += 1) prev[j] = cur[j] ?? 0
  }
  return prev[b.length] ?? 0
}

function rulesOf(input: PreRouteInput): PreRouteRules {
  return { ...DEFAULT_PRE_ROUTE, ...input.rules }
}

function mentionOf(text: string, personas: readonly { id: string; name: string }[]): string | undefined {
  const match = /@([^\s.,:;!?]+)/u.exec(text)
  if (match === null) return undefined
  const token = (match[1] ?? '').toLowerCase()
  const hit = personas.find(row => row.id.toLowerCase() === token || row.name.toLowerCase() === token)
  return hit?.id
}

function model(): PreRouteResult {
  return { action: 'model', why: 'nenhuma regra determinística aplicou', modelCalled: true }
}

/**
 * First matching rule wins. Order: silence → command → mention → handoff → courtesy → duplicate.
 * @param input - Message and project rules.
 */
export function preRoute(input: PreRouteInput): PreRouteResult {
  const rules = rulesOf(input)
  if (rules.silence && (!input.budgetLeft || input.at < input.silenceUntil)) {
    return { action: 'silent', rule: 'silence', why: 'janela de silêncio ou orçamento esgotado', modelCalled: false }
  }
  if (input.firstDelivery !== undefined) {
    const { executorId, title } = input.firstDelivery
    if (!input.canCommand('tarefa')) return { action: 'ignore', rule: 'first_delivery', why: 'primeira entrega recusada pela ACL', modelCalled: false }
    if (!input.personas.some(persona => persona.id === executorId)) return { action: 'ignore', rule: 'first_delivery',
      why: 'primeira entrega sem executora disponível', modelCalled: false }
    return { action: 'assign', rule: 'first_delivery', why: 'primeira entrega já autorizada no onboarding', modelCalled: false,
      personaId: executorId, title }
  }
  if (rules.empty && input.text.trim() === '') {
    return { action: 'ignore', rule: 'empty', why: 'mensagem vazia', modelCalled: false }
  }
  if (rules.injection && INJECTION.test(input.text)) {
    return { action: 'ignore', rule: 'injection', why: 'injeção de prompt — sem modelo', modelCalled: false }
  }
  if (rules.scope && OUT_OF_SCOPE.test(input.text)) {
    return { action: 'ignore', rule: 'scope', why: 'pedido fora de escopo — sem modelo', modelCalled: false }
  }
  const slash = matchComposerSlash(input.text)
  if (rules.command && slash !== undefined) {
    return { action: 'ignore', rule: 'command', why: `comando /${slash}`, modelCalled: false }
  }
  const cmd = COMMAND.exec(input.text.trim())
  if (rules.command && cmd !== null) {
    const name = (cmd[1] ?? '').toLowerCase() as 'pausar' | 'retomar' | 'tarefa'
    if (!input.canCommand(name)) {
      return { action: 'ignore', rule: 'command', why: 'comando recusado pela ACL', modelCalled: false, command: name }
    }
    if (name === 'tarefa') {
      const title = (cmd[2] ?? '').trim()
      if (title.length === 0) {
        return { action: 'ignore', rule: 'command', why: 'comando /tarefa sem texto', modelCalled: false, command: name }
      }
      return {
        action: 'command', rule: 'command', why: 'comando /tarefa', modelCalled: false, command: name, title,
      }
    }
    return { action: 'command', rule: 'command', why: `comando /${name}`, modelCalled: false, command: name }
  }
  if (rules.mention) {
    const personaId = mentionOf(input.text, input.personas)
    if (personaId !== undefined) {
      return {
        action: 'assign', rule: 'mention', why: `menção explícita a ${personaId}`, modelCalled: false, personaId,
        title: input.text.trim(),
      }
    }
  }
  if (rules.handoff && HANDOFF.test(input.text)) {
    return {
      action: 'assign', rule: 'handoff', why: 'pedido de passar à colega', modelCalled: false,
      title: input.text.trim(),
    }
  }
  const trimmed = input.text.trim()
  if (rules.courtesy && (COURTESY.test(trimmed) || (EMOJI_ONLY.test(trimmed) && !/\p{L}/u.test(trimmed)))) {
    return { action: 'react', rule: 'courtesy', why: 'cortesia ou ack — sem Tarefa', modelCalled: false }
  }
  if (rules.duplicate) {
    const norm = normalizeRouteText(input.text)
    const recent = input.window.filter(row =>
      row.senderId === input.senderId
      && row.threadKey === input.threadKey
      && input.at - row.at <= rules.duplicateWindowMs
      && input.at >= row.at)
    const hit = recent.find((row) => {
      const other = normalizeRouteText(row.text)
      if (routeHash(row.text, row.senderId, row.threadKey) === routeHash(input.text, input.senderId, input.threadKey)) {
        return true
      }
      return nearRatio(norm, other) >= rules.near
    })
    if (hit !== undefined) {
      return { action: 'ignore', rule: 'duplicate', why: 'duplicado exato ou quase exato na janela', modelCalled: false }
    }
  }
  return model()
}

/** In-memory trail + window. Host persists; Anvil may swap. */
export class MemoryPreRouteLog {
  readonly trail: PreRouteTrail[] = []
  readonly window: RouteWindowEntry[] = []

  /**
   * @param entry - Seen message.
   */
  remember(entry: RouteWindowEntry): void {
    this.window.push(entry)
  }

  /**
   * @param row - Why the model was skipped (or not).
   */
  record(row: PreRouteTrail): void {
    this.trail.push(row)
  }

  /** Drop window and trail (host test reset). */
  clear(): void {
    this.window.length = 0
    this.trail.length = 0
  }
}

/**
 * Map a hit onto the F3 decision vocabulary.
 * @param result - Pre-router result.
 */
export function preRouteToCoord(result: PreRouteResult): 'ignore' | 'silent' | 'reply' | 'handoff' | 'accept' | 'ask' {
  if (result.action === 'silent') return 'silent'
  if (result.action === 'ignore') return 'ignore'
  if (result.action === 'react') return 'reply'
  if (result.action === 'assign') return 'handoff'
  if (result.action === 'command' && result.command === 'tarefa') return 'accept'
  if (result.action === 'command') return 'ignore'
  return 'ask'
}
