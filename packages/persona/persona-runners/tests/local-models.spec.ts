import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import {
  LOCAL_LABEL,
  detectLocalProviders,
  resetConnectionCache,
  resolveRunner,
  toUiConnection,
  type RunEvent,
} from '../src/index.ts'

async function collect(events: AsyncIterable<RunEvent>): Promise<RunEvent[]> {
  const out: RunEvent[] = []
  for await (const event of events) out.push(event)
  return out
}

function listen(models: string[]): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.url?.endsWith('/models') === true) {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ data: models.map(id => ({ id })) }))
      return
    }
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.write('data: {"choices":[{"delta":{"content":"oi"}}]}\n\n')
    res.write('data: [DONE]\n\n')
    res.end()
  })
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

describe('local OpenAI-compat models', () => {
  const closers: Array<() => Promise<void>> = []
  afterEach(async () => {
    resetConnectionCache()
    while (closers.length > 0) await closers.pop()?.()
  })

  it('lists Ollama models as local, sem custo', async () => {
    const server = await listen(['llama3.2', 'qwen2.5'])
    closers.push(server.close)
    const cards = await detectLocalProviders({
      fetch,
      ollama: server.url,
      lmstudio: 'http://127.0.0.1:9/v1',
      timeoutMs: 500,
    })
    const ollama = cards.find(item => item.id === 'ollama')
    expect(ollama).toMatchObject({
      installed: true,
      label: LOCAL_LABEL,
      models: ['llama3.2', 'qwen2.5'],
    })
    expect(cards.find(item => item.id === 'lmstudio')?.installed).toBe(false)
  })

  it('resolveRunner talks to Ollama without a vault key', async () => {
    const server = await listen(['llama3.2'])
    closers.push(server.close)
    const runner = await resolveRunner({
      spec: { kind: 'dsh', model: 'llama3.2', provider: 'ollama', baseUrl: server.url },
      permissionMode: 'deny',
      fetch,
      infra: { wait: async () => undefined },
    })
    const handle = await runner.start({
      ticketId: 't',
      assignmentId: 'a',
      personaId: 'nina',
      cwd: 'C:/tmp',
      prompt: 'oi',
      model: 'llama3.2',
      permissionMode: 'deny',
    })
    const events = await collect(runner.stream(handle))
    expect(events.some(event => event.type === 'delta' && event.text.includes('oi'))).toBe(true)
  })

  it('labels a local card for the UI', () => {
    const row = toUiConnection({
      id: 'ollama',
      kind: 'local',
      installed: true,
      loggedIn: true,
      models: ['phi'],
      costLabel: LOCAL_LABEL,
      loginHint: LOCAL_LABEL,
    })
    expect(row.loginHint).toBe(LOCAL_LABEL)
    expect(row.available).toBe(true)
  })
})
