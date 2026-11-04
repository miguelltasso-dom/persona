/**
 * Read tokens from native CLI session files. Missing counts are skipped.
 * Never estimated from conversation text (T3 harvest).
 */

import { readNativeHistoryTotals, type NativeHistoryTurn } from './native-history.ts'

function numberOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function usageOf(raw: unknown): { input?: number; output?: number } {
  if (raw === null || typeof raw !== 'object') return {}
  const row = raw as Record<string, unknown>
  const input = numberOf(row.input_tokens) ?? numberOf(row.inputTokens) ?? numberOf(row.prompt_tokens)
  const output = numberOf(row.output_tokens) ?? numberOf(row.outputTokens) ?? numberOf(row.completion_tokens)
  return { ...(input === undefined ? {} : { input }), ...(output === undefined ? {} : { output }) }
}

/**
 * Claude JSONL / session lines. Text-only rows do not become tokens.
 * @param text - File contents.
 */
export function turnsFromClaudeJsonl(text: string): NativeHistoryTurn[] {
  const turns: NativeHistoryTurn[] = []
  for (const line of text.split(/\r?\n/u)) {
    if (line.trim() === '') continue
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      continue
    }
    if (parsed === null || typeof parsed !== 'object') continue
    const row = parsed as Record<string, unknown>
    const usage = usageOf(row.usage ?? row.message)
    const nested = row.message !== null && typeof row.message === 'object'
      ? usageOf((row.message as Record<string, unknown>).usage)
      : {}
    const input = usage.input ?? nested.input
    const output = usage.output ?? nested.output
    const at = typeof row.timestamp === 'string' ? row.timestamp : typeof row.ts === 'string' ? row.ts : 'unknown'
    turns.push({
      at,
      ...(input === undefined ? {} : { inputTokens: input }),
      ...(output === undefined ? {} : { outputTokens: output }),
    })
  }
  return turns
}

/**
 * Codex rollout events. Events without usage stay skipped by the fold.
 * @param raw - Rollout JSON or `{ events }`.
 */
export function turnsFromCodexRollout(raw: unknown): NativeHistoryTurn[] {
  const record = raw !== null && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const events = Array.isArray(raw) ? raw : Array.isArray(record.events) ? record.events : []
  const turns: NativeHistoryTurn[] = []
  for (const event of events) {
    if (event === null || typeof event !== 'object') continue
    const row = event as Record<string, unknown>
    const usage = usageOf(row.usage ?? row.token_count ?? row.rate_limits)
    const at = typeof row.timestamp === 'string' ? row.timestamp : typeof row.id === 'string' ? row.id : 'unknown'
    turns.push({
      at,
      ...(usage.input === undefined ? {} : { inputTokens: usage.input }),
      ...(usage.output === undefined ? {} : { outputTokens: usage.output }),
    })
  }
  return turns
}

/**
 * Fold a Claude JSONL file. Missing usage lines increment `turnsSkipped`.
 * @param text - File contents.
 */
export function foldClaudeJsonl(text: string) {
  return readNativeHistoryTotals(turnsFromClaudeJsonl(text))
}

/**
 * Fold a Codex rollout. Missing usage events increment `turnsSkipped`.
 * @param raw - Rollout JSON.
 */
export function foldCodexRollout(raw: unknown) {
  return readNativeHistoryTotals(turnsFromCodexRollout(raw))
}
