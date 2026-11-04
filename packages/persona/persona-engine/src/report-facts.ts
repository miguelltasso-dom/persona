/** Deterministic, bounded extraction of explicitly reported knowledge; never invokes a model. */
import { stripVTControlCharacters } from 'node:util'
import { containsSecretValue, type BrainPageKind, type BrainVisibility, type LibrarianFact } from '@deepseek-ai/dsh-persona-core'
import { extractJsonText, MODEL_JSON_LIMIT, normalizeModelText } from './parse/model-output.ts'
import { redactSecrets } from './review/redact.ts'

/** Fact categories accepted from the worker's structured report. */
export type ReportFactKind = 'decision' | 'preference' | 'rule' | 'person' | 'process' | 'reference'
/** Original audience supplied by the host, never by the worker's fact payload. */
export type ReportFactAudience =
  | { readonly kind: 'channel'; readonly channelId: string; readonly memberIds: readonly string[] }
  | { readonly kind: 'thread'; readonly threadId: string; readonly memberIds: readonly string[] }
  | { readonly kind: 'members'; readonly memberIds: readonly string[] }
  | { readonly kind: 'project'; readonly projectId: string }

/** Auditable fact retaining its authoritative ticket, audience and report timestamp. */
export interface ExtractedReportFact {
  readonly kind: ReportFactKind
  readonly title: string
  readonly body: string
  readonly sourceTicketId: string
  readonly audience: ReportFactAudience
  readonly evidence: string
  readonly recordedAt: string
}
/** A tool report can carry facts directly; only fenced JSON is considered as text fallback. */
export interface FactReportInput {
  readonly at: string
  readonly summary: string
  readonly facts?: unknown
}
/** Trusted ticket metadata used to restrict the extracted facts. */
export interface FactTicketContext {
  readonly id: string
  readonly audience: ReportFactAudience
  readonly firstDelivery?: boolean
}
/** Safe diagnostic codes; diagnostics never include a rejected payload. */
export type ReportFactRejectionReason = 'malformed_json' | 'invalid_facts' | 'invalid_fact' | 'unsupported_kind'
  | 'secret' | 'invalid_time' | 'invalid_audience' | 'duplicate' | 'fact_limit' | 'source_mismatch' | 'missing_evidence'
/** Extraction output, including every rejected candidate and bounded truncation notices. */
export interface ReportFactExtraction {
  readonly facts: readonly ExtractedReportFact[]
  readonly rejected: readonly { readonly index: number; readonly reason: ReportFactRejectionReason; readonly count?: number }[]
  readonly warnings: readonly { readonly index: number; readonly code: 'truncated' | 'json_repaired'; readonly field?: 'title' | 'body' | 'evidence' }[]
}

/** Protocol limits for one report's durable knowledge. */
export const REPORT_FACT_LIMITS: Readonly<{ facts: number; title: number; body: number; evidence: number }> = {
  facts: 5, title: 80, body: 500, evidence: 160,
}
const PAGE_KINDS: Readonly<Record<ReportFactKind, BrainPageKind>> = {
  decision: 'decision', preference: 'learning', rule: 'rule', person: 'person', process: 'process', reference: 'learning',
}
function isKind(value: unknown): value is ReportFactKind {
  return typeof value === 'string' && Object.hasOwn(PAGE_KINDS, value)
}
function audienceVisibility(audience: ReportFactAudience): BrainVisibility {
  if (audience.kind === 'project') return { kind: 'project', projectId: audience.projectId }
  return { kind: 'members', memberIds: [...new Set(audience.memberIds)].sort() }
}
function validAudience(audience: ReportFactAudience): boolean {
  if (audience.kind === 'project') return audience.projectId.trim() !== ''
  return audience.memberIds.length > 0 && audience.memberIds.every(id => id.trim() !== '')
}

/**
 * Map every extracted category and audience to the existing curation types.
 * Required rules/decisions still pass through the curator's human-approval policy.
 * @param input - Extracted, source-restricted fact; preserve this input separately for audit.
 * @returns Existing fact and visibility, with no inferred links or mandatory flag.
 */
export function mapReportFactForCuration(input: ExtractedReportFact): { fact: LibrarianFact; visibility: BrainVisibility } {
  return { fact: { kind: PAGE_KINDS[input.kind], title: input.title, body: input.body, required: false, linkTo: [] },
    visibility: audienceVisibility(input.audience) }
}

