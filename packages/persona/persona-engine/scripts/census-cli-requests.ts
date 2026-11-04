/**
 * OPT-10 census: how many model requests does ONE Persona call make inside the CLI? (D-080 d)
 *
 * NO real model call, NO quota, NO spend. The installed `claude` is started by the product's own `resolveRunner` (the same
 * OAR session the host uses), but pointed at a LOCAL fake Anthropic endpoint (`ANTHROPIC_BASE_URL`) with a dummy API key and
 * a throw-away HOME / config dir (no login, no MCP servers, no skills of the person). The fake answers a short text and LOGS every
 * request it receives: path, model, system size, tools, and the head of the last user message. Auxiliary requests the CLI makes by
 * itself (titles, suggestions, token counts, hooks...) show up as extra lines.
 *
 * Limits (said in the report): a blank config has no connectors/MCP/skills, so the SIZE of the base here is not the person's
 * (use the single-request real base for that); and auxiliary requests that exist only for a subscription login are not made with
 * an API key. What it does tell: which requests the CLI makes by itself on every call, and in what order.
 *
 * node --import tsx/esm packages/persona/persona-engine/scripts/census-cli-requests.ts [--variant name=ENV=VALUE,ENV2=VALUE2 ...]
 * Writes persona-spec/reports/opt10-census.json and prints a table.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const CALL_MS = 90_000
/** Wait after the turn ends for requests the CLI makes AFTER the answer (title, suggestions, memory...). */
const TRAILING_MS = 6_000

interface Seen {
  readonly at: number
  readonly method: string
  readonly path: string
  readonly model: string
  readonly stream: boolean
  readonly systemChars: number
  readonly messages: number
  readonly tools: number
  readonly maxTokens: number | null
  readonly lastUser: string
  readonly bodyBytes: number
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map(part => (typeof part === 'object' && part !== null && 'text' in part && typeof (part as { text: unknown }).text === 'string' ? (part as { text: string }).text : ''))
    .join(' ')
}

