import { execFileSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { withFakeCliOnPath } from '../src/fake-cli.ts'
import { PACKAGE_ROOT } from '../src/paths.ts'

const FAKE_CLI_SCRIPT = join(PACKAGE_ROOT, 'fixtures', 'fake-cli', 'fake-cli.mjs')

async function runCliSession(
  args: string[],
  inputs: object[],
  env?: NodeJS.ProcessEnv,
): Promise<{ lines: string[]; parsed: unknown[]; elapsedMs: number }> {
  const t0 = Date.now()
  const child = spawn(process.execPath, [FAKE_CLI_SCRIPT, ...args], {
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'inherit'],
  })

  const lines: string[] = []
  child.stdout.setEncoding('utf8')
  let buffer = ''
  child.stdout.on('data', (chunk) => {
    buffer += chunk
    const parts = buffer.split(/\r?\n/u)
    buffer = parts.pop() ?? ''
    for (const part of parts) {
      if (part.trim().length > 0) lines.push(part.trim())
    }
  })

  for (const input of inputs) {
    child.stdin.write(`${JSON.stringify(input)}\n`)
  }
  child.stdin.end()

  await new Promise<void>((resolve, reject) => {
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`fake-cli exited with code ${String(code)}`))
    })
    child.on('error', reject)
  })

  const elapsedMs = Date.now() - t0
  const parsed = lines.map((line) => {
    try {
      return JSON.parse(line)
    } catch {
      return line
    }
  })

  return { lines, parsed, elapsedMs }
}

