/**
 * EFF-1 (Atlas 05/11: it ships ON) proof on the REAL `claude` CLI with a FAKE endpoint on 127.0.0.1 and a dummy API key: ZERO model, nothing can be spent. A persona configured with Opus + maximum
 * effort => the session OAR opens carries `model: opus` and `effort: max` (the CLI's `--model opus --effort max`) and the request the CLI then sends names that model and effort; a persona with NO choice
 * ("Padrão do motor") => nothing is fixed (no model, no effort); a chosen model the engine does not offer => the call runs on the default and the usage says which model was dropped. The ledger
 * columns are the host's (Anvil); what the runner hands them is `usage.modelRequested / effortRequested / modelDropped` (+ `effortDropped`).
 *
 *   node --import tsx/esm packages/persona/persona-runners/scripts/eff1-dry.ts [--out <file.json>]
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SessionOptions } from '@botiverse/oar'
import { disposeRunnerSessions, resetProbeCache, resolveRunner, type PersonaRunnerSpec } from '../src/index.ts'

interface Seen { requests: number; model?: string | undefined; keys: string[]; effort?: unknown; thinking?: unknown }

async function fakeAnthropic(seen: Seen): Promise<{ readonly close: () => void; readonly port: number }> {
  const { createServer } = await import('node:http')
  const server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => { chunks.push(chunk) })
    req.on('end', () => {
      const path = (req.url ?? '').split('?')[0] ?? ''
      if (!path.endsWith('/v1/messages')) { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"input_tokens":10}'); return }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as Record<string, unknown>
      seen.requests += 1
      if (seen.requests === 1) {
        seen.model = typeof body.model === 'string' ? body.model : undefined
        seen.keys = Object.keys(body)
        seen.effort = (body.output_config as { effort?: unknown } | undefined)?.effort ?? (body as { effort?: unknown }).effort
        seen.thinking = body.thinking
      }
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      const send = (event: string, data: unknown): void => { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`) }
      send('message_start', { type: 'message_start', message: { id: 'm', type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 1 } } })
      send('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })
      send('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'ok' } })
      send('content_block_stop', { type: 'content_block_stop', index: 0 })
      send('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 2 } })
      send('message_stop', { type: 'message_stop' })
      res.end()
    })
  })
  const port = await new Promise<number>((resolvePort) => { server.listen(0, '127.0.0.1', () => { resolvePort((server.address() as { port: number }).port) }) })
  return { close: () => { server.close(); server.closeAllConnections() }, port }
}

async function once(label: string, spec: PersonaRunnerSpec, work: string): Promise<Record<string, unknown>> {
  resetProbeCache()
  const oar = await import('@botiverse/oar')
  const base = oar.defaultRuntimes.get('claude')
  if (base === undefined) throw new Error('the claude runtime is not available')
  const opened: SessionOptions[] = []
  const original = base.session.bind(base)
  const runtime = Object.assign(Object.create(base) as typeof base, base, {
    session: async (installation: never, options: SessionOptions) => { opened.push(options); return original(installation, options) },
  })
  const seen: Seen = { requests: 0, keys: [] }
  const fake = await fakeAnthropic(seen)
  const saved = { base: process.env.ANTHROPIC_BASE_URL, key: process.env.ANTHROPIC_API_KEY }
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${String(fake.port)}`
  process.env.ANTHROPIC_API_KEY = 'sk-ant-dry-dummy'
  let usage: Record<string, unknown> = {}
  let ended = 'not-run'
  try {
    const runner = await resolveRunner({ spec, permissionMode: 'deny', purpose: 'task', runtime, env: { ...process.env } })
    const handle = await runner.start({ ticketId: 't1', assignmentId: 'a1', personaId: 'nina', cwd: work, prompt: 'oi', model: spec.kind === 'cli' ? spec.model : 'default', permissionMode: 'deny' })
    for await (const event of runner.stream(handle)) if (event.type === 'ended') ended = `${event.report.state}`
    const u = await runner.usage(handle)
    usage = { modelRequested: u.modelRequested ?? null, effortRequested: u.effortRequested ?? null, modelDropped: u.modelDropped ?? null, effortDropped: u.effortDropped ?? null, envMode: u.envMode ?? null }
    await runner.dispose?.()
  } finally {
    if (saved.base === undefined) delete process.env.ANTHROPIC_BASE_URL
    else process.env.ANTHROPIC_BASE_URL = saved.base
    if (saved.key === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = saved.key
    fake.close()
    try { await disposeRunnerSessions() } catch (error) { void error }
  }
  const options = opened[0] as (SessionOptions & { effort?: string }) | undefined
  return {
    label, spec: spec.kind === 'cli' ? { model: spec.model, effort: spec.effort ?? null } : null,
    sessionOptionsHandedToOar: options === undefined ? null : { model: options.model ?? null, effort: options.effort ?? null },
    requestTheCliSent: { model: seen.model ?? null, effort: seen.effort ?? null, thinking: seen.thinking ?? null, keys: seen.keys },
    usage, ended,
  }
}

async function main(): Promise<void> {
  const work = mkdtempSync(join(tmpdir(), 'persona-eff1-'))
  try {
    const rows = [
      await once('Opus + Máximo', { kind: 'cli', cli: 'claude', model: 'opus', effort: 'max' }, work),
      await once('Sonnet + Alto', { kind: 'cli', cli: 'claude', model: 'sonnet', effort: 'high' }, work),
      await once('Padrão do motor (sem escolha)', { kind: 'cli', cli: 'claude', model: 'default' }, work),
      await once('Modelo que o motor não oferece', { kind: 'cli', cli: 'claude', model: 'opus-9-9-nao-existe', effort: 'high' }, work),
    ]
    for (const row of rows) process.stdout.write(`${JSON.stringify(row)}\n`)
    const out = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : undefined
    if (out !== undefined) writeFileSync(out, `${JSON.stringify({ at: new Date().toISOString(), rows }, null, 2)}\n`)
  } finally {
    try { rmSync(work, { recursive: true, force: true }) } catch (error) { void error }
  }
}

await main()