function startFake(log: Seen[], clock: () => number): Promise<{ readonly server: Server; readonly port: number }> {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => { chunks.push(chunk) })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      let body: Record<string, unknown> = {}
      try { body = raw === '' ? {} : JSON.parse(raw) as Record<string, unknown> } catch { body = {} }
      const url = req.url ?? ''
      const path = url.split('?')[0] ?? url
      const messages = Array.isArray(body.messages) ? body.messages as { role?: string; content?: unknown }[] : []
      const lastUser = [...messages].reverse().find(row => row.role === 'user')
      const model = typeof body.model === 'string' ? body.model : ''
      const stream = body.stream === true
      log.push({
        at: clock(), method: req.method ?? '', path, model, stream,
        systemChars: textOf(body.system).length, messages: messages.length,
        tools: Array.isArray(body.tools) ? body.tools.length : 0,
        maxTokens: typeof body.max_tokens === 'number' ? body.max_tokens : null,
        lastUser: textOf(lastUser?.content).replace(/\s+/g, ' ').slice(0, 110),
        bodyBytes: raw.length,
      })
      if (path.endsWith('/count_tokens')) {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ input_tokens: Math.ceil(raw.length / 4) }))
        return
      }
      if (!path.endsWith('/v1/messages')) {
        res.writeHead(404, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ type: 'error', error: { type: 'not_found_error', message: 'census fake: unknown path' } }))
        return
      }
      const inputTokens = Math.ceil(raw.length / 4)
      const message = {
        id: `msg_census_${String(log.length)}`, type: 'message', role: 'assistant', model: model === '' ? 'census-model' : model,
        content: [] as unknown[], stop_reason: null, stop_sequence: null,
        usage: { input_tokens: inputTokens, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      }
      if (!stream) {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ...message, content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', usage: { ...message.usage, output_tokens: 2 } }))
        return
      }
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
      const send = (event: string, data: unknown): void => { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`) }
      send('message_start', { type: 'message_start', message })
      send('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })
      send('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'ok' } })
      send('content_block_stop', { type: 'content_block_stop', index: 0 })
      send('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 2 } })
      send('message_stop', { type: 'message_stop' })
      res.end()
    })
  })
  return new Promise((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') { reject(new Error('no port')); return }
      resolveListen({ server, port: address.port })
    })
  })
}

interface CallReport {
  readonly variant: string
  readonly call: string
  readonly purpose: 'talk' | 'task'
  readonly requests: readonly (Seen & { readonly sinceStartMs: number; readonly afterEndMs: number | null })[]
  readonly modelRequests: number
  readonly otherRequests: number
  readonly reportedInput: number | null
  readonly reportedOutput: number | null
  readonly ended: boolean
}

function parseVariants(argv: readonly string[]): { readonly name: string; readonly env: Readonly<Record<string, string>> }[] {
  const out: { name: string; env: Record<string, string> }[] = [{ name: 'default', env: {} }]
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== '--variant') continue
    const spec = argv[index + 1] ?? ''
    const [name, ...pairs] = spec.split('=')
    const env: Record<string, string> = {}
    // name=KEY=VALUE,KEY2=VALUE2 — the first '=' ends the name
    const rest = [pairs.join('=')].join('')
    for (const item of rest.split(',')) {
      const at = item.indexOf('=')
      if (at > 0) env[item.slice(0, at)] = item.slice(at + 1)
    }
    if (name !== undefined && name !== '') out.push({ name, env })
  }
  return out
}

async function main(): Promise<void> {
  const variants = parseVariants(process.argv.slice(2))
  const runners = await import('@deepseek-ai/dsh-persona-runners')
  const reports: CallReport[] = []
  const home = mkdtempSync(join(tmpdir(), 'persona-census-home-'))
  const cwd = mkdtempSync(join(tmpdir(), 'persona-census-cwd-'))
  mkdirSync(join(home, '.claude'), { recursive: true })
  const saved = { ...process.env }
  const t0 = Date.now()
  const log: Seen[] = []
  const { server, port } = await startFake(log, () => Date.now() - t0)
  try {
    for (const variant of variants) {
      for (const purpose of ['talk', 'task'] as const) {
        log.length = 0
        // A fresh process env per call: the runner pool must not carry a session from a previous variant.
        Object.assign(process.env, {
          HOME: home, USERPROFILE: home, APPDATA: join(home, 'AppData'), LOCALAPPDATA: join(home, 'AppData', 'Local'),
          ANTHROPIC_BASE_URL: `http://127.0.0.1:${String(port)}`, ANTHROPIC_API_KEY: 'sk-ant-census-dummy-key',
          ...variant.env,
        })
        delete process.env.CLAUDE_CODE_OAUTH_TOKEN
        const inner = await runners.resolveRunner({
          spec: { kind: 'cli', cli: 'claude', model: 'haiku' },
          permissionMode: purpose === 'talk' ? 'deny' : 'allow-once',
          ...(purpose === 'task' ? { tools: { files: 'write' as const, shell: 'read' as const, web: 'none' as const } } : {}),
          autonomy: 'act',
          purpose,
          accountHome: join(home, '.claude'),
        })
        const started = Date.now() - t0
        let endedAt: number | null = null
        let input: number | null = null
        let output: number | null = null
        let ended = false
        try {
          const handle = await inner.start({
            ticketId: `census-${variant.name}-${purpose}`,
            assignmentId: `census-${variant.name}-${purpose}-1`,
            personaId: `census-${variant.name}-${purpose}`,
            cwd,
            prompt: purpose === 'talk' ? 'Qual o horário do standup?' : 'Implemente o filtro de pedidos.',
            model: 'haiku',
            permissionMode: purpose === 'talk' ? 'deny' : 'allow-once',
          })
          const consume = (async (): Promise<void> => {
            for await (const event of inner.stream(handle)) {
              if (event.type === 'ended') { ended = true; endedAt = Date.now() - t0 }
            }
          })()
          await Promise.race([
            consume,
            new Promise<void>((_, reject) => { setTimeout(() => { reject(new Error('call timeout')) }, CALL_MS) }),
          ])
          await new Promise<void>((done) => { setTimeout(done, TRAILING_MS) })
          try {
            const usage = await inner.usage(handle)
            input = usage.inputTokens
            output = usage.outputTokens
          } catch (error) { void error }
        } catch (error) {
          process.stdout.write(`  ${variant.name}/${purpose}: ${error instanceof Error ? error.message : String(error)}\n`)
        } finally {
          try { await inner.dispose?.() } catch (error) { void error }
          try { await runners.disposeRunnerSessions() } catch (error) { void error }
        }
        const rows = log.map(row => ({ ...row, sinceStartMs: row.at - started, afterEndMs: endedAt === null ? null : row.at - endedAt }))
        reports.push({
          variant: variant.name, call: purpose === 'talk' ? 'conversa (deny, sem ferramentas)' : 'tarefa (allow-once, com ferramentas)', purpose,
          requests: rows,
          modelRequests: rows.filter(row => row.path.endsWith('/v1/messages')).length,
          otherRequests: rows.filter(row => !row.path.endsWith('/v1/messages')).length,
          reportedInput: input, reportedOutput: output, ended,
        })
        for (const key of Object.keys(variant.env)) delete process.env[key]
      }
    }
  } finally {
    server.close()
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key]
    Object.assign(process.env, saved)
    for (const dir of [home, cwd]) {
      try { rmSync(dir, { recursive: true, force: true }) } catch (error) { void error }
    }
  }
  for (const row of reports) {
    process.stdout.write(`\n[${row.variant}] ${row.call}: ${String(row.modelRequests)} requisicoes de modelo + ${String(row.otherRequests)} outras; ended=${String(row.ended)}; OAR reportou in=${String(row.reportedInput ?? 'n/d')} out=${String(row.reportedOutput ?? 'n/d')}\n`)
    for (const seen of row.requests) {
      process.stdout.write(`   +${String(seen.sinceStartMs)}ms ${seen.method} ${seen.path} model=${seen.model || '-'} stream=${String(seen.stream)} sys=${String(seen.systemChars)}ch msgs=${String(seen.messages)} tools=${String(seen.tools)} max=${String(seen.maxTokens ?? '-')} body=${String(seen.bodyBytes)}B  "${seen.lastUser.slice(0, 70)}"\n`)
    }
  }
  const outFile = join(root, 'persona-spec', 'reports', 'opt10-census.json')
  writeFileSync(outFile, `${JSON.stringify({ note: 'fake local Anthropic endpoint; no real model call; blank HOME', reports }, null, 2)}\n`)
  process.stdout.write(`\ngravado ${outFile}\n`)
}

main().then(() => { process.exit(0) }).catch((error: unknown) => {
  process.stderr.write(`census failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`)
  process.exit(1)
})
