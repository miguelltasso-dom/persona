/**
 * ISO-1 dry proof (D-081, D-085) and per-CLI-version regression: does Claude, launched with EXACTLY the arguments and env the
 * product uses, come up isolated with the person's login intact AND the same model and effort as the native launch?
 *
 * ZERO model call, zero spend: only stream-json CONTROL requests and no user message. It uses the person's real login (that is
 * what is being proven). Counts and settings values only: no server name, no account.
 *
 *   node --import tsx/esm packages/persona/persona-runners/scripts/iso-dry.ts [--mode answer-only|needed|native] [--model default|<id>] [--connector [<max>]] [--skills] [--out <file.json>]
 *   --skills     HT-11 pre-flight: builds the product folder of pointers to the person's skills, proves it for this CLI version (adds the skills and
 *                nothing else) and checks it together with an account connector. Counts only; skill names are never printed.
 *
 *   --connector  ISO-5 pre-flight: finds the connected account connectors, proves each one the way the product does (allow-list by URL,
 *                exactly that connector, connected) and prints what it adds per call. Names and URLs are never printed or written.
 *
 * Exit 0 when every launch is `ok` and parity holds; 1 otherwise (the runner then keeps the call `native`, fail-safe).
 * Serialise it with the `check` lock like any other job. The product runs the same probes itself (`IsolationRuntime`).
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { settingsArgs } from '../src/oar/flag-settings.ts'
import { isolationPlan } from '../src/oar/isolation.ts'
import { cliPolicyOf } from '../src/resolve/cli-policy.ts'
import { defaultSkillsRoot, syncSkillsRoot } from '../src/oar/personal-skills.ts'
import { writeFileSync } from 'node:fs'
import { openClaudeControl } from '../src/oar/claude-control.ts'
import { type CallKind, type CliEnvMode } from '../src/oar/isolation.ts'
import { IsolationGate, IsolationRuntime } from '../src/oar/isolation-gate.ts'
import { probeCwd, probeParity, runIsolationProbe } from '../src/oar/isolation-run.ts'

const CLAUDE = process.env.CLAUDE_BIN ?? 'claude'

function argOf(name: string, fallback: string): string {
  const at = process.argv.indexOf(name)
  return at >= 0 ? (process.argv[at + 1] ?? fallback) : fallback
}

/** The proxy URLs of the account connectors that are connected now (they arrive 1-3 s after `initialize`). In memory only. */
async function connectedConnectorUrls(cwd: string): Promise<string[]> {
  const session = openClaudeControl(CLAUDE)({ args: [], env: {}, cwd })
  try {
    await session.request('initialize')
    let urls: string[] = []
    for (let waited = 0; waited < 12_000; waited += 600) {
      const status = await session.request('mcp_status')
      const rows = (Array.isArray(status.mcpServers) ? status.mcpServers : []) as { scope?: unknown; status?: unknown; config?: { url?: unknown } }[]
      urls = rows.filter(row => row.scope === 'claudeai' && row.status === 'connected' && typeof row.config?.url === 'string').map(row => String(row.config?.url))
      if (urls.length > 0 && !rows.some(row => row.status === 'pending')) break
      await new Promise(resolve => setTimeout(resolve, 600))
    }
    return [...new Set(urls)]
  } finally {
    await session.close()
  }
}

