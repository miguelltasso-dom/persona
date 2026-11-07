/**
 * HT-0 spike (Codex): does a product tool reach the REAL Codex CLI, run as the turn, and obey the gateway ACL? (D-084)
 *
 * NO real model call, NO quota, NO spend. The installed `codex` is started by the product's own `resolveRunner` (the same OAR
 * session the host uses) with a throw-away CODEX_HOME whose `config.toml` points the model provider at a LOCAL fake Responses endpoint
 * (dummy key, no login). The fake logs the tool names Codex offers the model, answers the first request with a `function_call` of a
 * product tool, and finishes the turn once it sees the `function_call_output` — what is measured is the transport, not a model.
 *
 * Scenarios: read-ok · forged · no-grant · approval (same meaning as the Claude spike, ht0-claude-spike.ts).
 *
 * node --import tsx/esm packages/persona/persona-runners/scripts/ht0-codex-spike.ts [--only read-ok|forged|no-grant|approval]
 * Writes .maestri/tmp/ht0-codex-spike.json. Exit 0 only when every scenario matches what it must prove.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createMcpGateway, disposeRunnerSessions, openTurnTools, resolveRunner, type TurnToolSet } from '../src/index.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const CALL_MS = 150_000
const RECALL = 'persona_recall'
const EMAIL = 'persona_email_send'
const ASK = 'persona_ask'

interface Seen {
  readonly path: string
  readonly model: string
  readonly offered: readonly string[]
  readonly lastKind: 'prompt' | 'tool_result' | 'other'
  readonly toolResult?: string
  /** The request replays an earlier function_call/function_call_output: the thread is the one the CLI already had. */
  readonly priorTools: boolean
  readonly items: number
}

type Scenario = 'read-ok' | 'forged' | 'no-grant' | 'approval' | 'ask'
const ALL: readonly Scenario[] = ['read-ok', 'forged', 'no-grant', 'approval', 'ask']

/** The scripted "model": call the tool whose NAME ENDS with `suffix`, with this input. */
interface Plan {
  suffix: string
  input: Record<string, unknown>
}

function textOf(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(textOf).join(' ')
  if (typeof value === 'object' && value !== null) {
    const row = value as { text?: unknown; output?: unknown; content?: unknown }
    return textOf(row.text ?? row.output ?? row.content ?? '')
  }
  return ''
}

interface Offered {
  readonly namespace?: string
  readonly name: string
  readonly label: string
}

/** Every tool in a Responses request: flat functions, and functions nested in a namespace (how Codex lists MCP servers). */
function toolsOf(tools: unknown): Offered[] {
  if (!Array.isArray(tools)) return []
  const out: Offered[] = []
  for (const tool of tools as { type?: string; name?: string; tools?: unknown }[]) {
    if (Array.isArray(tool.tools)) {
      for (const inner of tool.tools as { name?: string }[]) {
        if (typeof inner.name === 'string') out.push({ ...(typeof tool.name === 'string' ? { namespace: tool.name } : {}), name: inner.name, label: `${tool.name ?? ''}/${inner.name}` })
      }
    } else if (typeof tool.name === 'string') out.push({ name: tool.name, label: tool.name })
  }
  return out
}

