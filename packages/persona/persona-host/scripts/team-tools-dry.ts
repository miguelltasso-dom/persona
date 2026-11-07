/**
 * D-090 dry proof (Atlas, 05/11): do REAL personas use the team behaviors through the product tools — `ask_colleague`, `pass_forward`,
 * `review_verdict` — on the HT-0 path, only when the request needs them, with the person's mandate?
 *
 * NO real model call, NO quota, NO spend. A real PersonaHost (temp SQLite home, no VITEST, the product defaults ON) runs its Tasks on the
 * REAL installed `claude` CLI through the product's own runner stack (OAR session + the HT-0 gateway), pointed at a LOCAL fake Anthropic
 * endpoint (`ANTHROPIC_BASE_URL`, dummy key, throw-away HOME). The fake is a script: it logs the tool names the CLI offers the model on every
 * request, and answers with a `tool_use` of the team tool the scenario calls for (or plain text). What is measured is the product, not a model.
 *
 * Scenarios, in one host and one thread:
 *   ask      "@Bia … e peça ao Teo a arte": Bia is offered `ask_colleague` (the words ask for it), calls it; Teo's Task opens with her mandate and
 *            the bilhete; Bia waits; Teo delivers; Bia is woken with the delivery and finishes. Then the review (Guia, Coordenação) is offered
 *            ONLY `review_verdict`: it returns the work with a point (by tool), Bia adjusts, Guia approves (by tool): the seal.
 *   pass     "@Bia … e depois o Teo faz a arte" (review off): Bia is offered `pass_forward`, calls it; Teo's Task opens; Bia does not wait.
 *   plain    "@Bia escreva um post sobre café": the team tools are offered here too (D-097: no keyword) and the model just works; the Task delivers.
 *
 *   opinion  "… veja a opinião da equipe": `ask_team_opinion` with the image of the request (Claude: the colleague receives it; Codex reads no image
 *            yet: the round about words runs and the model is told the image stayed behind).
 *
 * `--engine codex`: the same round on the REAL installed `codex` CLI, in a throw-away product CODEX_HOME whose `config.toml` points the provider at a
 * LOCAL fake Responses endpoint (dummy key, NO `auth.json` written or copied: `PERSONA_ISOLATE_CLI_CONFIG=1`), the only home where the product serves
 * Codex its tools.
 *
 *   node --import tsx/esm packages/persona/persona-host/scripts/team-tools-dry.ts [--engine claude|codex] [--out <file.json>] [--only ask|pass|opinion|plain]
 *
 * Exit 0 only when every check holds. Serialise it with the `check` lock like any other job.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { latestAssignment } from '@deepseek-ai/dsh-persona-engine'
import PersonaRunners, { disposeRunnerSessions } from '@deepseek-ai/dsh-persona-runners'
import { TEAM_GUIDANCE_CORE } from '../src/harness-team.ts'
import PersonaHost from '../src/index.ts'

const NS = 'mcp__persona__'
const SETTLE_MS = 240_000

/** A valid 1×1 PNG: the "image" the opinion round shows the team. */
const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

interface Seen {
  readonly at: number
  readonly offered: readonly string[]
  readonly lastKind: 'prompt' | 'tool_result' | 'other'
  readonly step: string
  /** Image blocks in the last user message (the opinion round's colleagues must receive the draft's image). */
  readonly images: number
  readonly toolResult?: string
}

interface Counters { verdicts: number; requests: number; attachmentId: string }

function textOf(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.map((part) => {
    if (typeof part !== 'object' || part === null) return ''
    const row = part as { text?: unknown; content?: unknown }
    return typeof row.text === 'string' ? row.text : row.content !== undefined ? textOf(row.content) : ''
  }).join(' ')
}