async function connectorDry(version: string, max: number, out: string | undefined): Promise<boolean> {
  const cwd = probeCwd()
  try {
    const urls = (await connectedConnectorUrls(cwd.dir)).slice(0, max)
    const runtime = new IsolationRuntime({ gate: new IsolationGate({ read: () => undefined, write: () => undefined }), open: openClaudeControl(CLAUDE) })
    const rows: Record<string, unknown>[] = []
    let ok = urls.length > 0
    for (const [index, url] of urls.entries()) {
      const started = Date.now()
      const cost = await runtime.connectorCostOf({ version, url })
      const ready = await runtime.connectorsReady({ version, urls: [url] })
      const row = { connector: `#${index + 1}`, urlHash: createHash('sha256').update(url).digest('hex').slice(0, 8), ok: cost?.ok === true, status: cost?.status ?? 'unmeasured', extraTokens: cost?.extraTokens ?? null, percent: cost?.percent ?? null, basisTokens: cost?.basisTokens ?? null, usableByRunner: ready.usable.length === 1, ms: Date.now() - started }
      rows.push(row)
      ok = ok && row.ok && row.usableByRunner
      process.stdout.write(`${row.ok ? 'OK  ' : 'FAIL'} conector ${row.connector} (url #${row.urlHash}): ${row.status}; custo por chamada: ${row.extraTokens === null ? 'n/d' : `+${String(row.extraTokens)} tokens (${row.percent === null ? 'n/d' : `+${(Number(row.percent) * 100).toFixed(1)}%`} do chao de ${String(row.basisTokens)})`}; o runner o considera usavel: ${String(row.usableByRunner)}; ${row.ms} ms\n`)
    }
    if (urls.length === 0) process.stdout.write('FAIL nenhum conector de conta conectado para provar\n')
    if (out !== undefined && out !== '') {
      writeFileSync(out, `${JSON.stringify({ note: 'ISO-5 pre-flight with the product code path; control requests only (zero model); no connector name or URL', claudeVersion: version, ok, rows }, null, 2)}\n`)
    }
    process.stdout.write(`${ok ? 'CONNECTORS PROVEN' : 'CONNECTORS NOT PROVEN — the runner drops them and the call stays at the floor'} (claude ${version})\n`)
    return ok
  } finally {
    cwd.dispose()
  }
}

async function skillsDry(version: string, out: string | undefined): Promise<boolean> {
  const cwd = probeCwd()
  try {
    const folder = syncSkillsRoot({})
    if (folder === undefined) {
      process.stdout.write('FAIL a pessoa nao tem skills pessoais para provar\n')
      return false
    }
    const open = openClaudeControl(CLAUDE)
    const runtime = new IsolationRuntime({ gate: new IsolationGate({ read: () => undefined, write: () => undefined }), open })
    const started = Date.now()
    const probe = await runtime.skillsReady({ version, root: folder.root })
    process.stdout.write(`${probe?.ok === true ? 'OK  ' : 'FAIL'} skills pessoais (${String(folder.count)} apontadas, pasta ${defaultSkillsRoot() === folder.root ? 'padrao do produto' : 'outra'}): ${probe?.status ?? 'nao medido'}; comandos a mais: ${String(probe?.extraCommands ?? 'n/d')}; contexto de abertura ${String(probe?.openingTokens ?? 'n/d')} (sem a pasta: ${String(probe?.baselineTokens ?? 'n/d')}); ${Date.now() - started} ms\n`)
    // The folder together with an account connector (local sources + allow-list + --add-dir): skills AND the connector, and nothing else.
    const url = (await connectedConnectorUrls(cwd.dir))[0]
    let combined: Record<string, unknown> = { tried: false }
    let combinedOk = true
    if (url !== undefined) {
      const plan = isolationPlan('claude', { env: { PERSONA_CLI_ENV: 'needed' }, call: 'task', personalSkills: folder.root, accountConnectors: [url] })
      const vendor = cliPolicyOf('claude', { files: 'write' }, 'allow-once')
      const readCombined = async (args: readonly string[]): Promise<{ commands: number; servers: { status?: unknown }[]; effort: unknown }> => {
        const session = open({ args, env: plan.env, cwd: cwd.dir })
        try {
          const init = await session.request('initialize')
          await new Promise(resolve => setTimeout(resolve, 6000))
          const status = await session.request('mcp_status')
          const settings = await session.request('get_settings')
          return {
            commands: Array.isArray(init.commands) ? init.commands.length : 0,
            servers: (Array.isArray(status.mcpServers) ? status.mcpServers : []) as { status?: unknown }[],
            effort: ((settings.applied ?? {}) as { effort?: unknown }).effort ?? null,
          }
        } finally {
          await session.close()
        }
      }
      const full = [...vendor.launchArgs, ...plan.launchArgs, ...settingsArgs(plan.settings)]
      const withoutFolder = [...vendor.launchArgs, ...plan.launchArgs.filter((arg, at, all) => arg !== '--add-dir' && all[at - 1] !== '--add-dir'), ...settingsArgs(plan.settings)]
      const both = await readCombined(full)
      const connectorOnly = await readCombined(withoutFolder)
      const extra = both.commands - connectorOnly.commands
      const connected = (rows: { status?: unknown }[]): number => rows.filter(row => row.status === 'connected').length
      combined = { tried: true, commandsWithFolder: both.commands, commandsWithoutFolder: connectorOnly.commands, extraCommands: extra, mcpServers: both.servers.length, connected: connected(both.servers), connectorOnlyServers: connectorOnly.servers.length, effort: both.effort }
      combinedOk = both.servers.length === 1 && connected(both.servers) === 1 && connectorOnly.servers.length === 1 && extra > 0 && both.effort === connectorOnly.effort
      process.stdout.write(`${combinedOk ? 'OK  ' : 'FAIL'} skills + 1 conector de conta juntos: comandos ${String(both.commands)} (sem a pasta ${String(connectorOnly.commands)}, a mais ${String(extra)}); servidores=${String(both.servers.length)} conectados=${String(connected(both.servers))}; esforco igual: ${String(both.effort === connectorOnly.effort)}\n`)
    } else {
      process.stdout.write('-    sem conector conectado para testar a combinacao\n')
    }
    const ok = probe?.ok === true && combinedOk
    if (out !== undefined && out !== '') {
      writeFileSync(out, `${JSON.stringify({ note: 'HT-11 pre-flight with the product code path; control requests only (zero model); counts only', claudeVersion: version, ok, pointers: folder.count, probe, combined }, null, 2)}\n`)
    }
    process.stdout.write(`${ok ? 'SKILLS PROVEN' : 'SKILLS NOT PROVEN — the runner drops them and the call stays at the floor'} (claude ${version})\n`)
    return ok
  } finally {
    cwd.dispose()
  }
}

