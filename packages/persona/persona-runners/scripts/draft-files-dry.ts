/**
 * P0-1 "a arte vira arquivo" proven against the REAL `claude` (zero model, zero spend, no login): the CLI talks to a FAKE Anthropic endpoint on 127.0.0.1 (API-key mode, blank HOME) that
 * "asks" it to call one tool per scenario, and the files on disk say what REALLY ran. The arguments are the product's own: `cliPolicyOf` for the persona's grants, the gate's `settings()`
 * for the draft containment. What it proves: a text-only persona is offered NO file or shell tool; with `files: write` (no shell) the CLI offers Write/Edit, a Write INSIDE the draft saves the
 * file, a Write OUTSIDE it (real folder, `..`) is denied, and Bash/PowerShell never run.
 *
 *   node --import tsx/esm packages/persona/persona-runners/scripts/draft-files-dry.ts [--out <file.json>]
 *
 * Exit 0 when every scenario behaved as promised; 1 otherwise. Serialise it with the `check` lock like any other job.
 */

import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cliPolicyOf } from '../src/resolve/cli-policy.ts'
import { PermissionGate } from '../src/resolve/permission-gate.ts'

const CLAUDE = process.env.CLAUDE_BIN ?? 'claude'
const FILE_TOOLS = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit']
const SHELL_TOOLS = ['Bash', 'PowerShell']

interface Plan { readonly tool: string; readonly input: Record<string, unknown> }
interface Seen { requests: number; offered: string[] }