/** What the scripted "model" does for one request: the step it recognises in the conversation, and its answer. */
function decide(all: string, last: string, lastKind: Seen['lastKind'], offered: readonly string[], counters: Counters): { readonly step: string; readonly tool?: { readonly name: string; readonly input: Record<string, unknown> }; readonly text: string } {
  // The step to play is the one named by the LATEST request of the conversation.
  const marker = [...all.matchAll(/TEAMDRY-(ASK|PASS|OPINION|PLAIN)/gu)].at(-1)?.[1]
  if (lastKind === 'tool_result') {
    // The reviewer talks AFTER calling the tool: those words must never be read as its verdict (the tool is).
    if (offered.includes(`${NS}review_verdict`)) return { step: 'guia-after-verdict', text: 'Pode seguir, ficou legal.' }
    if (marker === 'OPINION' && offered.includes(`${NS}ask_team_opinion`)) return { step: 'bia-after-opinion', text: 'Ajustei o rascunho com o que a equipe disse.' }
    if (marker === 'ASK' && !/entregou o que você pediu/u.test(last)) return { step: 'bia-after-ask', text: 'Texto dos 3 posts pronto. Aguardo a arte do Teo.' }
    if (marker === 'PASS') return { step: 'bia-after-pass', text: 'Entrego a minha parte: o texto dos 3 posts está pronto.' }
    return { step: 'after-tool', text: 'Veredito registrado.' }
  }
  if (offered.includes(`${NS}review_verdict`)) {
    counters.verdicts += 1
    return counters.verdicts === 1
      ? { step: 'guia-review-1', tool: { name: `${NS}review_verdict`, input: { verdict: 'changes', points: ['Falta o preço no segundo post'] } }, text: 'Devolvi com um ponto.' }
      : { step: 'guia-review-2', tool: { name: `${NS}review_verdict`, input: { verdict: 'approve' } }, text: 'Pode seguir, ficou legal.' }
  }
  if (/entregou o que você pediu/u.test(last)) return { step: 'bia-woken', text: 'Texto e arte dos 3 posts prontos.' }
  if (/pediu ajustes/u.test(last)) return { step: 'bia-adjust', text: 'Texto ajustado, com o preço no segundo post.' }
  if (/<bilhete>/u.test(last) && /Faça o que Bia pediu/u.test(last)) return { step: 'teo', text: 'Arte dos 3 posts pronta.' }
  if (offered.includes(`${NS}ask_colleague`) && marker === 'ASK' && /TEAMDRY-ASK/u.test(last)) {
    return {
      step: 'bia-ask',
      tool: { name: `${NS}ask_colleague`, input: { colleague: 'Teo', title: 'Arte dos 3 posts', done: ['Texto dos 3 posts pronto.'], needed: ['Uma arte para cada post'], files: ['posts/post-1.md'], decisions: ['Tom leve, sem gíria'] } },
      text: 'x',
    }
  }
  if (offered.includes(`${NS}ask_team_opinion`) && marker === 'OPINION' && /TEAMDRY-OPINION/u.test(last)) {
    return {
      step: 'bia-opinion',
      tool: {
        name: `${NS}ask_team_opinion`,
        // As a real model calls it: the draft's text and NO attachment id (it only knows the file's NAME from the request): the host adds the request's image.
        input: { question: 'O que vocês acham deste rascunho e da capa?', draft: { text: 'Rascunho TEAMDRY-OPINION: “Seu dia começa melhor com um bom café.”', alt: 'Capa do post, fundo azul' } },
      },
      text: 'x',
    }
  }
  if (offered.includes(`${NS}pass_forward`) && marker === 'PASS' && /TEAMDRY-PASS/u.test(last)) {
    return {
      step: 'bia-pass',
      tool: { name: `${NS}pass_forward`, input: { colleague: 'Teo', title: 'Arte dos 3 posts', done: ['Texto dos 3 posts pronto.'], needed: ['Uma arte para cada post'] } },
      text: 'x',
    }
  }
  return { step: marker === 'PLAIN' ? 'bia-plain' : 'other', text: marker === 'PLAIN' ? 'Post sobre café pronto: “Seu dia começa melhor com um bom café.”' : 'ok' }
}

