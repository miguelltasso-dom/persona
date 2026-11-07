/**
 * TEAM-5 dry proof (D-090 #4): does a persona really SEE an image the host attached to its turn? And does the product refuse, in human
 * words and before any request is made, a turn whose images cannot go?
 *
 * NO real model call, NO quota, NO spend. The installed `claude` is started by the product's own `resolveRunner` (the same OAR session the
 * host uses) but pointed at a LOCAL fake Anthropic endpoint (`ANTHROPIC_BASE_URL`) with a dummy key and a throw-away HOME. The fake records
 * the content blocks of the last user message the CLI sends; what is measured is the transport, not a model.
 *
 * Scenarios:
 *   one-image    the turn carries a PNG: the request has an image block (base64, `image/png`) whose bytes are EXACTLY the file's, in the same
 *                user message as the text, and the file's path is nowhere in the text.
 *   two-images   two images: two image blocks, in order.
 *   not-sticky   a second turn on the SAME warm session without images: the new user message has no image block.
 *   refusals     5 images, an oversize file, a .txt file and a missing file are each refused with the reason and
 *                NOT ONE request reaches the endpoint (no session was opened).
 *
 *   node --import tsx/esm packages/persona/persona-runners/scripts/team5-image-dry.ts [--out <file.json>]
 *
 * Exit 0 only when every scenario matches. Serialise it with the `check` lock like any other job.
 */

import { createHash } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'
import { disposeRunnerSessions, ImagesRefusedError, MAX_IMAGE_BYTES, resolveRunner } from '../src/index.ts'

const CALL_MS = 120_000

/** A valid PNG (solid colour) built by hand: no image library, no fixture file. */
function solidPng(width: number, height: number, rgb: readonly [number, number, number]): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k += 1) c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (bytes: Buffer): number => {
    let c = 0xffffffff
    for (const byte of bytes) c = (crcTable[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type: string, data: Buffer): Buffer => {
    const head = Buffer.alloc(4)
    head.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const tail = Buffer.alloc(4)
    tail.writeUInt32BE(crc(body))
    return Buffer.concat([head, body, tail])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // bit depth
  header[9] = 2 // truecolour
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => [...rgb]).flat())])
  const raw = Buffer.concat(Array.from({ length: height }, () => row))
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

interface SeenImage { readonly mediaType: string; readonly bytes: number; readonly sha256: string }
interface Seen { readonly marker: string; readonly images: readonly SeenImage[]; readonly text: string; readonly order: readonly string[] }

