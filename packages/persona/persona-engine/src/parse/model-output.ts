/**
 * Read model output for Router / persona_* decisions. Deterministic repair,
 * then one repair request, then honest degrade — never a Ticket from garbage.
 */

import type { FollowupProposal } from '../continue.ts'
import type { WorkerReport } from '../core/assignments.ts'
import type { ReportState } from '../core/model.ts'

export type ParsedCoordDecision =
  | 'reply'
  | 'accept'
  | 'ask'
  | 'ignore'
  | 'new_ticket'
  | 'handoff'
  | 'silent'

export type ParsedRouteDecision =
  | { kind: 'accept'; trigger_id: string; title: string; scope: string; reason: string }
  | { kind: 'ignore'; trigger_id: string; reason: string }
  | { kind: 'stop'; ticket_id: string; reason: string }
  | { kind: 'attach'; trigger_id: string; ticket_id: string }

export const MODEL_DEGRADE = 'não entendi a resposta da persona'
export const MODEL_JSON_LIMIT = 65_536
export const MODEL_REPAIR_LIMIT = 1

export type ModelParseKind = 'route' | 'report' | 'proposal' | 'coord'

export type ParseStatus = 'ok' | 'repaired' | 'needs_repair' | 'degraded'

export interface ModelDegrade {
  message: string
  attention: 'needs_you'
}

export interface ModelParseResult<T> {
  status: ParseStatus
  value?: T
  repairPrompt?: string
  degrade?: ModelDegrade
}

const ROUTE_KINDS = new Set(['accept', 'ignore', 'stop', 'attach'])
const REPORT_STATES = new Set<ReportState>(['progress', 'waiting', 'ready', 'blocked', 'failed', 'dropped'])
const COORD_DECISIONS = new Set<ParsedCoordDecision>([
  'reply', 'accept', 'ask', 'ignore', 'new_ticket', 'handoff', 'silent',
])

const ENUM_ALIAS: Record<string, string> = {
  ACCEPT: 'accept',
  IGNORE: 'ignore',
  STOP: 'stop',
  ATTACH: 'attach',
  REPLY: 'reply',
  ASK: 'ask',
  HANDOFF: 'handoff',
  SILENT: 'silent',
  NEW_TICKET: 'new_ticket',
  PROGRESS: 'progress',
  WAITING: 'waiting',
  READY: 'ready',
  BLOCKED: 'blocked',
  FAILED: 'failed',
  DROPPED: 'dropped',
}

/**
 * @param raw - Model text.
 */
export function normalizeModelText(raw: string): string {
  return raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').normalize('NFC')
}

/**
 * Pull the first JSON object or array out of fences / surrounding prose.
 * Unclosed braces are closed. Returns undefined when nothing looks like JSON.
 * @param raw - Model text.
 */
export function extractJsonText(raw: string): { text: string; repaired: boolean } | undefined {
  const normalized = normalizeModelText(raw)
  const capped = normalized.length > MODEL_JSON_LIMIT
    ? normalized.slice(0, MODEL_JSON_LIMIT)
    : normalized
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(capped)
  const body = fence?.[1] ?? capped
  const obj = body.indexOf('{')
  const arr = body.indexOf('[')
  const start = obj < 0 ? arr : arr < 0 ? obj : Math.min(obj, arr)
  if (start < 0) return undefined
  const slice = body.slice(start)
  const closed = closeJson(slice)
  if (closed === undefined) return undefined
  const repaired = closed !== slice || fence !== null || start > 0 || body.slice(start + closed.length).trim().length > 0
    || capped !== normalized
  return { text: closed, repaired }
}

