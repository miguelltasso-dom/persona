/**
 * What does ONE image really cost a call? Two calls on the cheap model through the product's own runner (the same one the host uses),
 * identical text, the first WITHOUT an image and the second WITH a 1500×1000 PNG. The vendor-reported input of each call is read from the
 * session (main loop and total, cache read/write kept apart) and the difference is the image. Atlas authorised exactly these two calls
 * (04/11 22:40): ceiling 2, no repetition without a new OK, no connector, no tool.
 *
 *   dry (zero spend, validates the whole harness against a local fake Anthropic endpoint and a blank HOME):
 *     node --import tsx/esm packages/persona/persona-runners/scripts/image-cost-real.ts --fake [--out <file.json>]
 *   preflight (real guards + proof of the isolation, stops before any model call): add --preflight inside the real lock
 *   REAL (inside the real lock, limiter ON with a fresh absolute ledger):
 *     PERSONA_REAL_E2E=1 PERSONA_REAL_TURN_CAP=2 PERSONA_REAL_TURN_LEDGER=<absolute fresh path> \
 *       node scripts/persona/with-lock.mjs "tally-image-cost" --lock real -- node --import tsx/esm .../image-cost-real.ts
 *
 * Guards in real mode (any missing ⇒ nothing is spent): the real lock, PERSONA_REAL_E2E=1, a cap of exactly 2, an absolute ledger that does
 * not exist yet, no VITEST / PERSONA_SCRIPTED in the environment, and the `answer-only` isolation PROVEN for this CLI version (otherwise the
 * calls would carry the person's whole environment: the run stops before any model call).
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defaultIsolationRuntime, disposeRunnerSessions, resolveRunner, type RunnerUsage } from '../src/index.ts'
import { bandedPng } from './png-fixture.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const CALL_MS = 5 * 60_000
const WIDTH = 1500
const HEIGHT = 1000
/** The same text in both calls, so the difference between them is the image and nothing else. */
const PROMPT = 'Descreva em uma frase curta o que aparece na imagem anexa. Se não houver imagem, diga isso em uma frase.'
const FAKE = process.argv.includes('--fake')
/** Runs every guard and the proof of the isolation, then stops BEFORE any model call (spends nothing). */
const PREFLIGHT = process.argv.includes('--preflight')

function argOf(name: string): string | undefined {
  const at = process.argv.indexOf(name)
  return at >= 0 ? process.argv[at + 1] : undefined
}

/** Everything the real run needs before it may start a single paid turn. Throws with the first thing missing. */
function assertRealGuards(env: NodeJS.ProcessEnv): { readonly ledger: string } {
  if (env.PERSONA_LOCK !== 'real') throw new Error('real mode must run inside the real lock: with-lock.mjs "<name>" --lock real -- <cmd>')
  if (env.PERSONA_REAL_E2E !== '1') throw new Error('real mode needs PERSONA_REAL_E2E=1')
  if (env.PERSONA_REAL_TURN_CAP !== '2') throw new Error('real mode needs PERSONA_REAL_TURN_CAP=2 exactly (Atlas: ceiling of 2 calls)')
  const ledger = env.PERSONA_REAL_TURN_LEDGER
  if (ledger === undefined || ledger === '' || !isAbsolute(ledger)) throw new Error('real mode needs PERSONA_REAL_TURN_LEDGER as an absolute path')
  if (existsSync(ledger)) throw new Error('the ledger must be FRESH: this file already exists, so a previous run may have spent calls (a repeat needs a new OK from Atlas)')
  if (env.VITEST !== undefined || env.PERSONA_SCRIPTED !== undefined) throw new Error('clean environment required: VITEST / PERSONA_SCRIPTED must not be set')
  return { ledger }
}

// ---- fake endpoint (dry mode only) ------------------------------------------------------------------------------------

