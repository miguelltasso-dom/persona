/**
 * DSH-direct agent over an OpenAI-compatible HTTP API (DeepSeek, OpenRouter).
 * Key comes from the vault — never logged.
 */

import type { DshAgentEvent, DshAgentPort } from './runner.ts'
import type { HistoryTurn, RunnerUsage } from '../contract.ts'

export type DshProvider = 'deepseek' | 'openrouter' | 'openai-compat' | 'ollama' | 'lmstudio'

export const PROVIDER_BASE: Readonly<Record<DshProvider, string>> = {
  deepseek: 'https://api.deepseek.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  'openai-compat': 'http://127.0.0.1:0',
  ollama: 'http://127.0.0.1:11434/v1',
  lmstudio: 'http://127.0.0.1:1234/v1',
}

export interface HttpDshAgentOptions {
  provider: DshProvider
  apiKey: string
  baseUrl?: string
  fetch?: typeof fetch
}

function contentOf(value: unknown): string {
  if (value === null || typeof value !== 'object') return ''
  const record = value as { message?: { content?: unknown }; delta?: { content?: unknown } }
  const message = record.message?.content
  if (typeof message === 'string') return message
  const delta = record.delta?.content
  return typeof delta === 'string' ? delta : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

function vendorNumber(row: Record<string, unknown>, keys: readonly string[]): number | undefined {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return undefined
}

/**
 * Official token + cache counters from an OpenAI-compatible `usage` object.
 * Missing cache stays omitted (never 0%).
 * @param value - Provider `usage` payload.
 * @returns Tokens. Cache fields omitted when the vendor did not publish them.
 */
export function vendorUsageOf(value: unknown): RunnerUsage {
  if (!isRecord(value)) return { inputTokens: 0, outputTokens: 0 }
  const details = isRecord(value.prompt_tokens_details) ? value.prompt_tokens_details : undefined
  const read = vendorNumber(value, ['prompt_cache_hit_tokens', 'cache_read_input_tokens', 'cached_tokens'])
    ?? (details === undefined ? undefined : vendorNumber(details, ['cached_tokens']))
  const write = vendorNumber(value, ['prompt_cache_miss_tokens', 'cache_creation_input_tokens'])
  return {
    inputTokens: vendorNumber(value, ['prompt_tokens', 'input_tokens']) ?? 0,
    outputTokens: vendorNumber(value, ['completion_tokens', 'output_tokens']) ?? 0,
    ...(read === undefined ? {} : { cacheReadTokens: read }),
    ...(write === undefined ? {} : { cacheWriteTokens: write }),
  }
}

function choiceText(body: unknown): string {
  if (body === null || typeof body !== 'object') return ''
  const choices = (body as { choices?: unknown }).choices
  if (!Array.isArray(choices) || choices[0] === undefined) return ''
  return contentOf(choices[0])
}

async function *readSse(body: { getReader: () => ReadableStreamDefaultReader<Uint8Array> }): AsyncIterable<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let hold = ''
  for (;;) {
    const step = await reader.read()
    if (step.done) break
    hold += decoder.decode(step.value, { stream: true })
    const parts = hold.split('\n\n')
    hold = parts.pop() ?? ''
    for (const block of parts) {
      const line = block.split('\n').find(item => item.startsWith('data:'))
      if (line === undefined) continue
      const data = line.slice(5).trim()
      if (data === '' || data === '[DONE]') continue
      try {
        const text = choiceText(JSON.parse(data))
        if (text !== '') yield text
      } catch (error) {
        void error
      }
    }
  }
}

/**
 * @param options - Provider, vault key, optional custom base URL / fetch.
 */
export function createHttpDshAgent(options: HttpDshAgentOptions): DshAgentPort {
  const fetchImpl = options.fetch ?? fetch
  const root = (options.baseUrl ?? PROVIDER_BASE[options.provider]).replace(/\/$/u, '')
  const usage: RunnerUsage = { inputTokens: 0, outputTokens: 0 }
  let seq = 0
  const play = async function *(
    input: { model: string; prompt: string; history: readonly HistoryTurn[] },
  ): AsyncIterable<DshAgentEvent> {
    const messages = [
      ...input.history.map(turn => ({ role: turn.role, content: turn.text })),
      { role: 'user' as const, content: input.prompt },
    ]
    const response = await fetchImpl(`${root}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify({ model: input.model, messages, stream: true }),
    })
    if (!response.ok) {
      yield { type: 'error', message: `provider ${options.provider} HTTP ${String(response.status)}` }
      return
    }
    const stream = response.body
    const streamed = stream === null ? [] : await (async () => {
      const chunks: string[] = []
      for await (const chunk of readSse(stream)) chunks.push(chunk)
      return chunks
    })()
    if (streamed.length === 0) {
      const body: unknown = await response.json().catch(() => undefined)
      const text = choiceText(body)
      const counted = vendorUsageOf(isRecord(body) ? body.usage : undefined)
      usage.inputTokens += counted.inputTokens
      usage.outputTokens += counted.outputTokens === 0 ? text.length : counted.outputTokens
      if (counted.cacheReadTokens !== undefined) {
        usage.cacheReadTokens = (usage.cacheReadTokens ?? 0) + counted.cacheReadTokens
      }
      if (counted.cacheWriteTokens !== undefined) {
        usage.cacheWriteTokens = (usage.cacheWriteTokens ?? 0) + counted.cacheWriteTokens
      }
      if (text !== '') yield { type: 'text', text }
      yield { type: 'ended', text }
      return
    }
    let text = ''
    for (const chunk of streamed) {
      text += chunk
      yield { type: 'text', text: chunk }
    }
    usage.outputTokens += text.length
    yield { type: 'ended', text }
  }
  return {
    start: async input => ({
      sessionId: `http-${options.provider}-${String(++seq)}`,
      events: play(input),
    }),
    resume: async input => ({
      sessionId: input.sessionId,
      events: play(input),
    }),
    cancel: async () => undefined,
    usage: async () => ({ ...usage }),
  }
}