function closeJson(slice: string): string | undefined {
  let inString = false
  let escape = false
  const stack: string[] = []
  let last = -1
  for (let i = 0; i < slice.length; i += 1) {
    const ch = slice[i]!
    if (inString) {
      if (escape) escape = false
      else if (ch === '\\') escape = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{') stack.push('}')
    else if (ch === '[') stack.push(']')
    else if (ch === '}' || ch === ']') {
      if (stack[stack.length - 1] !== ch) return undefined
      stack.pop()
      if (stack.length === 0) {
        last = i
        break
      }
    }
  }
  if (last >= 0) return slice.slice(0, last + 1)
  if (stack.length === 0) return undefined
  let tail = slice
  if (inString) tail += '"'
  if (tail.trimEnd().endsWith(',')) tail = tail.trimEnd().slice(0, -1)
  return tail + stack.reverse().join('')
}

function parseJson(text: string): { value: unknown; duplicateKeys: boolean } | undefined {
  try {
    return { value: JSON.parse(text) as unknown, duplicateKeys: hasDuplicateKeys(text) }
  }
  catch {
    return undefined
  }
}

function hasDuplicateKeys(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed.startsWith('{')) return false
  const keys: string[] = []
  const key = /"([^"\\]|\\.)*"\s*:/g
  let depth = 0
  let inString = false
  let escape = false
  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i]!
    if (inString) {
      if (escape) escape = false
      else if (ch === '\\') escape = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      if (depth === 1) {
        key.lastIndex = i
        const match = key.exec(trimmed)
        if (match !== null && match.index === i) keys.push(JSON.parse(match[0].replace(/\s*:$/, '')) as string)
      }
      inString = true
      continue
    }
    if (ch === '{' || ch === '[') depth += 1
    else if (ch === '}' || ch === ']') depth -= 1
  }
  return keys.length !== new Set(keys).size
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function enumOf(value: unknown, allowed: Set<string>): string | undefined {
  if (typeof value !== 'string') return undefined
  const mapped = ENUM_ALIAS[value] ?? (value === value.toLowerCase() ? value : value.toLowerCase())
  return allowed.has(mapped) ? mapped : undefined
}

function degrade(): ModelDegrade {
  return { message: MODEL_DEGRADE, attention: 'needs_you' }
}

function isReportState(value: string): value is ReportState {
  return value === 'progress' || value === 'waiting' || value === 'ready'
    || value === 'blocked' || value === 'failed' || value === 'dropped'
}

function isCoordDecision(value: string): value is ParsedCoordDecision {
  return value === 'reply' || value === 'accept' || value === 'ask' || value === 'ignore'
    || value === 'new_ticket' || value === 'handoff' || value === 'silent'
}

function repairHint(kind: ModelParseKind): string {
  if (kind === 'route') {
    return 'Responda só um JSON array de até 20 decisões {kind, trigger_id|ticket_id, title?, scope?, reason?}.'
  }
  if (kind === 'report') {
    return 'Responda só um JSON {state, summary, question?} com state em progress|waiting|ready|blocked|failed|dropped.'
  }
  if (kind === 'proposal') {
    return 'Responda só um JSON {title, reason, withinMandate}.'
  }
  return 'Responda só um JSON {decision} com decision em reply|accept|ask|ignore|new_ticket|handoff|silent.'
}

function ok<T>(value: T, repaired: boolean): ModelParseResult<T> {
  return repaired ? { status: 'repaired', value } : { status: 'ok', value }
}

function missing<T>(kind: ModelParseKind, repairUsed: boolean): ModelParseResult<T> {
  if (!repairUsed) return { status: 'needs_repair', repairPrompt: repairHint(kind) }
  return { status: 'degraded', degrade: degrade() }
}

function load(raw: string): { value: unknown; repaired: boolean } | undefined {
  const extracted = extractJsonText(raw)
  if (extracted === undefined) return undefined
  const parsed = parseJson(extracted.text)
  if (parsed === undefined) return undefined
  return { value: parsed.value, repaired: extracted.repaired || parsed.duplicateKeys }
}

/**
 * @param raw - Coordinator / persona_route model text.
 * @param repairUsed - True when the one repair turn already ran.
 */
export function parseRoutePayload(raw: string, repairUsed = false): ModelParseResult<ParsedRouteDecision[]> {
  const loaded = load(raw)
  if (loaded === undefined) return missing('route', repairUsed)
  if (!Array.isArray(loaded.value)) return missing('route', repairUsed)
  const items: ParsedRouteDecision[] = []
  for (const row of loaded.value) {
    const rec = asRecord(row)
    if (rec === undefined) return missing('route', repairUsed)
    const kind = enumOf(rec.kind, ROUTE_KINDS)
    if (kind === undefined) return missing('route', repairUsed)
    if (kind === 'accept') {
      const trigger_id = str(rec.trigger_id)
      const title = str(rec.title)
      const scope = str(rec.scope)
      const reason = str(rec.reason)
      if (trigger_id === undefined || title === undefined || scope === undefined || reason === undefined) {
        return missing('route', repairUsed)
      }
      items.push({ kind, trigger_id, title, scope, reason })
    }
    else if (kind === 'ignore') {
      const trigger_id = str(rec.trigger_id)
      const reason = str(rec.reason)
      if (trigger_id === undefined || reason === undefined) return missing('route', repairUsed)
      items.push({ kind, trigger_id, reason })
    }
    else if (kind === 'stop') {
      const ticket_id = str(rec.ticket_id)
      const reason = str(rec.reason)
      if (ticket_id === undefined || reason === undefined) return missing('route', repairUsed)
      items.push({ kind, ticket_id, reason })
    }
    else {
      const trigger_id = str(rec.trigger_id)
      const ticket_id = str(rec.ticket_id)
      if (trigger_id === undefined || ticket_id === undefined) return missing('route', repairUsed)
      items.push({ kind: 'attach', trigger_id, ticket_id })
    }
  }
  return ok(items, loaded.repaired)
}

