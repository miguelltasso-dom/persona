/**
 * HT-0 spike: does a product tool reach the REAL Claude CLI, run as the turn, and obey the gateway ACL? (D-084)
 *
 * NO real model call, NO quota, NO spend. The installed `claude` is started by the product's own `resolveRunner` (the same OAR session
 * the host uses) but pointed at a LOCAL fake Anthropic endpoint (`ANTHROPIC_BASE_URL`) with a dummy key and a throw-away HOME / config
 * dir. The fake is a script: it logs the tool names the CLI offers the model, answers the first request with a `tool_use` of a product
 * tool, and finishes the turn once it sees the `tool_result` — so what is measured is the transport, not a model.
 *
 * Scenarios (each with its own runner, except `warm`):
 *   read-ok    grant `read`: the model is offered `mcp__persona__persona_recall` (and nothing above the grant), calls it, the gateway runs
 *              the host hook as THIS turn's run, and the result comes back to the model as the tool_result.
 *   forged     same, but the model forges `ticketId` in the arguments: the gateway refuses it, the hook is never called.
 *   no-grant   grant `none`: the CLI is offered no persona tool at all (no server was even served).
 *   approval   grant `write`: the model calls `persona_email_send`: the call PAUSES for the person (host notified), nothing is sent.
 *   warm       two turns on the SAME live CLI session: each call runs as its own turn (assignment), never as the previous one.
 *
 * node --import tsx/esm packages/persona/persona-runners/scripts/ht0-claude-spike.ts [--only read-ok|forged|no-grant|approval|warm]
 * Writes .maestri/tmp/ht0-claude-spike.json and prints a table. Exit 0 only when every scenario matches what it must prove.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createMcpGateway, disposeRunnerSessions, openTurnTools, resolveRunner, type TurnToolSet } from '../src/index.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const CALL_MS = 120_000
const RECALL = 'mcp__persona__persona_recall'
const EMAIL = 'mcp__persona__persona_email_send'
const ASK = 'mcp__persona__persona_ask'

interface Seen {
  readonly path: string
  readonly model: string
  readonly offered: readonly string[]
  readonly lastKind: 'prompt' | 'tool_result' | 'other'
  readonly toolResult?: string
  /** The request carries earlier tool_use/tool_result blocks: the CLI is replaying the conversation it already had. */
  readonly priorTools: boolean
  readonly messages: number
}

type Scenario = 'read-ok' | 'forged' | 'no-grant' | 'approval' | 'warm' | 'ask'
const ALL: readonly Scenario[] = ['read-ok', 'forged', 'no-grant', 'approval', 'warm', 'ask']

/** What the scripted "model" does on the next prompt: call this tool with this input. */
interface Plan {
  target: string
  input: Record<string, unknown>
}

function textOfContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.map((part) => {
    if (typeof part !== 'object' || part === null) return ''
    const row = part as { text?: unknown; content?: unknown }
    return typeof row.text === 'string' ? row.text : row.content !== undefined ? textOfContent(row.content) : ''
  }).join(' ')
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
      if (path.endsWith('/count_tokens')) {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ input_tokens: Math.ceil(raw.length / 4) }))
        return
      }
      if (!path.endsWith('/v1/messages')) {
        res.writeHead(404, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ type: 'error', error: { type: 'not_found_error', message: 'ht0 fake: unknown path' } }))
        return
      }
      const messages = Array.isArray(body.messages) ? body.messages as { role?: string; content?: unknown }[] : []
      // Claude Code sends its environment as a trailing `system` message: the turn is the last user/assistant one.
      const last = messages.filter(row => row.role !== 'system').at(-1)
      const blocks = Array.isArray(last?.content) ? last.content as { type?: string; content?: unknown }[] : []
      const resultBlock = blocks.find(block => block.type === 'tool_result')
      const offered = Array.isArray(body.tools) ? (body.tools as { name?: unknown }[]).map(tool => String(tool.name)) : []
      const mainLoop = offered.length > 0 || messages.length > 1
      const lastKind: Seen['lastKind'] = resultBlock !== undefined ? 'tool_result' : last?.role === 'user' ? 'prompt' : 'other'
      const seen: Seen = {
        path, model: typeof body.model === 'string' ? body.model : '', offered, lastKind,
        messages: messages.length,
        priorTools: messages.some(row => Array.isArray(row.content) && (row.content as { type?: string }[]).some(block => block.type === 'tool_use' || block.type === 'tool_result')),
        ...(resultBlock === undefined ? {} : { toolResult: textOfContent(resultBlock.content).slice(0, 400) }),
      }
      log.push(seen)
      if (process.env.HT0_DEBUG === '1') {
        const head = (row: { role?: string; content?: unknown } | undefined): string => `${row?.role ?? '?'}:${textOfContent(row?.content).replace(/\s+/gu, ' ').slice(0, 70)}`
        process.stderr.write(`[fake] ${path} stream=${String(body.stream === true)} max=${String(body.max_tokens)} tools=${offered.join(',')} msgs=${messages.map(head).join(' | ')} last=${lastKind}\n`)
      }
      const stream = body.stream === true
      const message = {
        id: `msg_ht0_${String(log.length)}`, type: 'message', role: 'assistant', model: seen.model === '' ? 'ht0-model' : seen.model,
        content: [] as unknown[], stop_reason: null, stop_sequence: null,
        usage: { input_tokens: Math.ceil(raw.length / 4), output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      }
      const wantsTool = mainLoop && offered.includes(plan.target) && lastKind === 'prompt'
      const answer = lastKind === 'tool_result' ? `HT0-DONE ${seen.toolResult ?? ''}`.slice(0, 300) : 'ok'
      if (!stream) {
        res.writeHead(200, { 'content-type': 'application/json' })
        const content = wantsTool
          ? [{ type: 'tool_use', id: `toolu_ht0_${String(log.length)}`, name: plan.target, input: plan.input }]
          : [{ type: 'text', text: answer }]
        res.end(JSON.stringify({ ...message, content, stop_reason: wantsTool ? 'tool_use' : 'end_turn' }))
        return
      }
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
      const send = (event: string, data: unknown): void => { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`) }
      send('message_start', { type: 'message_start', message })
      if (wantsTool) {
        send('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: `toolu_ht0_${String(log.length)}`, name: plan.target, input: {} } })
        send('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(plan.input) } })
        send('content_block_stop', { type: 'content_block_stop', index: 0 })
        send('message_delta', { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 8 } })
      } else {
        send('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })
        send('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: answer } })
        send('content_block_stop', { type: 'content_block_stop', index: 0 })
        send('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 4 } })
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
      ...run, cwd, model: 'haiku', permissionMode: 'deny',
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

async function main(): Promise<void> {
  const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : undefined
  const scenarios = ALL.filter(name => only === undefined || only === name)
  const home = mkdtempSync(join(tmpdir(), 'persona-ht0-home-'))
  const cwd = mkdtempSync(join(tmpdir(), 'persona-ht0-cwd-'))
  mkdirSync(join(home, '.claude'), { recursive: true })
  const saved = { ...process.env }
  const log: Seen[] = []
  const plan: Plan = { target: RECALL, input: { query: 'regra de entrega' } }
  const { server, port } = await startFake(log, plan)
  const outcomes: Outcome[] = []
  try {
    for (const scenario of scenarios) {
      log.length = 0
      plan.target = scenario === 'approval' ? EMAIL : scenario === 'ask' ? ASK : RECALL
      plan.input = scenario === 'forged'
        ? { query: 'regra de entrega', ticketId: 't-OUTRO' }
        : scenario === 'approval' ? { to: 'cliente@exemplo.com', subject: 'Prazo', text: 'Olá' }
          : scenario === 'ask' ? { question: 'Qual prazo você prefere?', options: ['hoje', 'amanhã'] } : { query: 'regra de entrega' }
      Object.assign(process.env, {
        HOME: home, USERPROFILE: home, APPDATA: join(home, 'AppData'), LOCALAPPDATA: join(home, 'AppData', 'Local'),
        ANTHROPIC_BASE_URL: `http://127.0.0.1:${String(port)}`, ANTHROPIC_API_KEY: 'sk-ant-ht0-dummy-key',
      })
      delete process.env.CLAUDE_CODE_OAUTH_TOKEN
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
      const runOf = (assignmentId: string) => ({ personaId: 'nina', ticketId: 'ht0-t', assignmentId })
      const inner = await resolveRunner({
        spec: { kind: 'cli', cli: 'claude', model: 'haiku' },
        permissionMode: 'deny',
        autonomy: 'act',
        purpose: 'talk',
        accountHome: join(home, '.claude'),
      })
      const turns: Awaited<ReturnType<typeof runTurn>>[] = []
      let anySet = false
      try {
        const names = scenario === 'warm' ? ['ht0-warm-1', 'ht0-warm-2'] : scenario === 'ask' ? ['ht0-ask-1', 'ht0-ask-2'] : [`ht0-${scenario}`]
        for (const assignmentId of names) {
          const second = scenario === 'ask' && assignmentId === 'ht0-ask-2'
          // the person answered: the second turn of the SAME session carries the answer and must not ask again
          if (second) plan.target = ''
          const set = openTurnTools(gateway, { run: runOf(assignmentId), toolLevel: level, worktree: cwd })
          anySet = anySet || set !== undefined
          turns.push(await runTurn(inner, runOf(assignmentId), cwd, set, second ? 'A pessoa respondeu: amanhã. Siga com a tarefa.' : undefined))
        }
      } finally {
        try { await inner.dispose?.() } catch (error) { void error }
        try { await disposeRunnerSessions() } catch (error) { void error }
      }
      const last = turns.at(-1) ?? { ended: false, finalText: '', endReport: '', trail: [] }
      const main = log.filter(row => row.offered.length > 0 || row.lastKind === 'tool_result')
      const offered = [...new Set(main.flatMap(row => row.offered))].filter(name => name.startsWith('mcp__'))
      const results = main.filter(row => row.lastKind === 'tool_result').map(row => row.toolResult ?? '')
      const allEnded = turns.length > 0 && turns.every(turn => turn.ended)
      let ok = false
      let why = ''
      if (scenario === 'read-ok') {
        ok = allEnded && offered.length === 1 && offered[0] === RECALL && hookCalls.length === 1
          && hookCalls[0] === 'nina/ht0-t/ht0-read-ok:regra de entrega' && (results[0] ?? '').includes('só vira Concluído depois de Aplicar')
        why = ok ? 'lista só persona_recall; hook rodou como o turno; resultado voltou ao modelo' : 'falhou algum item de read-ok'
      } else if (scenario === 'forged') {
        ok = allEnded && hookCalls.length === 0 && (results[0] ?? '').includes('forged actor refused')
        why = ok ? 'ticketId forjado recusado pelo gateway; hook nunca chamado' : 'o gateway não recusou o ticketId forjado'
      } else if (scenario === 'no-grant') {
        ok = allEnded && offered.length === 0 && hookCalls.length === 0 && !anySet
        why = ok ? 'sem concessão: a CLI não recebeu nenhuma ferramenta da Persona' : 'a CLI recebeu ferramenta sem concessão'
      } else if (scenario === 'approval') {
        ok = allEnded && offered.includes(EMAIL) && sent === 0 && approvals === 1 && (results[0] ?? '').includes('Aprovação pedida: outbound_message')
        why = ok ? 'envio de email pausou para a pessoa (host avisado); nada foi enviado' : 'o envio não pausou para aprovação'
      } else if (scenario === 'ask') {
        const resumed = log.filter(row => row.lastKind === 'prompt' && row.offered.length > 0).at(-1)
        ok = allEnded && offered.includes(ASK) && askCalls.length === 1 && askCalls[0] === 'nina/ht0-t/ht0-ask-1:Qual prazo você prefere?'
          && (results[0] ?? '').length > 0 && resumed?.priorTools === true && (resumed?.messages ?? 0) > 2
        why = ok ? 'persona_ask chegou ao hook com a identidade do turno; o 2º turno da MESMA conversa recebeu a resposta (histórico com a pergunta)' : 'a pergunta não chegou ao hook, ou o 2º turno não continuou a mesma conversa'
      } else {
        ok = allEnded && hookCalls.length === 2 && hookCalls[0] === 'nina/ht0-t/ht0-warm-1:regra de entrega'
          && hookCalls[1] === 'nina/ht0-t/ht0-warm-2:regra de entrega'
        why = ok ? 'dois turnos na mesma sessão da CLI: cada chamada rodou como o seu turno' : 'identidade do turno errada na sessão quente'
      }
      outcomes.push({ scenario, ended: last.ended, endReport: last.endReport, trail: last.trail, finalText: last.finalText.slice(0, 200),
        offeredToModel: offered, toolResultsSeenByModel: results, hookCalls, sent, approvals, requests: log.length, ok, why })
    }
  } finally {
    server.close()
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key]
    Object.assign(process.env, saved)
    for (const dir of [home, cwd]) {
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
  writeFileSync(join(root, '.maestri', 'tmp', 'ht0-claude-spike.json'), `${JSON.stringify({ note: 'fake local Anthropic endpoint; no real model call', outcomes }, null, 2)}\n`)
  process.exitCode = outcomes.every(row => row.ok) ? 0 : 1
}

main().then(() => { process.exit(process.exitCode ?? 0) }).catch((error: unknown) => {
  process.stderr.write(`ht0 spike failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`)
  process.exit(1)
})