/**
 * Extract only explicit tool facts or a fenced JSON facts array; no prose inference or repair request.
 * The host supplies the original audience; model-supplied audience/time cannot replace it.
 * @param report - Logged report and timestamp, including optional untrusted structured facts.
 * @param ticket - Authoritative source and audience; firstDelivery disables extraction entirely.
 * @returns Bounded facts plus safe rejection reasons and truncation warnings.
 */
export function extractFactsFromReport(report: FactReportInput, ticket: FactTicketContext): ReportFactExtraction {
  const facts: ExtractedReportFact[] = []
  const rejected: Array<{ index: number; reason: ReportFactRejectionReason; count?: number }> = []
  const warnings: Array<{ index: number; code: 'truncated' | 'json_repaired'; field?: 'title' | 'body' | 'evidence' }> = []
  const result = { facts, rejected, warnings }
  if (ticket.firstDelivery === true) return result
  let candidates: unknown = report.facts
  if (candidates === undefined) {
    const fence = /```(?:json)?[ \t]*\n([\s\S]*?)```/iu.exec(normalizeModelText(report.summary))
    if (fence === null) return result
    const extracted = extractJsonText(fence[0])
    if (extracted === undefined || fence[0].length > MODEL_JSON_LIMIT) {
      rejected.push({ index: -1, reason: 'malformed_json' }); return result
    }
    let value: unknown
    try { value = JSON.parse(extracted.text) }
    catch (error) {
      // Malformed model JSON is reported without exposing its payload or asking another model.
      void error
      rejected.push({ index: -1, reason: 'malformed_json' }); return result
    }
    if (typeof value !== 'object' || value === null || !('facts' in value)) return result
    candidates = value.facts
    if (extracted.repaired) warnings.push({ index: -1, code: 'json_repaired' })
  }
  if (!Array.isArray(candidates)) { rejected.push({ index: -1, reason: 'invalid_facts' }); return result }
  const rows: readonly unknown[] = candidates
  if (!Number.isFinite(Date.parse(report.at))) { rejected.push({ index: -1, reason: 'invalid_time', count: rows.length }); return result }
  if (!validAudience(ticket.audience)) { rejected.push({ index: -1, reason: 'invalid_audience', count: rows.length }); return result }
  const seen = new Set<string>()
  const clip = (text: string, limit: number, index: number, field: 'title' | 'body' | 'evidence'): string => {
    const chars = Array.from(normalizeModelText(text).trim())
    if (chars.length > limit) warnings.push({ index, code: 'truncated', field })
    return chars.slice(0, limit).join('')
  }
  for (let index = 0; index < Math.min(rows.length, REPORT_FACT_LIMITS.facts); index += 1) {
    const row = rows[index]
    if (typeof row !== 'object' || row === null || !('kind' in row) || !('title' in row) || typeof row.title !== 'string'
      || !('body' in row) || typeof row.body !== 'string' || row.title.trim() === '' || row.body.trim() === '') {
      rejected.push({ index, reason: 'invalid_fact' }); continue
    }
    if (!isKind(row.kind)) { rejected.push({ index, reason: 'unsupported_kind' }); continue }
    if ('sourceTicketId' in row && row.sourceTicketId !== ticket.id) { rejected.push({ index, reason: 'source_mismatch' }); continue }
    if (!('evidence' in row) || typeof row.evidence !== 'string' || row.evidence.trim() === ''
      || !normalizeModelText(report.summary).includes(normalizeModelText(row.evidence).trim())) {
      rejected.push({ index, reason: 'missing_evidence' }); continue
    }
    if ([row.title, row.body, row.evidence].some(text => redactSecrets(text).redacted
      || containsSecretValue(stripVTControlCharacters(normalizeModelText(text))))) {
      rejected.push({ index, reason: 'secret' }); continue
    }
    const title = clip(row.title, REPORT_FACT_LIMITS.title, index, 'title')
    const key = JSON.stringify([row.kind, title.toLowerCase(), audienceVisibility(ticket.audience)])
    if (seen.has(key)) { rejected.push({ index, reason: 'duplicate' }); continue }
    seen.add(key)
    facts.push({ kind: row.kind, title, body: clip(row.body, REPORT_FACT_LIMITS.body, index, 'body'),
      sourceTicketId: ticket.id, audience: structuredClone(ticket.audience),
      evidence: clip(row.evidence, REPORT_FACT_LIMITS.evidence, index, 'evidence'), recordedAt: report.at })
  }
  if (rows.length > REPORT_FACT_LIMITS.facts) rejected.push({ index: REPORT_FACT_LIMITS.facts, reason: 'fact_limit', count: rows.length - REPORT_FACT_LIMITS.facts })
  return result
}