/**
 * @param raw - Worker / persona_report model text.
 * @param repairUsed - True when the one repair turn already ran.
 */
export function parseReportPayload(raw: string, repairUsed = false): ModelParseResult<WorkerReport> {
  const loaded = load(raw)
  if (loaded === undefined) return missing('report', repairUsed)
  const rec = asRecord(loaded.value)
  if (rec === undefined) return missing('report', repairUsed)
  const mapped = enumOf(rec.state, REPORT_STATES)
  const summary = str(rec.summary)
  if (mapped === undefined || summary === undefined || !isReportState(mapped)) return missing('report', repairUsed)
  const state = mapped
  const report: WorkerReport = { state, summary }
  if (rec.question === null) report.question = null
  else if (typeof rec.question === 'string') report.question = rec.question
  return ok(report, loaded.repaired)
}

/**
 * @param raw - Follow-up / persona_propose model text.
 * @param repairUsed - True when the one repair turn already ran.
 */
export function parseProposalPayload(raw: string, repairUsed = false): ModelParseResult<FollowupProposal> {
  const loaded = load(raw)
  if (loaded === undefined) return missing('proposal', repairUsed)
  const rec = asRecord(loaded.value)
  if (rec === undefined) return missing('proposal', repairUsed)
  const title = str(rec.title)
  const reason = str(rec.reason)
  if (title === undefined || reason === undefined || typeof rec.withinMandate !== 'boolean') {
    return missing('proposal', repairUsed)
  }
  return ok({ title, reason, withinMandate: rec.withinMandate }, loaded.repaired)
}

/**
 * @param raw - Coordinator decision text.
 * @param repairUsed - True when the one repair turn already ran.
 */
export function parseCoordDecision(raw: string, repairUsed = false): ModelParseResult<ParsedCoordDecision> {
  const loaded = load(raw)
  if (loaded === undefined) return missing('coord', repairUsed)
  const rec = asRecord(loaded.value)
  if (rec === undefined) return missing('coord', repairUsed)
  const mapped = enumOf(rec.decision, COORD_DECISIONS)
  if (mapped === undefined || !isCoordDecision(mapped)) return missing('coord', repairUsed)
  return ok(mapped, loaded.repaired)
}

/**
 * Seeded dirty-string generator for parser fuzz.
 * @param seed - mulberry32 seed.
 */
export function dirtyMulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const DIRT = [
  '{',
  '{"decision":',
  '```json\n{"kind":"accept"}\n```',
  'claro {"foo":1} fim',
  '{"decision":"ACCEPT","decision":"nope"}',
  '{"state":"DONE","summary":"x"}',
  '{"title":"x","reason":"y","withinMandate":true,"extra":1}',
  '{"decision":"accept"}\r\n',
  `${'a'.repeat(200)}{"decision":"ask"}`,
  '{"ok":true,"items":[]}',
]

/**
 * @param rand - 0–1 generator.
 */
export function dirtySample(rand: () => number): string {
  const base = DIRT[Math.floor(rand() * DIRT.length)] ?? '{'
  const twist = rand()
  if (twist < 0.2) return `${base.slice(0, Math.max(1, Math.floor(rand() * base.length)))}`
  if (twist < 0.4) return `antes\r\n${base}\ndepois`
  if (twist < 0.6) return `\`\`\`json\n${base}\n\`\`\``
  if (twist < 0.8) return `${base} ${'x'.repeat(Math.floor(rand() * 80))}`
  return `${base}\u00A0`
}