function startFake(log: Seen[], plan: Plan): Promise<{ readonly server: Server; readonly port: number }> {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => { chunks.push(chunk) })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      let body: Record<string, unknown> = {}
      try { body = raw === '' ? {} : JSON.parse(raw) as Record<string, unknown> } catch { body = {} }
      const path = (req.url ?? '').split('?')[0] ?? ''
      if (process.env.HT0_DEBUG === '1') process.stderr.write(`[fake] ${req.method ?? ''} ${path} bytes=${String(raw.length)}\n`)
      if (!path.endsWith('/responses')) {
        res.writeHead(path.endsWith('/models') ? 200 : 404, { 'content-type': 'application/json' })
        res.end(path.endsWith('/models') ? JSON.stringify({ data: [], models: [] }) : JSON.stringify({ error: { message: 'ht0 fake: unknown path' } }))
        return
      }
      const input = Array.isArray(body.input) ? body.input as { type?: string; role?: string; output?: unknown; content?: unknown }[] : []
      const lastItem = input.at(-1)
      const isResult = lastItem?.type === 'function_call_output'
      const offeredTools = toolsOf(body.tools)
      const offered = offeredTools.map(tool => tool.label)
      const target = offeredTools.find(tool => tool.name.endsWith(plan.suffix) && (tool.namespace ?? tool.name).includes('persona'))
      const lastKind: Seen['lastKind'] = isResult ? 'tool_result' : lastItem?.role === 'user' ? 'prompt' : 'other'
      const seen: Seen = {
        path, model: typeof body.model === 'string' ? body.model : '', offered, lastKind,
        items: input.length,
        priorTools: input.some(item => item.type === 'function_call' || item.type === 'function_call_output'),
        ...(isResult ? { toolResult: textOf(lastItem?.output).slice(0, 400) } : {}),
      }
      log.push(seen)
      if (process.env.HT0_DEBUG === '1') {
        process.stderr.write(`[fake] responses tools=${offered.join(',')} input=${input.map(item => `${item.type ?? item.role ?? '?'}`).join(',')} last=${lastKind}\n`)
      }
      const wantsTool = target !== undefined && lastKind === 'prompt'
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
      const send = (data: { type: string } & Record<string, unknown>): void => { res.write(`event: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`) }
      const id = `resp_ht0_${String(log.length)}`
      send({ type: 'response.created', response: { id, object: 'response', status: 'in_progress', output: [] } })
      let output: unknown[]
      if (wantsTool) {
        const item = { type: 'function_call', id: `fc_${String(log.length)}`, call_id: `call_ht0_${String(log.length)}`, name: target.name, ...(target.namespace === undefined ? {} : { namespace: target.namespace }), arguments: JSON.stringify(plan.input), status: 'completed' }
        send({ type: 'response.output_item.added', output_index: 0, item: { ...item, arguments: '', status: 'in_progress' } })
        send({ type: 'response.output_item.done', output_index: 0, item })
        output = [item]
      } else {
        const text = isResult ? `HT0-DONE ${seen.toolResult ?? ''}`.slice(0, 300) : 'ok'
        const messageId = `msg_ht0_${String(log.length)}`
        send({ type: 'response.output_item.added', output_index: 0, item: { type: 'message', id: messageId, role: 'assistant', content: [], status: 'in_progress' } })
        send({ type: 'response.content_part.added', item_id: messageId, output_index: 0, content_index: 0, part: { type: 'output_text', text: '' } })
        send({ type: 'response.output_text.delta', item_id: messageId, output_index: 0, content_index: 0, delta: text })
        send({ type: 'response.output_text.done', item_id: messageId, output_index: 0, content_index: 0, text })
        const done = { type: 'message', id: messageId, role: 'assistant', status: 'completed', content: [{ type: 'output_text', text, annotations: [] }] }
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

interface Outcome {
  readonly scenario: Scenario
  readonly ended: boolean
  readonly endReport: string
  readonly trail: readonly string[]
  readonly finalText: string
  readonly offeredToModel: readonly string[]
  readonly toolResultsSeenByModel: readonly string[]
  readonly hookCalls: readonly string[]
  readonly sent: number
  readonly approvals: number
  readonly requests: number
  readonly ok: boolean
  readonly why: string
}

type Inner = Awaited<ReturnType<typeof resolveRunner>>

async function runTurn(inner: Inner, run: { personaId: string; ticketId: string; assignmentId: string }, cwd: string, set: TurnToolSet | undefined, prompt = 'Consulte a memória sobre a regra de entrega e me diga.'): Promise<{
  ended: boolean; finalText: string; endReport: string; trail: string[]
}> {
  let ended = false
  let finalText = ''
  let endReport = ''
  const trail: string[] = []
  try {
    const handle = await inner.start({
      ...run, cwd, model: 'default', permissionMode: 'deny',
      prompt,
      ...(set === undefined ? {} : { mcpTools: set }),
    })
    const consume = (async (): Promise<void> => {
      for await (const event of inner.stream(handle)) {
        if (event.type === 'delta') finalText += event.text
        if (event.type === 'ended') { ended = true; endReport = JSON.stringify(event.report).slice(0, 300) }
        if (event.type === 'report') trail.push(event.report.summary.slice(0, 80))
      }
    })()
    await Promise.race([consume, new Promise<void>((_, reject) => { setTimeout(() => { reject(new Error('call timeout')) }, CALL_MS) })])
  } catch (error) {
    finalText += ` [erro: ${error instanceof Error ? error.message : String(error)}]`
  }
  return { ended, finalText, endReport, trail }
}

/** HT0_DUMP=1: wrap the real Codex runtime so the native frames of every session can be printed (no behaviour change). */
async function wrapRuntimeForDump(dumps: { records: () => unknown[] }[]) {
  const oar = await import('@botiverse/oar')
  const real = oar.defaultRuntimes.get('codex')!
  return new Proxy(real, {
    get(target, prop) {
      if (prop === 'session') {
        return async (installation: never, options: never) => {
          const session = await target.session(installation, options)
          dumps.push(session as unknown as { records: () => unknown[] })
          return session
        }
      }
      const value = Reflect.get(target, prop) as unknown
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value
    },
  })
}

async function main(): Promise<void> {
  const dumps: { records: () => unknown[] }[] = []
  const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : undefined
  const scenarios = ALL.filter(name => only === undefined || only === name)
  const cwd = mkdtempSync(join(tmpdir(), 'persona-ht0c-cwd-'))
  const saved = { ...process.env }
  const log: Seen[] = []
  const plan: Plan = { suffix: RECALL, input: { query: 'regra de entrega' } }
  const { server, port } = await startFake(log, plan)
  const outcomes: Outcome[] = []
  const homes: string[] = []
  try {
    for (const scenario of scenarios) {
      log.length = 0
      plan.suffix = scenario === 'approval' ? EMAIL : scenario === 'ask' ? ASK : RECALL
      plan.input = scenario === 'forged'
        ? { query: 'regra de entrega', ticketId: 't-OUTRO' }
        : scenario === 'approval' ? { to: 'cliente@exemplo.com', subject: 'Prazo', text: 'Olá' }
          : scenario === 'ask' ? { question: 'Qual prazo você prefere?', options: ['hoje', 'amanhã'] } : { query: 'regra de entrega' }
      // A throw-away CODEX_HOME pointed at the fake provider: no login, no personal config, no MCP servers of the person.
      const home = mkdtempSync(join(tmpdir(), 'persona-ht0c-home-'))
      homes.push(home)
      mkdirSync(home, { recursive: true })
      writeFileSync(join(home, 'config.toml'), [
        'model = "ht0-model"',
        'model_provider = "ht0"',
        '[model_providers.ht0]',
        'name = "ht0 fake"',
        `base_url = "http://127.0.0.1:${String(port)}/v1"`,
        'env_key = "HT0_API_KEY"',
        'wire_api = "responses"',
        'requires_openai_auth = false',
        'request_max_retries = 0',
        'stream_max_retries = 0',
        '',
      ].join('\n'))
      Object.assign(process.env, { HT0_API_KEY: 'sk-ht0-dummy-key' })
      const hookCalls: string[] = []
      const askCalls: string[] = []
      let approvals = 0
      let sent = 0
      const gateway = createMcpGateway({
        hooks: {
          report: () => undefined,
          recall: ({ run, query }) => { hookCalls.push(`${run.personaId}/${run.ticketId}/${run.assignmentId}:${query}`); return `Regra de entrega: só vira Concluído depois de Aplicar. (consulta: ${query})` },
          ask: ({ run, question }) => { askCalls.push(`${run.personaId}/${run.ticketId}/${run.assignmentId}:${question}`) },
        },
        outbound: { emailSend: async () => { sent += 1; return 'enviado' } },
        onlyWired: true,
        onApproval: () => { approvals += 1 },
      })
      const level = scenario === 'no-grant' ? 'none' : scenario === 'approval' || scenario === 'ask' ? 'write' : 'read'
      const run = { personaId: 'nina', ticketId: 'ht0-t', assignmentId: `ht0c-${scenario}` }
      const debugRuntime = process.env.HT0_DUMP === '1' ? await wrapRuntimeForDump(dumps) : undefined
      const inner = await resolveRunner({
        ...(debugRuntime === undefined ? {} : { runtime: debugRuntime }),
        spec: { kind: 'cli', cli: 'codex', model: 'default' },
        permissionMode: 'deny',
        autonomy: 'act',
        purpose: 'talk',
        accountHome: home,
      })
      let turn: Awaited<ReturnType<typeof runTurn>>
      let set: TurnToolSet | undefined
      try {
        set = openTurnTools(gateway, { run, toolLevel: level, worktree: cwd })
        turn = await runTurn(inner, run, cwd, set)
        if (scenario === 'ask') {
          // the person answered: a second turn of the SAME session carries the answer and must not ask again
          plan.suffix = '__no_tool__'
          const run2 = { ...run, assignmentId: 'ht0c-ask-2' }
          const set2 = openTurnTools(gateway, { run: run2, toolLevel: level, worktree: cwd })
          const second = await runTurn(inner, run2, cwd, set2, 'A pessoa respondeu: amanhã. Siga com a tarefa.')
          turn = { ...second, ended: turn.ended && second.ended }
        }
      } finally {
        try { await inner.dispose?.() } catch (error) { void error }
        try { await disposeRunnerSessions() } catch (error) { void error }
      }
      if (process.env.HT0_DUMP === '1') {
        for (const session of dumps) {
          for (const record of session.records() as { kind?: string; native?: unknown }[]) {
            const text = JSON.stringify(record)
            if (/mcpToolCall/u.test(text)) process.stderr.write('[frame] ' + text.slice(0, 900) + String.fromCharCode(10))
          }
        }
        dumps.length = 0
      }
      const offered = [...new Set(log.flatMap(row => row.offered))].filter(name => name.includes('persona'))
      const results = log.filter(row => row.lastKind === 'tool_result').map(row => row.toolResult ?? '')
      let ok = false
      let why = ''
      if (scenario === 'read-ok') {
        ok = turn.ended && offered.length === 1 && offered[0]?.endsWith(RECALL) === true && hookCalls.length === 1
          && hookCalls[0] === 'nina/ht0-t/ht0c-read-ok:regra de entrega' && (results[0] ?? '').includes('só vira Concluído depois de Aplicar')
        why = ok ? 'lista só persona_recall; hook rodou como o turno; resultado voltou ao modelo' : 'falhou algum item de read-ok'
      } else if (scenario === 'forged') {
        ok = turn.ended && hookCalls.length === 0 && (results[0] ?? '').includes('forged actor refused')
        why = ok ? 'ticketId forjado recusado pelo gateway; hook nunca chamado' : 'o gateway não recusou o ticketId forjado'
      } else if (scenario === 'no-grant') {
        ok = turn.ended && offered.length === 0 && hookCalls.length === 0 && set === undefined
        why = ok ? 'sem concessão: a CLI não recebeu nenhuma ferramenta da Persona' : 'a CLI recebeu ferramenta sem concessão'
      } else if (scenario === 'ask') {
        const resumed = log.filter(row => row.lastKind === 'prompt' && row.offered.length > 0).at(-1)
        ok = turn.ended && offered.some(name => name.endsWith(ASK)) && askCalls.length === 1 && askCalls[0] === 'nina/ht0-t/ht0c-ask:Qual prazo você prefere?'
          && (results[0] ?? '').length > 0 && resumed?.priorTools === true && (resumed?.items ?? 0) > 4
        why = ok ? 'persona_ask chegou ao hook com a identidade do turno; o 2º turno da MESMA conversa recebeu a resposta (histórico com a pergunta)' : 'a pergunta não chegou ao hook, ou o 2º turno não continuou a mesma conversa'
      } else {
        ok = turn.ended && offered.some(name => name.endsWith(EMAIL)) && sent === 0 && approvals === 1
          && (results[0] ?? '').includes('Aprovação pedida: outbound_message')
        why = ok ? 'envio de email pausou para a pessoa (host avisado); nada foi enviado' : 'o envio não pausou para aprovação'
      }
      outcomes.push({ scenario, ended: turn.ended, endReport: turn.endReport, trail: turn.trail, finalText: turn.finalText.slice(0, 1800),
        offeredToModel: offered, toolResultsSeenByModel: results, hookCalls, sent, approvals, requests: log.length, ok, why })
    }
  } finally {
    server.close()
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key]
    Object.assign(process.env, saved)
    for (const dir of [cwd, ...homes]) {
      try { rmSync(dir, { recursive: true, force: true }) } catch (error) { void error }
    }
  }
  for (const row of outcomes) {
    process.stdout.write(`\n[${row.scenario}] ${row.ok ? 'OK' : 'FALHOU'} — ${row.why}\n`)
    process.stdout.write(`   ended=${String(row.ended)} requisições=${String(row.requests)} ferramentas oferecidas ao modelo=${JSON.stringify(row.offeredToModel)} hook=${JSON.stringify(row.hookCalls)} enviados=${String(row.sent)} aprovações=${String(row.approvals)}\n`)
    process.stdout.write(`   fim: ${row.endReport} trilha: ${JSON.stringify(row.trail)}\n`)
    process.stdout.write(`   tool_results vistos pelo modelo: ${JSON.stringify(row.toolResultsSeenByModel)}\n   texto final: ${JSON.stringify(row.finalText)}\n`)
  }
  mkdirSync(join(root, '.maestri', 'tmp'), { recursive: true })
  writeFileSync(join(root, '.maestri', 'tmp', 'ht0-codex-spike.json'), `${JSON.stringify({ note: 'fake local Responses endpoint; no real model call', outcomes }, null, 2)}\n`)
  process.exitCode = outcomes.every(row => row.ok) ? 0 : 1
}

main().then(() => { process.exit(process.exitCode ?? 0) }).catch((error: unknown) => {
  process.stderr.write(`ht0 codex spike failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`)
  process.exit(1)
})