function startFake(): Promise<{ readonly server: Server; readonly port: number }> {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => { chunks.push(chunk) })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      let body: Record<string, unknown> = {}
      try { body = raw === '' ? {} : JSON.parse(raw) as Record<string, unknown> } catch { body = {} }
      const path = (req.url ?? '').split('?')[0] ?? ''
      if (path.endsWith('/count_tokens')) {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ input_tokens: Math.ceil(raw.length / 4) }))
        return
      }
      if (!path.endsWith('/v1/messages')) { res.writeHead(404, { 'content-type': 'application/json' }); res.end('{}'); return }
      const message = {
        id: 'msg_fake', type: 'message', role: 'assistant', model: typeof body.model === 'string' ? body.model : 'fake', content: [] as unknown[], stop_reason: null, stop_sequence: null,
        usage: { input_tokens: Math.ceil(raw.length / 4), output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      }
      if (body.stream !== true) {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ...message, content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' }))
        return
      }
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
      const send = (event: string, data: unknown): void => { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`) }
      send('message_start', { type: 'message_start', message })
      send('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })
      send('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'ok' } })
      send('content_block_stop', { type: 'content_block_stop', index: 0 })
      send('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 4 } })
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

// ---- the two calls ----------------------------------------------------------------------------------------------------

interface CallResult {
  readonly label: 'sem-imagem' | 'com-imagem'
  readonly ended: boolean
  readonly text: string
  readonly ms: number
  readonly usage: RunnerUsage
}

async function oneCall(label: CallResult['label'], cwd: string, images: readonly { path: string }[] | undefined): Promise<CallResult> {
  const started = Date.now()
  const runner = await resolveRunner({ spec: { kind: 'cli', cli: 'claude', model: 'haiku' }, permissionMode: 'deny', autonomy: 'act', purpose: 'talk' })
  let ended = false
  let text = ''
  let usage: RunnerUsage = { inputTokens: 0, outputTokens: 0 }
  try {
    const handle = await runner.start({
      personaId: label === 'sem-imagem' ? 'img-base' : 'img-with', ticketId: 'image-cost', assignmentId: `image-cost-${label}`, cwd, model: 'haiku', permissionMode: 'deny', prompt: PROMPT,
      ...(images === undefined ? {} : { images }),
    })
    const consume = (async (): Promise<void> => {
      for await (const event of runner.stream(handle)) {
        if (event.type === 'delta') text += event.text
        if (event.type === 'ended') ended = true
      }
    })()
    await Promise.race([consume, new Promise<void>((_, reject) => { setTimeout(() => { reject(new Error('call timeout')) }, CALL_MS) })])
    usage = await runner.usage(handle)
  } finally {
    try { await runner.dispose?.() } catch (error) { void error }
    try { await disposeRunnerSessions() } catch (error) { void error }
  }
  return { label, ended, text: text.trim().slice(0, 300), ms: Date.now() - started, usage }
}

const num = (value: number | undefined): number | null => (value === undefined ? null : value)

function summary(call: CallResult): Record<string, unknown> {
  const u = call.usage
  return {
    label: call.label, ended: call.ended, ms: call.ms, reply: call.text,
    inputTokens: u.inputTokens, outputTokens: u.outputTokens, cacheReadTokens: num(u.cacheReadTokens), cacheWriteTokens: num(u.cacheWriteTokens),
    mainLoopInputTokens: num(u.mainLoopInputTokens), mainLoopOutputTokens: num(u.mainLoopOutputTokens),
    envMode: u.envMode ?? null, envModeRequested: u.envModeRequested ?? null, environment: u.environment ?? null,
  }
}

async function main(): Promise<void> {
  const out = argOf('--out')
  const work = mkdtempSync(join(tmpdir(), 'persona-imagecost-'))
  const cwd = join(work, 'cwd')
  mkdirSync(cwd, { recursive: true })
  const image = join(work, 'imagem.png')
  const bytes = bandedPng(WIDTH, HEIGHT, [[120, 180, 235], [120, 180, 235], [70, 160, 80]])
  writeFileSync(image, bytes)
  const saved = { ...process.env }
  let server: Server | undefined
  let ledger: string
  if (FAKE) {
    const home = join(work, 'home')
    mkdirSync(join(home, '.claude'), { recursive: true })
    const fake = await startFake()
    server = fake.server
    ledger = join(work, 'ledger.json')
    Object.assign(process.env, {
      HOME: home, USERPROFILE: home, APPDATA: join(home, 'AppData'), LOCALAPPDATA: join(home, 'AppData', 'Local'),
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${String(fake.port)}`, ANTHROPIC_API_KEY: 'sk-ant-imagecost-dummy-key',
      PERSONA_REAL_TURN_CAP: '2', PERSONA_REAL_TURN_LEDGER: ledger,
    })
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN
  } else {
    ledger = assertRealGuards(process.env).ledger
  }
  process.env.PERSONA_CLI_ENV = 'answer-only'
  try {
    // The mode must be PROVEN for this CLI version before any paid call: otherwise the calls would carry the person's whole environment.
    let version = 'fake'
    let proven = FAKE
    if (!FAKE) {
      const oar = await import('@botiverse/oar')
      const runtime = oar.defaultRuntimes.get('claude')
      const installation = runtime?.installation === undefined ? undefined : await runtime.installation()
      if (installation === undefined || installation.kind !== 'available' || installation.via !== 'executable') throw new Error('the claude executable is not available; nothing was spent')
      version = installation.version ?? 'unknown'
      const iso = defaultIsolationRuntime(installation.command)
      await iso.warm({ version, mode: 'answer-only', modelArg: 'haiku', env: process.env })
      const decision = iso.decide({ cli: 'claude', call: 'answer', modelArg: 'haiku', version, env: process.env })
      proven = decision.effectiveMode === 'answer-only'
      if (!proven) throw new Error(`answer-only is not proven for claude ${version} (${decision.reason}); stopped BEFORE any model call, nothing was spent`)
    }
    process.stdout.write(`isolation: answer-only ${proven ? 'proven' : 'NOT proven'} for claude ${version}; ceiling 2 calls; ledger ${FAKE ? '(dry)' : 'fresh'}\n`)

    if (PREFLIGHT) {
      process.stdout.write('preflight OK: guards passed, isolation proven; stopped before any model call (nothing spent)\n')
      return
    }
    const base = await oneCall('sem-imagem', cwd, undefined)
    process.stdout.write(`call 1 (sem imagem): ended=${String(base.ended)} mode=${base.usage.envMode ?? '?'} input=${String(base.usage.inputTokens)} mainLoop=${String(base.usage.mainLoopInputTokens ?? 'n/d')} output=${String(base.usage.outputTokens)}\n`)
    // The second call only happens if the first one produced a measurement: a call that failed must not be silently retried (no repetition without a new OK).
    if (!base.ended) throw new Error('call 1 did not end; stopped (no repetition without a new OK)')
    const withImage = await oneCall('com-imagem', cwd, [{ path: image }])
    process.stdout.write(`call 2 (com imagem): ended=${String(withImage.ended)} mode=${withImage.usage.envMode ?? '?'} input=${String(withImage.usage.inputTokens)} mainLoop=${String(withImage.usage.mainLoopInputTokens ?? 'n/d')} output=${String(withImage.usage.outputTokens)}\n`)

    const mainDiff = base.usage.mainLoopInputTokens !== undefined && withImage.usage.mainLoopInputTokens !== undefined ? withImage.usage.mainLoopInputTokens - base.usage.mainLoopInputTokens : undefined
    const totalDiff = withImage.usage.inputTokens - base.usage.inputTokens
    const ledgerCalls = existsSync(ledger) ? (JSON.parse(readFileSync(ledger, 'utf8')) as unknown) : null
    const result = {
      note: FAKE ? 'DRY RUN against a local fake endpoint: the numbers are meaningless, only the harness is validated' : 'REAL: two calls on haiku, answer-only, vendor-reported counters; Atlas authorised 04/11 22:40 (ceiling 2)',
      real: !FAKE, claudeVersion: version, model: 'haiku', image: { width: WIDTH, height: HEIGHT, bytes: bytes.length, type: 'image/png' },
      calls: [summary(base), summary(withImage)],
      image_tokens_measured: { mainLoopInputDifference: mainDiff ?? null, totalInputDifference: totalDiff },
      sameMode: base.usage.envMode === withImage.usage.envMode, ledger: ledgerCalls,
    }
    if (out !== undefined) writeFileSync(resolve(root, out), `${JSON.stringify(result, null, 2)}\n`)
    process.stdout.write(`image difference: main loop ${String(mainDiff ?? 'n/d')} · total ${String(totalDiff)} tokens (same mode: ${String(result.sameMode)})\n`)
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key]
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
    server?.close()
    try { rmSync(work, { recursive: true, force: true }) } catch (error) { void error }
  }
}

main().then(() => { process.exit(0) }).catch((error: unknown) => {
  process.stderr.write(`image-cost-real stopped: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
