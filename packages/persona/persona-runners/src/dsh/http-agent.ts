/**
 * DSH-direct agent over an OpenAI-compatible HTTP API (DeepSeek, OpenRouter).
 * Key comes from the vault — never logged.
 */

import type { DshAgentEvent, DshAgentPort } from './runner.ts'
import type { HistoryTurn, RunnerUsage } from '../contract.ts'

export type DshProvider = 'deepseek' | 'openrouter' | 'openai-compat'

export const PROVIDER_BASE: Readonly<Record<DshProvider, string>> = {
  deepseek: 'https://api.deepseek.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  'openai-compat': 'http://127.0.0.1:0',
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

function usageOf(value: unknown): { input: number; output: number } {
  if (value === null || typeof value !== 'object') return { input: 0, output: 0 }
  const record = value as { prompt_tokens?: unknown; completion_tokens?: unknown }
  return {
    input: typeof record.prompt_tokens === 'number' ? record.prompt_tokens : 0,
    output: typeof record.completion_tokens === 'number' ? record.completion_tokens : 0,
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
      const counted = usageOf(body !== null && typeof body === 'object' ? (body as { usage?: unknown }).usage : undefined)
      usage.inputTokens += counted.input
      usage.outputTokens += counted.output === 0 ? text.length : counted.output
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