/** A fake Anthropic that makes "the model" call the planned tool once (whether or not the CLI offered it), then end. */
function fakeAnthropic(plan: { current: Plan | undefined }, seen: Seen): Promise<{ server: Server; port: number }> {
  const server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => { chunks.push(chunk) })
    req.on('end', () => {
      const path = (req.url ?? '').split('?')[0] ?? ''
      if (!path.endsWith('/v1/messages')) { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"input_tokens":10}'); return }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as { model?: string; tools?: { name?: string }[]; messages?: { content?: unknown }[] }
      seen.requests += 1
      if (seen.requests === 1) seen.offered = (body.tools ?? []).map(item => item.name ?? '')
      const last = body.messages?.at(-1)
      const answered = Array.isArray(last?.content) && (last.content as { type?: string }[]).some(block => block.type === 'tool_result')
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      const send = (event: string, data: unknown): void => { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`) }
      send('message_start', { type: 'message_start', message: { id: 'm', type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 1 } } })
      const call = plan.current
      if (!answered && call !== undefined) {
        send('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_1', name: call.tool, input: {} } })
        send('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(call.input) } })
        send('content_block_stop', { type: 'content_block_stop', index: 0 })
        send('message_delta', { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 5 } })
      } else {
        send('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })
        send('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'ok' } })
        send('content_block_stop', { type: 'content_block_stop', index: 0 })
        send('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 2 } })
      }
      send('message_stop', { type: 'message_stop' })
      res.end()
    })
  })
  return new Promise((resolve) => { server.listen(0, '127.0.0.1', () => { resolve({ server, port: (server.address() as { port: number }).port }) }) })
}

interface Row { readonly name: string; readonly ok: boolean; readonly detail: string }

async function runCli(options: { tools: Record<string, 'none' | 'read' | 'write'>; mode: 'deny' | 'allow-once'; gate: PermissionGate; port: number; home: string; draft: string }): Promise<boolean> {
  const policy = cliPolicyOf('claude', options.tools, options.mode)
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: options.home, USERPROFILE: options.home, ANTHROPIC_BASE_URL: `http://127.0.0.1:${String(options.port)}`, ANTHROPIC_API_KEY: 'sk-ant-dry-dummy' }
  for (const name of ['CLAUDECODE', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_CHILD_SESSION']) delete env[name]
  const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--no-session-persistence', ...policy.launchArgs,
    ...(policy.disallowedTools.length > 0 ? ['--disallowedTools', policy.disallowedTools.join(',')] : []),
    '--setting-sources', 'project', '--model', 'haiku', '--settings', JSON.stringify(options.gate.settings())]
  const child = spawn(CLAUDE, args, { cwd: options.draft, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
  let output = ''
  let done = false
  child.stdout.on('data', (chunk: Buffer) => { output += String(chunk); if (/"type":"result"/u.test(output)) done = true })
  child.stderr.on('data', () => undefined)
  child.stdin.write(`${JSON.stringify({ type: 'user', message: { role: 'user', content: 'salve o cartaz' } })}\n`)
  const started = Date.now()
  while (!done && Date.now() - started < 40_000) await new Promise<void>((resolve) => { setTimeout(resolve, 200) })
  try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }) } catch (error) { void error; child.kill() }
  return done
}

async function main(): Promise<void> {
  const outAt = process.argv.indexOf('--out')
  const out = outAt >= 0 ? process.argv[outAt + 1] : undefined
  let version = 'unknown'
  try { version = execFileSync(CLAUDE, ['--version'], { encoding: 'utf8' }).trim() } catch (error) { void error }
  const base = mkdtempSync(join(tmpdir(), 'draftdry-'))
  const home = join(base, 'home')
  const draft = join(base, 'rascunho')
  const real = join(base, 'pasta-real')
  for (const dir of [home, draft, real]) mkdirSync(dir)
  const plan: { current: Plan | undefined } = { current: undefined }
  const seen: Seen = { requests: 0, offered: [] }
  const { server, port } = await fakeAnthropic(plan, seen)
  const gate = await PermissionGate.start()
  const rows: Row[] = []
  const fwd = (path: string): string => path.replace(/\\/gu, '/')
  const scenario = async (name: string, tools: Record<string, 'none' | 'read' | 'write'>, mode: 'deny' | 'allow-once', call: Plan, check: (offered: string[]) => string | undefined): Promise<void> => {
    seen.requests = 0
    seen.offered = []
    plan.current = call
    gate.arm({ draftRoot: draft })
    const done = await runCli({ tools, mode, gate, port, home, draft })
    const problem = !done ? 'the turn did not finish' : check(seen.offered)
    rows.push({ name, ok: problem === undefined, detail: problem ?? `offered: ${seen.offered.filter(tool => !tool.startsWith('mcp__')).join(',') || '(none)'}` })
  }
  try {
    const textFile = join(draft, 'so-texto.svg')
    await scenario('só-texto (tools {}): nenhuma ferramenta de arquivo nem de shell, nada é escrito', {}, 'deny', { tool: 'Write', input: { file_path: textFile, content: '<svg/>' } }, (offered) => {
      const leaked = [...FILE_TOOLS, ...SHELL_TOOLS].filter(tool => offered.includes(tool))
      if (leaked.length > 0) return `offered ${leaked.join(',')}`
      return existsSync(textFile) ? 'a file was written' : undefined
    })
    const saved = join(draft, 'cartaz.svg')
    await scenario('files:write — Write DENTRO do rascunho salva o arquivo; Edit oferecido; Bash/PowerShell NÃO', { files: 'write' }, 'allow-once', { tool: 'Write', input: { file_path: saved, content: '<svg>arte</svg>' } }, (offered) => {
      if (!offered.includes('Write') || !offered.includes('Edit')) return `Write/Edit not offered (${offered.join(',')})`
      // exactly the grant: nothing but file tools, the schema lookup and the placeholder the CLI adds for deferred tools (no shell, no sub-agents, skills, workflows, wake-ups)
      const extra = offered.filter(tool => !tool.startsWith('mcp__') && ![...FILE_TOOLS, 'Read', 'Glob', 'Grep', 'ToolSearch', 'DeferredToolPlaceholder'].includes(tool))
      if (extra.length > 0) return `offered beyond the grant: ${extra.join(',')}`
      return existsSync(saved) && readFileSync(saved, 'utf8') === '<svg>arte</svg>' ? undefined : 'the file was not saved in the draft'
    })
    const elsewhere = join(real, 'cartaz.svg')
    await scenario('files:write — Write FORA do rascunho (a pasta real) é NEGADO', { files: 'write' }, 'allow-once', { tool: 'Write', input: { file_path: elsewhere, content: 'x' } }, () => (existsSync(elsewhere) ? 'a file reached the real folder' : undefined))
    const dotdot = join(real, 'dotdot.svg')
    await scenario('files:write — Write por ".." (rascunho/../pasta-real) é NEGADO', { files: 'write' }, 'allow-once', { tool: 'Write', input: { file_path: `${fwd(draft)}/../pasta-real/dotdot.svg`, content: 'x' } }, () => (existsSync(dotdot) ? 'a ".." path reached the real folder' : undefined))
    for (const tool of SHELL_TOOLS) {
      const marker = join(real, `marker-${tool}.txt`)
      await scenario(`files:write — ${tool} NÃO executa (a escrita de arquivo não abre o shell)`, { files: 'write' }, 'allow-once', { tool, input: { command: tool === 'PowerShell' ? `Set-Content -Path '${marker}' -Value x` : `echo x > "${fwd(marker)}"`, description: 'marker' } }, () => (existsSync(marker) ? `${tool} ran a command` : undefined))
    }
  } finally {
    await gate.close()
    server.close()
    try { rmSync(base, { recursive: true, force: true }) } catch (error) { void error }
  }
  const ok = rows.every(row => row.ok)
  for (const row of rows) process.stdout.write(`${row.ok ? 'OK  ' : 'FAIL'} ${row.name} — ${row.detail}\n`)
  if (out !== undefined) writeFileSync(out, `${JSON.stringify({ note: 'P0-1 draft files against the real CLI; fake endpoint; zero model', claudeVersion: version, ok, rows }, null, 2)}\n`)
  process.stdout.write(`${ok ? 'DRAFT FILES OBEYED' : 'DRAFT FILES NOT OBEYED'} (claude ${version})\n`)
  process.exit(ok ? 0 : 1)
}

main().catch((error: unknown) => {
  process.stderr.write(`draft-files-dry failed: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
