import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { withFakeCliOnPath } from '../src/fake-cli.ts'
import { PACKAGE_ROOT } from '../src/paths.ts'

const FAKE_CLI_SCRIPT = join(PACKAGE_ROOT, 'fixtures', 'fake-cli', 'fake-cli.mjs')

async function runCliSession(
  args: string[],
  inputs: object[],
  env?: NodeJS.ProcessEnv,
  cwd?: string,
): Promise<{ lines: string[]; parsed: unknown[]; elapsedMs: number }> {
  const t0 = Date.now()
  const child = spawn(process.execPath, [FAKE_CLI_SCRIPT, ...args], {
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'inherit'],
    ...(cwd === undefined ? {} : { cwd }),
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

  it('every launcher keeps its own identity even when OAR unwraps the .cmd shim and runs `node <script>` directly', () => {
    // OAR resolves a `.cmd` by running the script it wraps and drops the arguments baked into the shim, so codex and
    // opencode used to answer as claude. Identity now lives in the per-tool script, not in the shim arguments.
    const expected: Record<string, string> = {
      claude: '2.1.317',
      codex: '0.166.0',
      opencode: '1.19.3',
      'cursor-agent': '2026.10.22',
    }
    for (const [tool, version] of Object.entries(expected)) {
      const direct = execFileSync(process.execPath, [join(PACKAGE_ROOT, 'fixtures', 'fake-cli', `${tool}.mjs`), '--version'], { encoding: 'utf8', timeout: 10_000 }).trim()
      expect(direct, `${tool}.mjs`).toContain(version)
      const shim = execFileSync(join(PACKAGE_ROOT, 'fixtures', 'fake-cli', `${tool}.cmd`), ['--version'], { encoding: 'utf8', shell: true, timeout: 10_000 }).trim()
      expect(shim, `${tool}.cmd`).toContain(version)
    }
  })

  describe('writes a real revision during the turn (Revisar mudanças without a model call)', () => {
    const turn = [{ type: 'user', uuid: 'cmd-write', message: { role: 'user', content: [{ type: 'text', text: 'atualize o cardápio' }] } }]
    const scratch = (): { draft: string; project: string; log: string; done(): void } => {
      const root = mkdtempSync(join(tmpdir(), 'fake-write-'))
      const draft = join(root, 'rascunho')
      const project = join(root, 'projeto')
      mkdirSync(draft)
      mkdirSync(project)
      return { draft, project, log: join(root, 'calls.jsonl'), done: () => { rmSync(root, { recursive: true, force: true }) } }
    }

    it('FAKE_CLI_WRITE_FILE writes the file in the stub\'s working directory (the draft) and logs it', async () => {
      const dirs = scratch()
      try {
        await runCliSession(['claude', '-p', '--input-format', 'stream-json'], turn,
          { FAKE_CLI_WRITE_FILE: 'cardapio.md', FAKE_CLI_WRITE_CONTENT: 'Pão francês: R$ 1,10\n', FAKE_CLI_LOG: dirs.log }, dirs.draft)
        expect(readFileSync(join(dirs.draft, 'cardapio.md'), 'utf8')).toBe('Pão francês: R$ 1,10\n')
        expect(existsSync(join(dirs.project, 'cardapio.md'))).toBe(false)
        const calls = readFileSync(dirs.log, 'utf8').trim().split(/\r?\n/u).map(line => JSON.parse(line) as { event: string; file?: string })
        expect(calls.some(call => call.event === 'write' && call.file === 'cardapio.md')).toBe(true)
      } finally {
        dirs.done()
      }
    })

    it('FAKE_CLI_CONFLICT_DIR also edits the same file in the person\'s project: a real conflict', async () => {
      const dirs = scratch()
      try {
        await runCliSession(['claude', '-p', '--input-format', 'stream-json'], turn, {
          FAKE_CLI_WRITE_FILE: 'cardapio.md', FAKE_CLI_WRITE_CONTENT: 'versão da persona\n',
          FAKE_CLI_CONFLICT_DIR: dirs.project, FAKE_CLI_CONFLICT_CONTENT: 'versão da pessoa\n', FAKE_CLI_LOG: dirs.log,
        }, dirs.draft)
        expect(readFileSync(join(dirs.draft, 'cardapio.md'), 'utf8')).toBe('versão da persona\n')
        expect(readFileSync(join(dirs.project, 'cardapio.md'), 'utf8')).toBe('versão da pessoa\n')
      } finally {
        dirs.done()
      }
    })

    it('refuses an absolute path or one that climbs out of the working directory (nothing is written)', async () => {
      const dirs = scratch()
      try {
        for (const bad of ['../fora.md', join(dirs.project, 'abs.md'), 'a/../../fora.md']) {
          await runCliSession(['claude', '-p', '--input-format', 'stream-json'], turn, { FAKE_CLI_WRITE_FILE: bad, FAKE_CLI_LOG: dirs.log }, dirs.draft)
        }
        expect(existsSync(join(dirs.draft, '..', 'fora.md'))).toBe(false)
        expect(existsSync(join(dirs.project, 'abs.md'))).toBe(false)
        const events = readFileSync(dirs.log, 'utf8').trim().split(/\r?\n/u).map(line => (JSON.parse(line) as { event: string }).event)
        expect(events.filter(event => event === 'write-refused')).toHaveLength(3)
        expect(events).not.toContain('write')
      } finally {
        dirs.done()
      }
    })

    it('withFakeCliOnPath maps writeFile/conflictDir to the env and restores them', () => {
      const scope = withFakeCliOnPath({ writeFile: 'cardapio.md', writeContent: 'x', conflictDir: tmpdir(), conflictContent: 'y' })
      try {
        expect(process.env.FAKE_CLI_WRITE_FILE).toBe('cardapio.md')
        expect(process.env.FAKE_CLI_CONFLICT_DIR).toBe(tmpdir())
      } finally {
        scope.restore()
      }
      expect(process.env.FAKE_CLI_WRITE_FILE).toBeUndefined()
      expect(process.env.FAKE_CLI_CONFLICT_DIR).toBeUndefined()
    })
  })

  it('FAKE_CLI_REPLIES scripts the conversation: turn N answers with element N (counted from the shared log), the last one repeats', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fake-replies-'))
    const log = join(dir, 'calls.jsonl')
    try {
      const replies = JSON.stringify(['primeira', '{"state":"waiting","summary":"preciso do preço","question":"Qual o preço novo?"}', 'final'])
      const seen: string[] = []
      for (let turn = 1; turn <= 4; turn += 1) {
        const { parsed } = await runCliSession(['claude', '-p', '--input-format', 'stream-json'],
          [{ type: 'user', uuid: `cmd-${String(turn)}`, message: { role: 'user', content: [{ type: 'text', text: 'oi' }] } }],
          { FAKE_CLI_REPLIES: replies, FAKE_CLI_LOG: log })
        const assistant = parsed.find(row => (row as { type?: string }).type === 'assistant') as { message: { content: { text: string }[] } }
        seen.push(assistant.message.content[0]!.text)
      }
      expect(seen[0]).toBe('primeira')
      expect(seen[1]).toContain('"question":"Qual o preço novo?"')
      expect(seen[2]).toBe('final')
      expect(seen[3]).toBe('final')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('FAKE_CLI_RULES answers by WHAT was asked (first matching rule), independent of the turn number', async () => {
    const rules = JSON.stringify([
      { match: 'R\\$ ?1,10', reply: 'final' },
      { match: 'Atualize o cardápio', reply: 'pergunta' },
    ])
    const ask = async (text: string): Promise<string> => {
      const { parsed } = await runCliSession(['claude', '-p', '--input-format', 'stream-json'],
        [{ type: 'user', uuid: 'cmd-rule', message: { role: 'user', content: [{ type: 'text', text }] } }],
        { FAKE_CLI_RULES: rules, FAKE_CLI_REPLY: 'padrão' })
      const assistant = parsed.find(row => (row as { type?: string }).type === 'assistant') as { message: { content: { text: string }[] } }
      return assistant.message.content[0]!.text
    }
    expect(await ask('Atualize o cardápio com os preços novos')).toBe('pergunta')
    expect(await ask('Atualize o cardápio. O pão francês passa a custar R$ 1,10')).toBe('final') // most specific rule first
    expect(await ask('bom dia')).toBe('padrão')
  })
})
