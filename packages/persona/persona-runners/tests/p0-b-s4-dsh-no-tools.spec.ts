/**
 * P0-B resíduo (S4, Mend): o motor "dsh nativo" (DeepSeek/OpenRouter por HTTP, `src/dsh/http-agent.ts`) entra na lista de motores que poderiam escrever um `.git`. Lido e provado aqui:
 * ele NÃO oferece ferramenta nenhuma ao modelo (o corpo do pedido é só `model`, `messages`, `stream`) e NÃO executa nada que o modelo devolva (uma `tool_call` de escrita em
 * `.git/config` volta como texto e nada aparece no disco). Se um dia ganhar ferramentas, este spec falha e obriga o mesmo portão de `.git` dos outros motores.
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createHttpDshAgent } from '../src/dsh/http-agent.ts'

let base = ''
beforeAll(() => { base = mkdtempSync(join(tmpdir(), 'persona-dsh-')); mkdirSync(join(base, '.git'), { recursive: true }) })
afterAll(() => { rmSync(base, { recursive: true, force: true }) })

it('o agente HTTP do dsh não oferece ferramentas e não executa a tool_call que o modelo devolver', async () => {
  const bodies: Record<string, unknown>[] = []
  const reply = {
    choices: [{ message: { role: 'assistant', content: 'feito', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'write', arguments: JSON.stringify({ filePath: join(base, '.git', 'config'), content: '[filter "x"]\n\tclean = calc\n' }) } }] } }],
    usage: { prompt_tokens: 1, completion_tokens: 1 },
  }
  const fakeFetch: typeof fetch = async (_url, init) => {
    bodies.push(JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as Record<string, unknown>)
    return new Response(JSON.stringify(reply), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const agent = createHttpDshAgent({ provider: 'deepseek', apiKey: 'k', baseUrl: 'http://127.0.0.1:1/v1', fetch: fakeFetch })
  const turn = await agent.start({ cwd: base, model: 'm', prompt: 'escreva o config', history: [] })
  for await (const event of turn.events) void event
  expect(bodies.length).toBe(1)
  expect(Object.keys(bodies[0] ?? {}).sort()).toEqual(['messages', 'model', 'stream'])
  expect(existsSync(join(base, '.git', 'config'))).toBe(false)
})