async function main(): Promise<void> {
  const mode = argOf('--mode', 'needed') as CliEnvMode
  const modelArg = argOf('--model', 'default')
  const out = process.argv.includes('--out') ? argOf('--out', '') : undefined
  let version = 'unknown'
  try { version = execFileSync(CLAUDE, ['--version'], { encoding: 'utf8' }).trim() } catch (error) { void error }
  const open = openClaudeControl(CLAUDE)
  if (process.argv.includes('--skills')) process.exit((await skillsDry(version, out)) ? 0 : 1)
  if (process.argv.includes('--connector')) {
    const asked = Number(argOf('--connector', '3'))
    process.exit((await connectorDry(version, Number.isFinite(asked) && asked > 0 ? asked : 3, out)) ? 0 : 1)
  }
  const cwd = probeCwd()
  try {
    const calls: CallKind[] = mode === 'answer-only' ? ['answer'] : ['answer', 'task']
    const run = await runIsolationProbe(open, { mode, calls, cwd: cwd.dir })
    for (const row of run.rows) {
      process.stdout.write(`${row.ok ? 'OK  ' : 'FAIL'} ${row.call === 'answer' ? 'conversa (deny, sem ferramentas)' : 'tarefa (allow-once, arquivos)'}: logged=${String(row.reading.loggedIn)} mcp=${String(row.reading.mcpServers)} commands=${String(row.reading.commands)} builtinToolTokens=${String(row.reading.builtinToolTokens ?? 'n/d')} openingContext=${String(row.openingContextTokens ?? 'n/d')}${row.failures.length === 0 ? '' : ` failures=${row.failures.join(',')}`}\n`)
    }
    const parity = await probeParity(open, { modelArg, cwd: cwd.dir })
    process.stdout.write(`${parity.ok ? 'OK  ' : 'FAIL'} paridade de modelo e esforco (persona '${modelArg}'): nativo model=${parity.native.model ?? 'n/d'} effort=${parity.native.effort ?? 'n/d'} | isolado model=${parity.isolated.model ?? 'n/d'} effort=${parity.isolated.effort ?? 'n/d'} | argumentos extras: ${parity.extraArgs.join(' ') || '(nenhum)'}\n`)
    const ok = run.ok && parity.ok
    if (out !== undefined && out !== '') {
      writeFileSync(out, `${JSON.stringify({ note: 'ISO-1 dry proof with the product isolation arguments; control requests only; counts and settings values only', claudeVersion: version, mode, modelArg, ok, rows: run.rows, parity }, null, 2)}\n`)
    }
    process.stdout.write(`${ok ? 'ISOLATED' : 'NOT PROVEN — the runner keeps the call native'} (claude ${version}, mode ${mode})\n`)
    process.exit(ok ? 0 : 1)
  } finally {
    cwd.dispose()
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`iso-dry failed: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
