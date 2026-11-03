/**
 * Read-only OAR probe of the four Persona CLI runtimes on this machine.
 * Never logs in, never sends a prompt, never prints tokens or account emails.
 */
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createRuntimeRegistry,
  defaultRuntimes,
  type AvailableInstallation,
  type Runtime,
} from '@botiverse/oar'
import { restoreNativeCliLogin } from '../src/oar/native-cli-env.ts'

const here = dirname(fileURLToPath(import.meta.url))
const runnersRoot = join(here, '..')
const requireFromRunners = createRequire(join(runnersRoot, 'package.json'))

const KNOWN_VERSIONS = {
  claude: '2.1.317',
  codex: '0.166.0',
  'cursor-agent': '2026.10.22',
  opencode: '1.19.3',
} as const

const ADAPTER_SESSION_CAPABILITIES: Record<string, {
  queue: { durable: boolean }
  attribution: string
  images: boolean
}> = {
  claude: { queue: { durable: false }, attribution: 'attributed', images: true },
  codex: { queue: { durable: true }, attribution: 'nested', images: true },
  opencode: { queue: { durable: false }, attribution: 'nested', images: false },
  cursor: { queue: { durable: false }, attribution: 'attributed', images: true },
}

const RESUME_SUPPORT: Record<string, { supported: boolean; note: string }> = {
  claude: { supported: true, note: 'native --resume / SessionOptions.resume' },
  codex: { supported: true, note: 'native thread resume' },
  opencode: { supported: true, note: 'ACP resume only in the same cwd' },
  cursor: { supported: true, note: 'SDK resume; model must be supplied again' },
}

function redactAuth(status: unknown): unknown {
  if (status === null || typeof status !== 'object') return status
  const record = status as Record<string, unknown>
  const account = record.account
  if (account !== null && typeof account === 'object') {
    const raw = account as Record<string, unknown>
    return {
      kind: record.kind,
      source: record.source,
      account: {
        plan: typeof raw.plan === 'string' ? raw.plan : undefined,
        method: typeof raw.method === 'string' ? raw.method : undefined,
        hasEmail: typeof raw.email === 'string' && raw.email.length > 0,
      },
    }
  }
  return { kind: record.kind, source: record.source, detail: record.detail }
}

function summarizeModels(result: unknown): unknown {
  if (result === null || typeof result !== 'object') return result
  const record = result as Record<string, unknown>
  if (record.kind !== 'ok' || !Array.isArray(record.models)) {
    return { kind: record.kind, detail: record.detail, reason: record.reason }
  }
  const models = record.models.map((entry) => {
    const model = entry as Record<string, unknown>
    return {
      id: model.id,
      displayName: model.displayName,
      default: model.default === true ? true : undefined,
      provider: model.provider,
    }
  })
  return {
    kind: 'ok',
    count: models.length,
    models: models.slice(0, 20),
    truncated: models.length > 20,
  }
}

function whereCommand(name: string): string | undefined {
  const result = spawnSync('where.exe', [name], { encoding: 'utf8', windowsHide: true })
  if (result.status !== 0) return undefined
  const first = result.stdout.split(/\r?\n/u).map(line => line.trim()).find(line => line.length > 0)
  return first
}