function startFake(log: Seen[], counters: Counters): Promise<{ readonly server: Server; readonly port: number }> {
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
      if (!path.endsWith('/v1/messages')) {
        res.writeHead(404, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ type: 'error', error: { type: 'not_found_error', message: 'team dry fake: unknown path' } }))
        return
      }
      const messages = Array.isArray(body.messages) ? body.messages as { role?: string; content?: unknown }[] : []
      const turns = messages.filter(row => row.role !== 'system')
      const last = turns.at(-1)
      const blocks = Array.isArray(last?.content) ? last.content as { type?: string; content?: unknown }[] : []
      const resultBlock = blocks.find(block => block.type === 'tool_result')
      const offered = Array.isArray(body.tools) ? (body.tools as { name?: unknown }[]).map(tool => String(tool.name)) : []
      const main = offered.length > 0 || turns.length > 1
      const lastKind: Seen['lastKind'] = resultBlock !== undefined ? 'tool_result' : last?.role === 'user' ? 'prompt' : 'other'
      const lastText = textOf(last?.content)
      const allText = turns.map(row => textOf(row.content)).join('\n')
      const stream = body.stream === true
      const id = `msg_dry_${String(counters.requests += 1)}`
      const message = {
        id, type: 'message', role: 'assistant', model: typeof body.model === 'string' ? body.model : 'team-dry-model',
        content: [] as unknown[], stop_reason: null, stop_sequence: null,
        usage: { input_tokens: Math.ceil(raw.length / 4), output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      }
      // The CLI also makes small side calls (title, quota probe): they carry no tools and no conversation — answered with "ok", not logged.
      if (!main) {
        // A colleague asked for their opinion has no tools and a one-message conversation: it lands here, and it is the request that must carry the image.
        if (lastText.includes('TEAMDRY-OPINION')) {
          log.push({ at: Date.now(), offered: [], lastKind, step: 'opinion-reader', images: blocks.filter(block => block.type === 'image').length })
        }
        res.writeHead(200, { 'content-type': stream ? 'text/event-stream' : 'application/json', 'cache-control': 'no-cache' })
        if (!stream) { res.end(JSON.stringify({ ...message, content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' })); return }
        const side = (event: string, data: unknown): void => { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`) }
        side('message_start', { type: 'message_start', message })
        side('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })
        side('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'ok' } })
        side('content_block_stop', { type: 'content_block_stop', index: 0 })
        side('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 1 } })
        side('message_stop', { type: 'message_stop' })
        res.end()
        return
      }
      const decision = decide(allText, lastText, lastKind, offered, counters)
      const wantsTool = decision.tool !== undefined && lastKind === 'prompt'
      log.push({
        at: Date.now(), offered: offered.filter(name => name.startsWith('mcp__')), lastKind, step: decision.step,
        images: (Array.isArray(last?.content) ? last.content as { type?: string }[] : []).filter(block => block.type === 'image').length,
        ...(resultBlock === undefined ? {} : { toolResult: textOf(resultBlock.content).slice(0, 1800) }),
      })
      if (!stream) {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({
          ...message,
          content: wantsTool && decision.tool !== undefined ? [{ type: 'tool_use', id: `toolu_${id}`, name: decision.tool.name, input: decision.tool.input }] : [{ type: 'text', text: decision.text }],
          stop_reason: wantsTool ? 'tool_use' : 'end_turn',
        }))
        return
      }
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
      const send = (event: string, data: unknown): void => { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`) }
      send('message_start', { type: 'message_start', message })
      if (wantsTool && decision.tool !== undefined) {
        send('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: `toolu_${id}`, name: decision.tool.name, input: {} } })
        send('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(decision.tool.input) } })
        send('content_block_stop', { type: 'content_block_stop', index: 0 })
        send('message_delta', { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 8 } })
      } else {
        send('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })
        send('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: decision.text } })
        send('content_block_stop', { type: 'content_block_stop', index: 0 })
        send('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 6 } })
      }
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

/** Every tool of a Responses request: flat functions, and the ones nested in a namespace (how Codex lists an MCP server). */
function codexToolsOf(tools: unknown): Array<{ readonly namespace?: string; readonly name: string }> {
  if (!Array.isArray(tools)) return []
  const out: Array<{ namespace?: string; name: string }> = []
  for (const tool of tools as { name?: string; tools?: unknown }[]) {
    if (Array.isArray(tool.tools)) {
      for (const inner of tool.tools as { name?: string }[]) if (typeof inner.name === 'string') out.push({ ...(typeof tool.name === 'string' ? { namespace: tool.name } : {}), name: inner.name })
    } else if (typeof tool.name === 'string') out.push({ name: tool.name })
  }
  return out
}

/** The same scripted "model", spoken in the Responses API of the Codex CLI (SSE `function_call` / `message` items). */
function startFakeCodex(log: Seen[], counters: Counters): Promise<{ readonly server: Server; readonly port: number }> {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => { chunks.push(chunk) })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      let body: Record<string, unknown> = {}
      try { body = raw === '' ? {} : JSON.parse(raw) as Record<string, unknown> } catch { body = {} }
      const path = (req.url ?? '').split('?')[0] ?? ''
      if (!path.endsWith('/responses')) {
        res.writeHead(path.endsWith('/models') ? 200 : 404, { 'content-type': 'application/json' })
        res.end(path.endsWith('/models') ? JSON.stringify({ data: [], models: [] }) : JSON.stringify({ error: { message: 'team dry fake: unknown path' } }))
        return
      }
      const input = Array.isArray(body.input) ? body.input as { type?: string; role?: string; output?: unknown; content?: unknown; arguments?: unknown }[] : []
      const lastItem = input.at(-1)
      const lastKind: Seen['lastKind'] = lastItem?.type === 'function_call_output' ? 'tool_result' : lastItem?.role === 'user' ? 'prompt' : 'other'
      const tools = codexToolsOf(body.tools)
      // The product's tools are listed in the `mcp__persona` namespace: the same names the Claude CLI shows, so one script serves both.
      const personaTools = tools.filter(tool => (tool.namespace ?? '').includes('persona'))
      const offered = personaTools.map(tool => `${NS}${tool.name}`)
      const lastText = lastKind === 'tool_result' ? textOf(lastItem?.output) : textOf(lastItem?.content)
      const allText = input.map(item => item.type === 'function_call_output' ? textOf(item.output) : typeof item.arguments === 'string' ? item.arguments : textOf(item.content)).join('\n')
      const images = (Array.isArray(lastItem?.content) ? lastItem.content as { type?: string }[] : []).filter(part => part.type === 'input_image').length
      counters.requests += 1
      const id = `resp_dry_${String(counters.requests)}`
      // A colleague asked for their opinion has no product tools: it is the request that must carry the draft's image (Codex reads none: expect 0).
      if (lastKind === 'prompt' && lastText.includes('TEAMDRY-OPINION') && personaTools.length === 0) {
        log.push({ at: Date.now(), offered: [], lastKind, step: 'opinion-reader', images })
      }
      const decision = decide(allText, lastText, lastKind, offered, counters)
      const target = decision.tool === undefined ? undefined : personaTools.find(tool => `${NS}${tool.name}` === decision.tool?.name)
      const wantsTool = decision.tool !== undefined && target !== undefined && lastKind === 'prompt'
      if (offered.length > 0 || decision.step !== 'other') {
        log.push({ at: Date.now(), offered, lastKind, step: decision.step, images, ...(lastKind === 'tool_result' ? { toolResult: lastText.slice(0, 1800) } : {}) })
      }
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
      const send = (data: { type: string } & Record<string, unknown>): void => { res.write(`event: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`) }
      send({ type: 'response.created', response: { id, object: 'response', status: 'in_progress', output: [] } })
      let output: unknown[]
      if (wantsTool && target !== undefined && decision.tool !== undefined) {
        const item = { type: 'function_call', id: `fc_${String(counters.requests)}`, call_id: `call_dry_${String(counters.requests)}`, name: target.name, ...(target.namespace === undefined ? {} : { namespace: target.namespace }), arguments: JSON.stringify(decision.tool.input), status: 'completed' }
        send({ type: 'response.output_item.added', output_index: 0, item: { ...item, arguments: '', status: 'in_progress' } })
        send({ type: 'response.output_item.done', output_index: 0, item })
        output = [item]
      } else {
        const messageId = `msg_dry_${String(counters.requests)}`
        send({ type: 'response.output_item.added', output_index: 0, item: { type: 'message', id: messageId, role: 'assistant', content: [], status: 'in_progress' } })
        send({ type: 'response.content_part.added', item_id: messageId, output_index: 0, content_index: 0, part: { type: 'output_text', text: '' } })
        send({ type: 'response.output_text.delta', item_id: messageId, output_index: 0, content_index: 0, delta: decision.text })
        send({ type: 'response.output_text.done', item_id: messageId, output_index: 0, content_index: 0, text: decision.text })
        const done = { type: 'message', id: messageId, role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: decision.text, annotations: [] }] }
        send({ type: 'response.output_item.done', output_index: 0, item: done })
        output = [done]
      }
      send({ type: 'response.completed', response: { id, object: 'response', status: 'completed', output, usage: { input_tokens: Math.ceil(raw.length / 4), output_tokens: 6, total_tokens: Math.ceil(raw.length / 4) + 6 } } })
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

interface Row { readonly scenario: string; readonly check: string; readonly ok: boolean; readonly why: string }

async function main(): Promise<void> {
  const argv = process.argv
  const out = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : undefined
  const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : undefined
  const engine = argv.includes('--engine') ? argv[argv.indexOf('--engine') + 1] : 'claude'
  if (engine !== 'claude' && engine !== 'codex') throw new Error('--engine is claude or codex')
  const want = (name: string): boolean => only === undefined || only === name
  const home = mkdtempSync(join(tmpdir(), 'persona-teamdry-home-'))
  const cliHome = mkdtempSync(join(tmpdir(), 'persona-teamdry-cli-'))
  // Codex: a throw-away CODEX_HOME of the PRODUCT (an isolated account home). No `auth.json` is written or copied: the provider is the fake one.
  const codexHome = join(cliHome, 'codex-home')
  mkdirSync(join(home, 'db'), { recursive: true })
  mkdirSync(join(cliHome, '.claude'), { recursive: true })
  const saved = { ...process.env }
  const log: Seen[] = []
  const counters: Counters = { verdicts: 0, requests: 0, attachmentId: '' }
  const { server, port } = engine === 'codex' ? await startFakeCodex(log, counters) : await startFake(log, counters)
  const rows: Row[] = []
  const check = (scenario: string, name: string, ok: boolean, why: string): void => { rows.push({ scenario, check: name, ok, why }) }
  let ctx: Context | undefined
  try {
    // Codex: the product asks the Codex CLI itself `login status` before it opens a session (the CLI reads the person's login state; this script and the
    // product never read or copy `auth.json`), so HOME stays as it is; the SESSION runs in the isolated CODEX_HOME below. Claude gets a throw-away HOME.
    Object.assign(process.env, engine === 'claude'
      ? { HOME: cliHome, USERPROFILE: cliHome, APPDATA: join(cliHome, 'AppData'), LOCALAPPDATA: join(cliHome, 'AppData', 'Local') }
      : {}, {
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${String(port)}`, ANTHROPIC_API_KEY: 'sk-ant-teamdry-dummy-key',
      PERSONA_HOME: home, PERSONA_REAL_CLI: '1',
    })
    delete process.env.VITEST
    delete process.env.PERSONA_SCRIPTED
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN
    if (!/^http:\/\/127\.0\.0\.1:\d+$/u.test(process.env.ANTHROPIC_BASE_URL ?? '')) throw new Error('refusing to run: the endpoint must be the local fake')
    if (engine === 'codex') {
      // The product's isolated Codex home: the model provider is the LOCAL fake (dummy key, no login), nothing of the person's own is read or copied
      // (`PERSONA_ISOLATE_CLI_CONFIG=1` makes the runner use the folder as it is, without seeding any `auth.json`).
      mkdirSync(codexHome, { recursive: true })
      writeFileSync(join(codexHome, 'config.toml'), [
        'model = "teamdry-model"', 'model_provider = "teamdry"', '[model_providers.teamdry]', 'name = "team dry fake"',
        `base_url = "http://127.0.0.1:${String(port)}/v1"`, 'env_key = "TEAMDRY_API_KEY"', 'wire_api = "responses"', 'requires_openai_auth = false',
        'request_max_retries = 0', 'stream_max_retries = 0', '',
      ].join('\n'))
      Object.assign(process.env, { TEAMDRY_API_KEY: 'sk-teamdry-dummy-key', PERSONA_ISOLATE_CLI_CONFIG: '1' })
    }
    ctx = new Context()
    await ctx.plugin(PersonaRunners)
    const h = new PersonaHost(ctx, { databasePath: join(home, 'db', 'persona.db') })
    const scope = { workspaceId: 'ws', projectId: 'pp' }
    h.sessionMemberId = 'ana'
    h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
    h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
    for (const [id, name, title, coordination] of [['guia', 'Guia', 'Coordenação', true], ['bia', 'Bia', 'Redação', false], ['teo', 'Teo', 'Arte', false]] as const) {
      h.createPersona({
        workspaceId: 'ws', projectId: 'pp', id, name, title, description: title, personality: 'Clara.', instructions: 'Ajude.',
        avatarKind: 'gallery', avatarRef: id, runnerKind: 'cli', runnerCli: engine, runnerModel: engine === 'codex' ? 'default' : 'haiku', canRecruit: false, createdBy: 'ana',
        ...(coordination ? { systemRoles: ['coordination'] as const } : {}),
      })
    }
    h.createChannel({ id: 'geral', workspaceId: 'ws', projectId: 'pp', name: 'geral', topic: '' })
    // The personas as the PRODUCT creates them (onboarding, the person's form, the Gestor): NO file/shell grant, `tools: {}`. A persona with no grant must still COORDINATE (D-097).
    for (const id of ['guia', 'bia', 'teo']) h.product.updatePersona({ ...h.product.getPersona(id)!, tools: {} }, 'pp')
    // Codex runs in the product's isolated home (an account seat): the only place the product serves it tools (never in the person's own home).
    if (engine === 'codex') h.orchestration.accountSeatOf = () => ({ home: codexHome })
    await h.connections.ready()
    // `ready()` can resolve while the CLI probes are still "checking" (a slow machine): the round starts when the engine's card is settled.
    for (let waited = 0; waited < 90 && h.connections.list().some(card => card.id === engine && card.phase === 'checking'); waited += 1) await new Promise<void>((resolve) => { setTimeout(resolve, 1000) })
    const cards = h.connections.list().map(card => ({ id: card.id, phase: card.phase, available: card.available, loggedIn: card.loggedIn }))
    check('setup', `the installed ${engine} CLI is available${engine === 'claude' ? ' and logged in through the throwaway account (API key env)' : ' (the fake provider needs no login)'}`, cards.some(card => card.id === engine && card.available && (engine === 'codex' || card.loggedIn)), JSON.stringify(cards))
    const flags = h.hostFlags
    check('setup', 'product defaults are ON in this process', flags.teamwork && flags.productTools, JSON.stringify(flags))
    const tickets = () => h.orchestration.runtime('pp').repo.tickets.list()
    const byName = (name: string) => tickets().filter(ticket => ticket.execution?.name === name)
    const thread = () => h.listMessages({ ...scope, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events

    /** Wait until the product is quiet: no new request to the model for a while, nothing running. */
    const settle = async (): Promise<void> => {
      const started = Date.now()
      let stable = 0
      let seen = -1
      while (Date.now() - started < SETTLE_MS && stable < 4) {
        await h.orchestration.flush('pp')
        await new Promise<void>((resolve) => { setTimeout(resolve, 1500) })
        if (counters.requests === seen) stable += 1
        else { stable = 0; seen = counters.requests }
      }
      await h.orchestration.flush('pp')
    }
    const mark = (): number => log.length

    const say = (id: string, body: string, attachmentIds?: readonly string[]): void => {
      h.postMessage({ id, workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral', body, actorId: 'ana', subjectId: id, occurredAt: new Date().toISOString(), ...(attachmentIds === undefined ? {} : { attachmentIds: [...attachmentIds] }) })
    }
    const stepsSince = (from: number): string[] => log.slice(from).map(row => row.step)
    const offeredAt = (from: number, step: string): readonly string[] => log.slice(from).find(row => row.step === step)?.offered ?? []
    const team = (names: readonly string[]): string[] => names.filter(name => /ask_colleague|pass_forward|review_verdict|ask_team_opinion/u.test(name))
    const lines = (kind: 'handoff' | 'review'): number => thread().filter(row => (kind === 'handoff' ? row.handoff : row.review) !== undefined).length
    const stateOf = (name: string): string => {
      const ticket = byName(name).at(-1)
      return ticket === undefined ? 'none' : (latestAssignment(ticket)?.report?.state ?? 'none')
    }

    // ---- ask: Bia asks Teo (tool), Teo delivers, Bia wakes; then the review gives its verdict by tool -------------------------------
    if (want('ask')) {
      const from = mark()
      say('u-ask', '@Bia Faz o cartaz da promoção do pão de queijo da Padaria Lua com a foto da vitrine, quero algo bonito para o Instagram, com o preço em destaque e o endereço da loja embaixo TEAMDRY-ASK')
      await settle()
      const steps = stepsSince(from)
      const bia = byName('Bia').at(0)
      const teo = byName('Teo').at(0)
      const biaTurn = h.orchestration.turnInputs.find(row => row.personaId === 'bia' && row.purpose === 'task')
      check('ask', 'D-097: the WHOLE natural request (no keyword, > 120 letters) reached the worker with the team paragraph, and the turn was offered the coordination tools of a persona with no grant', biaTurn !== undefined && biaTurn.prompt.includes('com a foto da vitrine, quero algo bonito para o Instagram, com o preço em destaque e o endereço da loja embaixo') && !biaTurn.prompt.includes('…') && biaTurn.prompt.includes(TEAM_GUIDANCE_CORE) && biaTurn.prompt.includes('Equipe: ') && ['ask_colleague', 'ask_team_opinion', 'pass_forward', 'persona_ask'].every(name => biaTurn.toolNames.includes(name)), `toolNames=${JSON.stringify(biaTurn?.toolNames ?? [])} promptChars=${String(biaTurn?.prompt.length ?? 0)}`)
      check('ask', 'Bia is offered ask_colleague (no keyword: the host\'s rule) and calls it', offeredAt(from, 'bia-ask').includes(`${NS}ask_colleague`) && steps.includes('bia-after-ask'), `steps=${steps.join('>')} offered=${JSON.stringify(team(offeredAt(from, 'bia-ask')))}`)
      const result = log.slice(from).find(row => row.step === 'bia-after-ask')?.toolResult ?? ''
      check('ask', 'the model read the host\'s answer: asked Teo, wait, do not do his part', /"ok":true/u.test(result) && /"colleague":"Teo"/u.test(result) && /não faça a parte/iu.test(result), result.slice(0, 220))
      check('ask', 'Teo\'s Task exists with the PERSON\'s mandate and the bilhete as data', teo !== undefined && bia !== undefined && teo.mandate.actor.id === bia.mandate.actor.id && (teo.execution?.assignment ?? '').includes('<bilhete>'), `teo=${teo?.mandate.actor.id ?? '-'} bia=${bia?.mandate.actor.id ?? '-'}`)
      check('ask', 'Teo delivered and Bia was woken with it (the same Task, finished)', steps.includes('teo') && steps.includes('bia-woken') && stateOf('Bia') === 'ready', `steps=${steps.join('>')} bia=${stateOf('Bia')} teo=${stateOf('Teo')}`)
      check('ask', 'Teo (the colleague asked) is offered the team tools too: every Task of a project with colleagues; the circle and the caps are the host\'s', team(offeredAt(from, 'teo')).length === 3, JSON.stringify(team(offeredAt(from, 'teo'))))
      const reviewOffer = offeredAt(from, 'guia-review-1')
      check('ask', 'the REVIEW Task is offered review_verdict and no other team tool', reviewOffer.includes(`${NS}review_verdict`) && team(reviewOffer).length === 1, JSON.stringify(team(reviewOffer)))
      check('ask', 'verdict by tool: "changes" went back to Bia, she adjusted, the second pass approved', steps.includes('guia-review-1') && steps.includes('bia-adjust') && steps.includes('guia-review-2'), `steps=${steps.join('>')}`)
      const sealed = bia === undefined ? undefined : h.handoffs.reviewedBy('pp', bia.id)
      check('ask', 'the work reached the person SEALED by Guia (the tool\'s verdict, not the words)', sealed?.personaId === 'guia' && h.handoffs.reviewFailure('pp', bia?.id ?? '') === undefined, JSON.stringify(sealed))
      const reviews = thread().flatMap(row => row.review === undefined ? [] : [row.review.kind])
      check('ask', 'the thread: the hand-over card in its 3 steps (asked, delivered, resumed), review lines returned→reviewed, nobody technical, never the reviewer\'s words', lines('handoff') === 3 && reviews.join('>') === 'returned>reviewed' && !JSON.stringify(thread()).includes('Pode seguir') && !JSON.stringify(thread()).includes('team:'), `handoff=${String(lines('handoff'))} reviews=${reviews.join('>')}`)
      check('ask', 'no token or key leaked into the product (lastErrors empty)', h.orchestration.lastErrors.length === 0, JSON.stringify(h.orchestration.lastErrors).slice(0, 200))
    }

    // ---- pass: Bia passes the work on (tool) and does not wait --------------------------------------------------------------------
    if (want('pass')) {
      h.screens.screens.put('pp', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } }) // the review has its own scenario
      const teoBefore = byName('Teo').length
      const from = mark()
      say('u-pass', '@Bia Escreve o texto do post de sexta sobre o café novo da casa, curto e simpático TEAMDRY-PASS')
      await settle()
      const steps = stepsSince(from)
      check('pass', 'Bia is offered pass_forward (her words say "depois o Teo faz") and calls it', offeredAt(from, 'bia-pass').includes(`${NS}pass_forward`) && steps.includes('bia-after-pass'), `steps=${steps.join('>')} offered=${JSON.stringify(team(offeredAt(from, 'bia-pass')))}`)
      check('pass', 'a Task for Teo opened (kind next) and Bia finished her own part without waiting', byName('Teo').length === teoBefore + 1 && steps.includes('teo'), `teoTasks=${String(byName('Teo').length)} steps=${steps.join('>')}`)
      const passResult = log.slice(from).find(row => row.step === 'bia-after-pass')?.toolResult ?? ''
      check('pass', 'the model read: the work goes on to Teo, deliver YOUR part', /"ok":true/u.test(passResult) && /não é sua/u.test(passResult), passResult.slice(0, 200))
    }

    // ---- opinion: Bia asks the team (tool) with an image; the round runs; the lines reach the thread ------------------------------
    if (want('opinion')) {
      h.setAutonomy({ ...scope, personaId: 'bia', mode: 'act', proposalBudget: 3, tokenBudget: 1, executionBudget: 1, silenceStart: '', silenceEnd: '' })
      const image = h.attachFile({ ...scope, streamKind: 'channel', ownerId: 'geral', name: 'capa.png', bytesBase64: PNG_1X1 })
      counters.attachmentId = image.id
      const from = mark()
      say('u-opinion', '@Bia Escreve o post do café novo; a capa anexa é o rascunho atual TEAMDRY-OPINION', [image.id])
      await settle()
      const steps = stepsSince(from)
      check('opinion', 'Bia is offered ask_team_opinion (her words ask for the team\'s opinion) and calls it', offeredAt(from, 'bia-opinion').includes(`${NS}ask_team_opinion`) && steps.includes('bia-after-opinion'), `steps=${steps.join('>')} offered=${JSON.stringify(team(offeredAt(from, 'bia-opinion')))}`)
      const opinionResult = log.slice(from).find(row => row.step === 'bia-after-opinion')?.toolResult ?? ''
      const readers = log.slice(from).filter(row => row.step === 'opinion-reader')
      if (engine === 'claude') {
        check('opinion', 'the model read the round: who replied, what is left, and that the request\'s image went along (it named none)', /"ok":true/u.test(opinionResult) && /replies|state/u.test(opinionResult) && /A imagem anexada ao pedido \(capa\.png\)/u.test(opinionResult), opinionResult.slice(0, 1500))
        // The round went to the 1 person linked to this work (Guia, Coordenação: "1 pessoas ligadas a este trabalho" in the tool result): exactly ONE
        // request carries the draft's image (hers); the other request that names the draft is the consolidation, which works from the words.
        check('opinion', 'the colleague asked received the draft AND its image (the engine sees images); only she did', readers.filter(row => row.images >= 1).length === 1 && /1 pessoas ligadas/u.test(opinionResult), `readers=${String(readers.length)} images=${JSON.stringify(readers.map(row => row.images))}`)
      } else {
        // Codex reads no image yet: the round about WORDS still runs, the request's image stays behind, and the model is told (never a stopped round).
        check('opinion', 'Codex: the round about words ran; the model was told the request\'s image stayed behind (nobody of the round sees images)', /"ok":true/u.test(opinionResult) && /A imagem anexada ao pedido \(capa\.png\) não foi junto/u.test(opinionResult), opinionResult.slice(0, 1500))
        check('opinion', 'Codex: no colleague\'s request carried an image', readers.length > 0 && readers.every(row => row.images === 0), `readers=${String(readers.length)} images=${JSON.stringify(readers.map(row => row.images))}`)
      }
      const opinionLines = thread().filter(row => (row as { opinion?: unknown }).opinion !== undefined).length
      check('opinion', 'the thread shows the round (request, replies, consolidation) and Bia finished', opinionLines >= 2 && stateOf('Bia') === 'ready', `opinionLines=${String(opinionLines)} bia=${stateOf('Bia')}`)
    }

    // ---- plain: no words ask for a colleague → no team tool is offered ------------------------------------------------------------
    if (want('plain')) {
      const from = mark()
      say('u-plain', '@Bia Escreve um post sobre café TEAMDRY-PLAIN')
      await settle()
      const offered = log.slice(from).filter(row => row.step === 'bia-plain').flatMap(row => row.offered)
      check('plain', 'a plain request: the CLI is offered the team tools too (no keyword) and the model is free to just work', log.slice(from).some(row => row.step === 'bia-plain') && team(offered).length === 3, JSON.stringify([...new Set(offered)]))
      check('plain', 'the Task delivers as before', stateOf('Bia') === 'ready', stateOf('Bia'))
    }
    if (engine === 'codex') {
      const files = readdirSync(codexHome)
      const config = readFileSync(join(codexHome, 'config.toml'), 'utf8')
      check('codex-home', 'the isolated CODEX_HOME holds no auth.json (nothing of the person\'s was copied) and our provider lines are intact next to the managed tools block', !existsSync(join(codexHome, 'auth.json')) && config.includes('[model_providers.teamdry]') && /persona/u.test(config.replace('[model_providers.teamdry]', '')), `files=${files.join(',')} bytes=${String(config.length)}`)
    }
    if (process.env.TEAMDRY_DEBUG === '1') {
      process.stderr.write(`[debug] requests=${String(counters.requests)} logged=${String(log.length)} lastErrors=${JSON.stringify(h.orchestration.lastErrors)}\n`)
      for (const ticket of tickets()) process.stderr.write(`[debug] ticket ${ticket.execution?.name ?? '?'} "${ticket.title}" state=${latestAssignment(ticket)?.report?.state ?? '-'} summary=${(latestAssignment(ticket)?.report?.summary ?? '').slice(0, 100)}\n`)
      for (const row of thread()) process.stderr.write(`[debug] event ${row.type} ${row.body.replace(/\s+/gu, ' ').slice(0, 140)}\n`)
    }
  } finally {
    try { await disposeRunnerSessions() } catch (error) { void error }
    try { await ctx?.fiber.dispose() } catch (error) { void error }
    server.close()
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key]
    Object.assign(process.env, saved)
    // TEAMDRY_KEEP=1 keeps the home (its database) so `team-round-observe.ts` can read what this dry round left; the CLI's throw-away home always goes.
    const keep = saved.TEAMDRY_KEEP === '1'
    if (keep) process.stdout.write(`[kept] ${home}\n`)
    for (const dir of keep ? [cliHome] : [home, cliHome]) { try { rmSync(dir, { recursive: true, force: true }) } catch (error) { void error } }
  }
  for (const row of rows) process.stdout.write(`${row.ok ? 'OK  ' : 'FAIL'} [${row.scenario}] ${row.check}\n       ${row.why}\n`)
  const ok = rows.length > 0 && rows.every(row => row.ok)
  const asks = log.length
  process.stdout.write(`${ok ? `TEAM TOOLS REACH THE REAL ${engine.toUpperCase()} CLI` : 'TEAM TOOLS NOT PROVEN'} (${String(rows.filter(row => row.ok).length)}/${String(rows.length)}; ${String(asks)} model requests to the FAKE endpoint, zero spend)\n`)
  if (out !== undefined && out !== '') {
    writeFileSync(out, `${JSON.stringify({ note: `D-090 dry proof: real PersonaHost, real ${engine} CLI through the product runner stack + HT-0 gateway, fake ${engine === 'codex' ? 'Responses' : 'Anthropic'} endpoint, zero model, zero spend`, ok, rows, requests: log.map(row => ({ step: row.step, lastKind: row.lastKind, offered: row.offered })) }, null, 2)}\n`)
  }
  process.exit(ok ? 0 : 1)
}

main().catch((error: unknown) => {
  process.stderr.write(`team-tools-dry failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`)
  process.exit(1)
})
