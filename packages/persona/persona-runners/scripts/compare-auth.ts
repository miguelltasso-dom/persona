/**
 * Compare native CLI login vs OAR authStatus with/without leftover isolation.
 * Never prints tokens or emails.
 */
import { defaultRuntimes } from '@botiverse/oar'
import { restoreNativeCliLogin } from '../src/oar/native-cli-env.ts'
import { nativeSessionEnv } from '../src/oar/native-cli-env.ts'

function summarize(status: unknown): Record<string, unknown> {
  if (status === null || typeof status !== 'object') return { kind: 'unknown' }
  const record = status as { kind?: unknown; account?: { plan?: unknown; method?: unknown } }
  const out: Record<string, unknown> = { kind: typeof record.kind === 'string' ? record.kind : 'unknown' }
  if (typeof record.account?.plan === 'string') out.plan = record.account.plan
  if (typeof record.account?.method === 'string') out.method = record.account.method
  return out
}

async function authOf(id: 'claude' | 'codex'): Promise<Record<string, unknown>> {
  const runtime = defaultRuntimes.get(id)
  if (runtime?.authStatus === undefined || runtime.installation === undefined) {
    return { id, kind: 'unavailable' }
  }
  const snap = await runtime.installation()
  if (snap.kind !== 'available') return { id, kind: snap.kind }
  return { id, ...summarize(await runtime.authStatus(snap, { timeoutMs: 20_000 })) }
}

async function main(): Promise<void> {
  const leftover = {
    CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR ?? null,
    CODEX_HOME: process.env.CODEX_HOME ?? null,
    HOME: process.env.HOME === undefined ? null : process.env.HOME === '' ? '(empty)' : '(set)',
    USERPROFILE: process.env.USERPROFILE === undefined ? null : '(set)',
  }

  process.env.CLAUDE_CONFIG_DIR = 'C:\\Users\\migue\\dev\\persona\\.maestri\\tmp\\ai-memory-spike\\claude-config'
  process.env.CODEX_HOME = 'C:\\Users\\migue\\dev\\persona\\.maestri\\tmp\\ai-memory-spike\\codex-home'
  const withIsolation = {
    claude: await authOf('claude'),
    codex: await authOf('codex'),
  }

  restoreNativeCliLogin()
  const native = {
    claude: await authOf('claude'),
    codex: await authOf('codex'),
  }

  process.stdout.write(`${JSON.stringify({
    leftoverBeforeRestore: leftover,
    runnerSessionEnvDefault: nativeSessionEnv(),
    oarAuthWithIsolationEnv: withIsolation,
    oarAuthAfterRestoreNative: native,
  }, null, 2)}\n`)
}

await main()