describe('persona-e2e fake CLI fixtures', () => {
  it('answers --version via fake stub cmd', () => {
    const scope = withFakeCliOnPath()
    try {
      const stub = join(scope.binDir, 'claude.cmd')
      const version = execFileSync(stub, ['--version'], { encoding: 'utf8', shell: true }).trim()
      expect(version).toContain('fake-persona-e2e')
    } finally {
      scope.restore()
    }
  })

  it('runs fake-cli.mjs directly for auth probes', () => {
    const out = execFileSync(process.execPath, [FAKE_CLI_SCRIPT, 'claude', 'auth', 'status', '--json'], { encoding: 'utf8' })
    const parsed = JSON.parse(out)
    expect(parsed.loggedIn).toBe(true)
    expect(parsed.status).toBe('authenticated')

    const codexOut = execFileSync(process.execPath, [FAKE_CLI_SCRIPT, 'codex', 'login', 'status'], { encoding: 'utf8' })
    expect(codexOut).toContain('Logged in using ChatGPT')
  })

  it('answers list_models and get_usage control requests', async () => {
    const { parsed } = await runCliSession(['claude', '-p', '--input-format', 'stream-json'], [
      { type: 'control_request', request_id: 'req-models', request: { subtype: 'list_models' } },
      { type: 'control_request', request_id: 'req-usage', request: { subtype: 'get_usage' } },
    ])

    const modelsResp = parsed.find(msg => (msg as { response?: { request_id?: string } })?.response?.request_id === 'req-models') as {
      response: { subtype: string; response: { models: { value: string }[] } }
    }
    expect(modelsResp).toBeDefined()
    expect(modelsResp.response.subtype).toBe('success')
    expect(modelsResp.response.response.models.some(m => m.value.includes('haiku'))).toBe(true)

    const usageResp = parsed.find(msg => (msg as { response?: { request_id?: string } })?.response?.request_id === 'req-usage') as {
      response: { subtype: string; response: { rate_limits_available: boolean } }
    }
    expect(usageResp).toBeDefined()
    expect(usageResp.response.subtype).toBe('success')
    expect(usageResp.response.response.rate_limits_available).toBe(true)
  })

  it('answers a short turn with assistant delivery and completed status', async () => {
    const { parsed } = await runCliSession(['claude', '-p', '--input-format', 'stream-json'], [
      {
        type: 'user',
        uuid: 'cmd-turn-1',
        message: { role: 'user', content: [{ type: 'text', text: 'Prepare o cardápio.' }] },
      },
    ])

    const startMsg = parsed.find(m => (m as { type?: string; state?: string })?.type === 'command_lifecycle' && (m as { state?: string })?.state === 'started') as { command_uuid: string }
    expect(startMsg).toBeDefined()
    expect(startMsg.command_uuid).toBe('cmd-turn-1')

    const assistantMsg = parsed.find(m => (m as { type?: string })?.type === 'assistant') as {
      message: { content: { type: string; text: string }[] }
    }
    expect(assistantMsg).toBeDefined()
    expect(assistantMsg.message.content[0]?.text).toContain('Agência Ponto')

    const resultMsg = parsed.find(m => (m as { type?: string })?.type === 'result') as { subtype: string }
    expect(resultMsg).toBeDefined()
    expect(resultMsg.subtype).toBe('success')

    const completeMsg = parsed.find(m => (m as { type?: string; state?: string })?.type === 'command_lifecycle' && (m as { state?: string })?.state === 'completed') as { command_uuid: string }
    expect(completeMsg).toBeDefined()
    expect(completeMsg.command_uuid).toBe('cmd-turn-1')
  })

  it('respects configurable latency via FAKE_CLI_TURN_MS', async () => {
    const latencyMs = 120
    const { elapsedMs } = await runCliSession(
      ['claude', '-p', '--input-format', 'stream-json'],
      [
        {
          type: 'user',
          uuid: 'cmd-turn-delay',
          message: { role: 'user', content: [{ type: 'text', text: 'Delay test' }] },
        },
      ],
      { FAKE_CLI_TURN_MS: String(latencyMs) },
    )
    expect(elapsedMs).toBeGreaterThanOrEqual(90)
  })

  it('respects configurable failure via FAKE_CLI_FAIL', async () => {
    const { parsed } = await runCliSession(
      ['claude', '-p', '--input-format', 'stream-json'],
      [
        {
          type: 'user',
          uuid: 'cmd-turn-fail',
          message: { role: 'user', content: [{ type: 'text', text: 'Fail test' }] },
        },
      ],
      { FAKE_CLI_FAIL: 'falha de motor simulada' },
    )

    const resultMsg = parsed.find(m => (m as { type?: string })?.type === 'result') as {
      subtype: string
      is_error: boolean
      errors: string[]
    }
    expect(resultMsg).toBeDefined()
    expect(resultMsg.subtype).toBe('error_during_execution')
    expect(resultMsg.is_error).toBe(true)
    expect(resultMsg.errors).toContain('falha de motor simulada')
  })

  it('respects quota failure via FAKE_CLI_FAIL=quota', async () => {
    const { parsed } = await runCliSession(
      ['claude', '-p', '--input-format', 'stream-json'],
      [
        {
          type: 'user',
          uuid: 'cmd-turn-quota',
          message: { role: 'user', content: [{ type: 'text', text: 'Quota test' }] },
        },
      ],
      { FAKE_CLI_FAIL: 'quota' },
    )

    const resultMsg = parsed.find(m => (m as { type?: string })?.type === 'result') as {
      terminal_reason: string
      is_error: boolean
    }
    expect(resultMsg).toBeDefined()
    expect(resultMsg.terminal_reason).toBe('usage_limit_exceeded')
    expect(resultMsg.is_error).toBe(true)
  })

  it('respects custom reply via FAKE_CLI_REPLY', async () => {
    const customText = 'Entrega customizada do teste de aceitação.'
    const { parsed } = await runCliSession(
      ['claude', '-p', '--input-format', 'stream-json'],
      [
        {
          type: 'user',
          uuid: 'cmd-turn-custom',
          message: { role: 'user', content: [{ type: 'text', text: 'Custom test' }] },
        },
      ],
      { FAKE_CLI_REPLY: customText },
    )

    const assistantMsg = parsed.find(m => (m as { type?: string })?.type === 'assistant') as {
      message: { content: { type: string; text: string }[] }
    }
    expect(assistantMsg.message.content[0]?.text).toBe(customText)
  })

  it('supports withFakeCliOnPath options helper', () => {
    const scope = withFakeCliOnPath({ turnMs: 250, fail: 'test-fail', reply: 'custom-reply' })
    try {
      expect(process.env.FAKE_CLI_TURN_MS).toBe('250')
      expect(process.env.FAKE_CLI_FAIL).toBe('test-fail')
      expect(process.env.FAKE_CLI_REPLY).toBe('custom-reply')
      expect(process.env.PERSONA_E2E_EXTRA_PATH).toBe(scope.binDir)
    } finally {
      scope.restore()
    }
    expect(process.env.PERSONA_E2E_EXTRA_PATH).toBeUndefined()
    expect(process.env.FAKE_CLI_TURN_MS).toBeUndefined()
    expect(process.env.FAKE_CLI_FAIL).toBeUndefined()
    expect(process.env.FAKE_CLI_REPLY).toBeUndefined()
  })

  it('pins the OAR binaries to the stubs so a fake run can never reach a real engine, then restores them', () => {
    const before = { claude: process.env.OAR_CLAUDE_BIN, codex: process.env.OAR_CODEX_BIN, opencode: process.env.OAR_OPENCODE_BIN }
    const scope = withFakeCliOnPath()
    try {
      for (const [envVar, name] of [['OAR_CLAUDE_BIN', 'claude'], ['OAR_CODEX_BIN', 'codex'], ['OAR_OPENCODE_BIN', 'opencode']] as const) {
        const pinned = process.env[envVar] ?? ''
        expect(pinned.startsWith(scope.binDir)).toBe(true)
        expect(pinned.toLowerCase()).toContain(name)
        expect(existsSync(pinned)).toBe(true)
      }
    } finally {
      scope.restore()
    }
    expect({ claude: process.env.OAR_CLAUDE_BIN, codex: process.env.OAR_CODEX_BIN, opencode: process.env.OAR_OPENCODE_BIN }).toEqual(before)
  })

  it('logs every invocation and answered turn to FAKE_CLI_LOG so a test can prove the app called the stub', async () => {
    const scope = withFakeCliOnPath({ reply: 'ok' })
    try {
      execFileSync(process.execPath, [FAKE_CLI_SCRIPT, 'claude', '--version'], { encoding: 'utf8' })
      await runCliSession(['claude', '-p', '--input-format', 'stream-json'], [
        { type: 'user', uuid: 'cmd-log-1', message: { role: 'user', content: [{ type: 'text', text: 'log me' }] } },
      ], { FAKE_CLI_LOG: scope.logFile })
      const calls = scope.invocations()
      expect(calls.filter(call => call.event === 'invoke').length).toBeGreaterThanOrEqual(1)
      expect(calls.filter(call => call.event === 'turn')).toHaveLength(1)
      expect(calls.every(call => call.tool === 'claude')).toBe(true)
    } finally {
      scope.restore()
    }
  })

  it('answers readiness --help probes instead of waiting on stdin (codex app-server --help)', () => {
    const out = execFileSync(process.execPath, [FAKE_CLI_SCRIPT, 'codex', 'app-server', '--help'], { encoding: 'utf8', timeout: 10_000 })
    expect(out).toContain('fake-persona-e2e')
  })
})