function loadCursorSdk(): { ok: true; version: string } | { ok: false; reason: string } {
  try {
    const entry = requireFromRunners.resolve('@cursor/sdk')
    let dir = dirname(entry)
    for (let i = 0; i < 6; i += 1) {
      try {
        const pkg = requireFromRunners(join(dir, 'package.json')) as { name?: string; version?: string }
        if (pkg.name === '@cursor/sdk') return { ok: true, version: pkg.version ?? 'unknown' }
      } catch {
        // Walk toward the package root; exports hide package.json.
      }
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
    return { ok: true, version: 'unknown' }
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? String((error as { code?: string }).code) : 'ERR'
    return { ok: false, reason: `@cursor/sdk not installed (${code}); required 1.0.37 — not installing` }
  }
}

async function probeRuntime(id: string, runtime: Runtime): Promise<Record<string, unknown>> {
  const refused = runtime.refusedSessionOptions ?? {}
  const sessionCapabilities = ADAPTER_SESSION_CAPABILITIES[id] ?? null
  const resume = RESUME_SUPPORT[id] ?? { supported: false, note: 'unknown' }
  const mcpServersSupported = refused.mcpServers === undefined
  let installation: unknown
  try {
    installation = runtime.installation === undefined ? { kind: 'unsupported', reason: 'no installation probe' } : await runtime.installation()
  } catch (error) {
    installation = { kind: 'error', message: error instanceof Error ? error.message : String(error) }
  }

  const available = installation !== null && typeof installation === 'object' && (installation as { kind?: string }).kind === 'available'
    ? installation as AvailableInstallation
    : undefined

  let authStatus: unknown = { kind: 'skipped', reason: 'no authStatus or installation unavailable' }
  if (available !== undefined && runtime.authStatus !== undefined) {
    try {
      authStatus = redactAuth(await runtime.authStatus(available, { timeoutMs: 20_000 }))
    } catch (error) {
      authStatus = { kind: 'error', message: error instanceof Error ? error.message : String(error) }
    }
  }

  let models: unknown = { kind: 'skipped', reason: 'no listModels or installation unavailable' }
  if (available !== undefined && runtime.listModels !== undefined) {
    try {
      models = summarizeModels(await runtime.listModels(available, { cwd: process.cwd(), timeoutMs: 30_000 }))
    } catch (error) {
      models = { kind: 'error', message: error instanceof Error ? error.message : String(error) }
    }
  }

  return {
    id,
    brand: runtime.brand.name,
    installation,
    authStatus,
    listModels: models,
    sessionCapabilities,
    sessionCapabilitiesSource: 'adapter-declared; session() was not opened (read-only probe, no prompts)',
    refusedSessionOptions: refused,
    mcpServers: {
      supported: mcpServersSupported,
      mcpToolsListChanged: runtime.mcpToolsListChanged ?? null,
      refusal: refused.mcpServers ?? null,
    },
    resume,
  }
}

async function main(): Promise<void> {
  restoreNativeCliLogin()
  const cursorAgentPath = whereCommand('cursor-agent')
  const grokAgentPath = whereCommand('agent')
  const cursorSdk = loadCursorSdk()

  const reports: Record<string, unknown> = {}

  for (const id of ['claude', 'codex', 'opencode'] as const) {
    const runtime = defaultRuntimes.get(id)
    if (runtime === undefined) {
      reports[id] = { id, error: 'not in defaultRuntimes' }
      continue
    }
    reports[id] = await probeRuntime(id, runtime)
  }

  if (!cursorSdk.ok) {
    reports.cursor = {
      id: 'cursor',
      error: cursorSdk.reason,
      cursorAgent: {
        command: 'cursor-agent',
        path: cursorAgentPath ?? null,
        knownVersion: KNOWN_VERSIONS['cursor-agent'],
        executed: false,
        note: 'did not spawn cursor-agent.cmd (promote-staged); agent on PATH is Grok and was not used',
      },
      grokAgentOnPath: grokAgentPath !== undefined,
    }
  } else {
    const { createCursorRuntime } = await import('@botiverse/oar')
    const registry = createRuntimeRegistry([
      ...defaultRuntimes.list(),
      createCursorRuntime({ sdk: () => import('@cursor/sdk') }),
    ])
    reports.cursor = {
      ...await probeRuntime('cursor', registry.require('cursor')),
      cursorSdkVersion: cursorSdk.version,
      cursorAgent: {
        command: 'cursor-agent',
        path: cursorAgentPath ?? null,
        knownVersion: KNOWN_VERSIONS['cursor-agent'],
        executed: false,
      },
    }
  }

  process.stdout.write(`${JSON.stringify({
    probedAt: new Date().toISOString(),
    platform: process.platform,
    node: process.versions.node,
    oar: '0.67.0',
    knownLocalVersions: KNOWN_VERSIONS,
    runtimes: reports,
  }, null, 2)}\n`)
}

await main()
