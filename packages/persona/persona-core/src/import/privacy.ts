/**
 * Refuse cookies, tokens, and secret-looking values. Classify remaining rows.
 */

import { looksLikeCredential } from '../domain/secrets.ts'

export { looksLikeCredential } from '../domain/secrets.ts'

const SECRET = /(cookie|authorization|api[-_]?key|secret|token|passwd|password|bearer\s+[a-z0-9._\-]+)/i
const VALUE_LABEL = String.raw`(?:senhas?|passwords?|passwd|pwd|api[_ -]?keys?|keys?|chaves?|(?:(?:access|refresh|auth)[_ -]?)?tokens?|(?:client[_ -]?)?secrets?(?:[_ -]?keys?)?|authorization)(?:[ \t]+[\p{L}\p{N}_.@/()-]+)*`
const FULL_VALUE_LABEL = new RegExp(String.raw`^(?:(?:regra|regras|pol[ií]tica|policy|policies)[ \t]+(?:de|da|do|para|for|about)[ \t]+)?${VALUE_LABEL}$`, 'iu')
const VALUE_ASSIGNMENT = new RegExp(String.raw`(?:^|[^\p{L}\p{N}_])[*_"'\x60]*(${VALUE_LABEL})[*_"'\x60]*[ \t]*\]?[ \t]*[:=][ \t]*`, 'giu')
const POLICY_LABEL = /\b(?:policy|policies|regra|regras|pol[ií]tica|pol[ií]ticas)\b/iu
const POLICY_PREFIX = /(?:^|[^\p{L}\p{N}_])(?:regra|regras|pol[ií]tica|policy|policies)[ \t]+(?:de|da|do|para|for|about)[ \t*_"'\x60]*$/iu

function secretLabel(label: string): boolean { return FULL_VALUE_LABEL.test(label) }
function guidance(value: unknown): boolean {
  return typeof value === 'string' && /^(?:nunca|n[aã]o|never|do not)[ \t]+(?:enviar|divulgar|compartilhar|revelar|send|share|disclose|reveal)[ \t]+(?:senhas?|tokens?|credenciais|passwords?|credentials)(?:[ \t]+(?:para ninguém|com ninguém|to anyone|with anyone|to another person))?[.!]?$/iu.test(value.trim())
}
function object(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function array(value: unknown): value is readonly unknown[] { return Array.isArray(value) }
function assignedValue(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (array(value)) return value.length > 0
  return !object(value) || Object.keys(value).length > 0
}
function textValue(body: string, start: number): string | undefined {
  let index = start
  while (body[index] === ' ' || body[index] === '\t') index += 1
  const first = body[index]
  if (first === undefined || /[\r\n,;}\]]/u.test(first)) return undefined
  if (first === '"' || first === "'" || first === '`') {
    const begin = index + 1
    index = begin
    while (index < body.length && body[index] !== '\r' && body[index] !== '\n') {
      if (body[index] === '\\') { index += 2; continue }
      if (body[index] === first) {
        const value = body.slice(begin, index).trim()
        if (value !== '') return value
        const next = body[index + 1]
        if (next === undefined || /[\s,;}\]]/u.test(next)) return undefined
        return body.slice(index + 1).trim() || undefined
      }
      index += 1
    }
    return body.slice(begin, index).trim() || undefined
  }
  const begin = index
  while (index < body.length && !/[\r\n,;}\]]/u.test(body[index]!)) index += 1
  const value = body.slice(begin, index).trim()
  return value === '' || /^(?:null|undefined)$/iu.test(value) ? undefined : value
}
function labelledValue(body: string): boolean {
  for (const match of body.matchAll(VALUE_ASSIGNMENT)) {
    const label = match[1]
    if (label === undefined || !secretLabel(label)) continue
    const before = body.slice(0, match.index + match[0].indexOf(label))
    const value = textValue(body, match.index + match[0].length)
    if (value === undefined) continue
    if ((POLICY_PREFIX.test(before) || POLICY_LABEL.test(label)) && guidance(value)) continue
    return true
  }
  return false
}
function detectionText(body: string): string {
  return body.replace(/\\u([\da-f]{4})/giu, (_match: string, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/\\"/gu, '"')
}
function jsonText(body: string): unknown {
  const text = body.trimStart()
  if (!text.startsWith('{') && !text.startsWith('[') && !text.startsWith('"')) return undefined
  try { return JSON.parse(text) }
  catch (error) {
    if (!(error instanceof SyntaxError)) throw error
    return undefined
  }
}

/**
 * Detect recognizable credential values or non-empty labelled assignments in text and JSON.
 * Unlike the broad import classifier, unassigned password/token guidance is not a secret value.
 * Classifies only: callers must omit sensitive text before building prompts and context views.
 * @param body - Original body, title, locator or other model-visible text.
 * @returns Whether a recognized credential value is present; never rewrites the source.
 */
export function containsSecretValue(body: string): boolean {
  if (looksLikeCredential(body)) return true
  const parsed = jsonText(body)
  if (parsed === undefined) {
    const text = detectionText(body)
    return looksLikeCredential(text) || labelledValue(text)
  }
  const pending: unknown[] = [parsed]
  while (pending.length > 0) {
    const value = pending.pop()
    if (typeof value === 'string') {
      const nested = jsonText(value)
      if (nested !== undefined) pending.push(nested)
      else {
        const text = detectionText(value)
        if (looksLikeCredential(text) || labelledValue(text)) return true
      }
    } else if (array(value)) {
      for (const item of value) pending.push(item)
    }
    else if (object(value)) {
      for (const [label, content] of Object.entries(value)) {
        if (secretLabel(label) && assignedValue(content) && !(POLICY_LABEL.test(label) && guidance(content))) return true
        pending.push(content)
      }
    }
  }
  return false
}

/**
 * @param body - Candidate text.
 * @returns Whether broad import policy classifies the text as secret-looking.
 */
export function looksLikeSecret(body: string): boolean {
  return SECRET.test(body) || containsSecretValue(body)
}

/**
 * Drop secret-looking rows from a preview.
 * @param preview - Adapter output.
 */
export function refuseSecrets<T extends { accepted: { body: string; externalId: string }[]; rejected: { externalId: string; reason: string }[] }>(
  preview: T,
): T {
  const accepted = []
  const rejected = preview.rejected.slice()
  for (const row of preview.accepted) {
    if (looksLikeSecret(row.body)) rejected.push({ externalId: row.externalId, reason: 'SECRET' })
    else accepted.push(row)
  }
  return { ...preview, accepted, rejected }
}
