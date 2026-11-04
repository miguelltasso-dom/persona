import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createHttpDshAgent,
  resolveRunner,
  vendorUsageOf,
  type RunEvent,
} from '../src/index.ts'

const SECRET = 'sk-test-http-dsh-secret-xyz'

async function collect(events: AsyncIterable<RunEvent>): Promise<RunEvent[]> {
  const out: RunEvent[] = []
  for await (const event of events) out.push(event)
  return out
}

function listen(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer(handler)
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        reject(new Error('no port'))
        return
      }
      resolve({
        url: `http://127.0.0.1:${String(address.port)}/v1`,
        close: () => new Promise((done, fail) => {
          server.close(error => error === undefined ? done() : fail(error))
        }),
      })
    })
  })
}

describe('HTTP DSH agent', () => {
  const closers: Array<() => Promise<void>> = []
  afterEach(async () => {
    while (closers.length > 0) await closers.pop()?.()
  })

  it('streams the first token from SSE and never logs the vault key', async () => {
    const seen: string[] = []
    const server = await listen((req, res) => {
      seen.push(`${req.method ?? ''} ${req.headers.authorization ?? ''}`)
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write('data: {"choices":[{"delta":{"content":"He"}}]}\n\n')
      res.write('data: {"choices":[{"delta":{"content":"llo"}}]}\n\n')
      res.write('data: [DONE]\n\n')
      res.end()
    })
    closers.push(server.close)
    const vault = { get: async () => SECRET }
    const runner = await resolveRunner({
      spec: { kind: 'dsh', model: 'deepseek-chat', provider: 'openai-compat', baseUrl: server.url },
      permissionMode: 'prompt',
      vault,
      personId: 'nina',
      infra: { wait: async () => undefined },
    })
    const handle = await runner.start({
      ticketId: 't', assignmentId: 'a', personaId: 'nina', cwd: 'C:/tmp',
      prompt: 'hi', model: 'deepseek-chat',
    })
    const events = await collect(runner.stream(handle))
    expect(events.some(item => item.type === 'delta' && item.text === 'He')).toBe(true)
    expect(events.some(item => item.type === 'partial' && item.text === 'Hello')).toBe(true)
    expect(events.at(-1)).toMatchObject({ type: 'ended', report: { state: 'ready' } })
    expect(seen[0]).toMatch(/^POST Bearer /u)
    expect(JSON.stringify(events)).not.toContain(SECRET)
    expect(String(events)).not.toContain(SECRET)
  })

  it('throws not_logged_in when the vault has no key', async () => {
    await expect(resolveRunner({
      spec: { kind: 'dsh', model: 'deepseek-chat' },
      permissionMode: 'deny',
      vault: { get: async () => undefined },
      personId: 'nina',
    })).rejects.toMatchObject({ code: 'not_logged_in' })
  })

  it('createHttpDshAgent reports HTTP errors without the key', async () => {
    const server = await listen((_req, res) => {
      res.writeHead(401)
      res.end('nope')
    })
    closers.push(server.close)
    const agent = createHttpDshAgent({
      provider: 'openai-compat',
      apiKey: SECRET,
      baseUrl: server.url,
    })
    const started = await agent.start({
      cwd: 'C:/tmp', model: 'deepseek-chat', prompt: 'hi', history: [],
    })
    const texts: string[] = []
    for await (const event of started.events) {
      if (event.type === 'error') texts.push(event.message)
    }
    expect(texts[0]).toMatch(/HTTP 401/u)
    expect(texts.join('')).not.toContain(SECRET)
  })

  it('copies official cache counters and omits missing cache', () => {
    expect(vendorUsageOf({
      prompt_tokens: 40,
      completion_tokens: 8,
      prompt_cache_hit_tokens: 16,
      prompt_cache_miss_tokens: 4,
    })).toEqual({
      inputTokens: 40,
      outputTokens: 8,
      cacheReadTokens: 16,
      cacheWriteTokens: 4,
    })
    expect(JSON.stringify(vendorUsageOf({ prompt_tokens: 10, completion_tokens: 2 }))).not.toMatch(/cacheReadTokens/u)
  })
})