function startFake(log: Seen[], count: { requests: number }): Promise<{ readonly server: Server; readonly port: number }> {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => { chunks.push(chunk) })
    req.on('end', () => {
      count.requests += 1
      const raw = Buffer.concat(chunks).toString('utf8')
      let body: Record<string, unknown> = {}
      try { body = raw === '' ? {} : JSON.parse(raw) as Record<string, unknown> } catch { body = {} }
      const path = (req.url ?? '').split('?')[0] ?? ''
      if (path.endsWith('/count_tokens')) {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ input_tokens: Math.ceil(raw.length / 4) }))
        return
      }
      if (!path.endsWith('/v1/messages')) {
        res.writeHead(404, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ type: 'error', error: { type: 'not_found_error', message: 'team5 fake: unknown path' } }))
        return
      }
      const messages = Array.isArray(body.messages) ? body.messages as { role?: string; content?: unknown }[] : []
      const last = messages.filter(row => row.role === 'user').at(-1)
      const blocks = Array.isArray(last?.content) ? last.content as { type?: string; text?: string; source?: { media_type?: string; data?: string } }[] : []
      const text = blocks.filter(block => block.type === 'text').map(block => block.text ?? '').join(' ')
      const marker = /TEAM5-[A-Z0-9-]+/u.exec(text)?.[0] ?? ''
      if (marker !== '') {
        log.push({
          marker, text,
          order: blocks.map(block => block.type ?? '?'),
          images: blocks.filter(block => block.type === 'image').map((block) => {
            const data = Buffer.from(block.source?.data ?? '', 'base64')
            return { mediaType: block.source?.media_type ?? '', bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') }
          }),
        })
      }
      const message = {
        id: `msg_team5_${String(count.requests)}`, type: 'message', role: 'assistant', model: typeof body.model === 'string' ? body.model : 'team5-model',
        content: [] as unknown[], stop_reason: null, stop_sequence: null,
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

type Inner = Awaited<ReturnType<typeof resolveRunner>>

async function turn(inner: Inner, cwd: string, assignmentId: string, prompt: string, images: readonly { path: string; mediaType?: string }[] | undefined): Promise<{ ended: boolean; text: string }> {
  let ended = false
  let text = ''
  const handle = await inner.start({
    personaId: 'nina', ticketId: 'team5-t', assignmentId, cwd, model: 'haiku', permissionMode: 'deny', prompt,
    ...(images === undefined ? {} : { images }),
  })
  const consume = (async (): Promise<void> => {
    for await (const event of inner.stream(handle)) {
      if (event.type === 'delta') text += event.text
      if (event.type === 'ended') ended = true
    }
  })()
  await Promise.race([consume, new Promise<void>((_, reject) => { setTimeout(() => { reject(new Error('call timeout')) }, CALL_MS) })])
  return { ended, text }
}

interface Row { readonly scenario: string; readonly ok: boolean; readonly why: string }

async function main(): Promise<void> {
  const out = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : undefined
  const home = mkdtempSync(join(tmpdir(), 'persona-team5-home-'))
  const cwd = mkdtempSync(join(tmpdir(), 'persona-team5-cwd-'))
  const files = mkdtempSync(join(tmpdir(), 'persona-team5-files-'))
  mkdirSync(join(home, '.claude'), { recursive: true })
  const redPng = solidPng(48, 32, [220, 40, 40])
  const bluePng = solidPng(24, 24, [40, 60, 220])
  writeFileSync(join(files, 'rascunho.png'), redPng)
  writeFileSync(join(files, 'referencia.png'), bluePng)
  writeFileSync(join(files, 'enorme.png'), Buffer.alloc(MAX_IMAGE_BYTES + 1024))
  writeFileSync(join(files, 'nota.txt'), 'não é imagem')
  const saved = { ...process.env }
  const log: Seen[] = []
  const count = { requests: 0 }
  const { server, port } = await startFake(log, count)
  const rows: Row[] = []
  const sha = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')
  try {
    Object.assign(process.env, {
      HOME: home, USERPROFILE: home, APPDATA: join(home, 'AppData'), LOCALAPPDATA: join(home, 'AppData', 'Local'),
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${String(port)}`, ANTHROPIC_API_KEY: 'sk-ant-team5-dummy-key',
    })
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN
    const inner = await resolveRunner({
      spec: { kind: 'cli', cli: 'claude', model: 'haiku' }, permissionMode: 'deny', autonomy: 'act', purpose: 'talk', accountHome: join(home, '.claude'),
    })
    try {
      // one-image
      const one = await turn(inner, cwd, 'team5-1', 'TEAM5-ONE Dê sua opinião sobre este rascunho.', [{ path: join(files, 'rascunho.png') }])
      const seenOne = log.find(row => row.marker === 'TEAM5-ONE')
      const oneOk = one.ended && seenOne !== undefined && seenOne.images.length === 1 && seenOne.images[0]?.mediaType === 'image/png'
        && seenOne.images[0].sha256 === sha(redPng) && seenOne.images[0].bytes === redPng.length && !seenOne.text.includes(files) && !seenOne.text.includes('rascunho.png')
      rows.push({ scenario: 'one-image', ok: oneOk, why: seenOne === undefined ? 'the endpoint never saw the prompt' : `images=${String(seenOne.images.length)} type=${seenOne.images[0]?.mediaType ?? '-'} bytesEqual=${String(seenOne.images[0]?.sha256 === sha(redPng))} order=${seenOne.order.join('>')} pathInText=${String(seenOne.text.includes(files))}` })

      // two-images
      const two = await turn(inner, cwd, 'team5-2', 'TEAM5-TWO Compare os dois.', [{ path: join(files, 'rascunho.png') }, { path: join(files, 'referencia.png') }])
      const seenTwo = log.find(row => row.marker === 'TEAM5-TWO')
      const twoOk = two.ended && seenTwo !== undefined && seenTwo.images.length === 2 && seenTwo.images[0]?.sha256 === sha(redPng) && seenTwo.images[1]?.sha256 === sha(bluePng)
      rows.push({ scenario: 'two-images', ok: twoOk, why: seenTwo === undefined ? 'the endpoint never saw the prompt' : `images=${String(seenTwo.images.length)} inOrder=${String(seenTwo.images[0]?.sha256 === sha(redPng) && seenTwo.images[1]?.sha256 === sha(bluePng))}` })

      // not-sticky: the warm session's NEXT user message carries no image
      const three = await turn(inner, cwd, 'team5-3', 'TEAM5-THREE Só texto agora.', undefined)
      const seenThree = log.find(row => row.marker === 'TEAM5-THREE')
      rows.push({ scenario: 'not-sticky', ok: three.ended && seenThree !== undefined && seenThree.images.length === 0, why: seenThree === undefined ? 'the endpoint never saw the prompt' : `images=${String(seenThree.images.length)}` })

      // refusals: nothing reaches the endpoint
      const before = count.requests
      const refusals: [string, readonly { path: string }[], string][] = [
        ['count', Array.from({ length: 5 }, () => ({ path: join(files, 'rascunho.png') })), 'count'],
        ['size', [{ path: join(files, 'enorme.png') }], 'size'],
        ['type', [{ path: join(files, 'nota.txt') }], 'type'],
        ['unreadable', [{ path: join(files, 'nao-existe.png') }], 'unreadable'],
      ]
      for (const [name, images, reason] of refusals) {
        let got = ''
        try { await turn(inner, cwd, `team5-r-${name}`, `TEAM5-REFUSE-${name.toUpperCase()}`, images) } catch (error) {
          got = error instanceof ImagesRefusedError ? `${error.reason}|${error.message}` : `other:${error instanceof Error ? error.message : String(error)}`
        }
        const ok = got.startsWith(`${reason}|`) && count.requests === before && !got.includes(files)
        rows.push({ scenario: `refuse-${name}`, ok, why: got === '' ? 'was NOT refused' : `${got}; requestsAfter=${String(count.requests - before)}` })
      }
    } finally {
      try { await inner.dispose?.() } catch (error) { void error }
      try { await disposeRunnerSessions() } catch (error) { void error }
    }
  } finally {
    for (const key of ['HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_API_KEY'] as const) {
      const value = saved[key]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    server.close()
    for (const dir of [home, cwd, files]) { try { rmSync(dir, { recursive: true, force: true }) } catch (error) { void error } }
  }
  for (const row of rows) process.stdout.write(`${row.ok ? 'OK  ' : 'FAIL'} ${row.scenario}: ${row.why}\n`)
  const ok = rows.length > 0 && rows.every(row => row.ok)
  if (out !== undefined && out !== '') {
    writeFileSync(out, `${JSON.stringify({ note: 'TEAM-5 dry proof: real claude CLI through the product resolveRunner, fake Anthropic endpoint, zero model, zero spend; bytes compared by sha256, no content printed', ok, rows }, null, 2)}\n`)
  }
  process.stdout.write(`${ok ? 'IMAGES REACH THE MODEL' : 'IMAGE TRANSPORT NOT PROVEN'} (${String(rows.filter(row => row.ok).length)}/${String(rows.length)})\n`)
  process.exit(ok ? 0 : 1)
}

main().catch((error: unknown) => {
  process.stderr.write(`team5-image-dry failed: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
