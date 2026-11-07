import type { Runtime, SessionOptions } from '@botiverse/oar'
import { scriptedRuntime } from '@botiverse/oar/testing'
import { describe, expect, it } from 'vitest'
import {
  CODEX_CAPABILITIES,
  createOarRunner,
  ToolsUnavailableError,
  type RunEvent,
  type ServeHostTools,
  type StartTurnInput,
  type TurnToolSet,
} from '../src/index.ts'
import { CODEX_BLOCK_BEGIN, CODEX_BLOCK_END, codexToolsConfigBlock, ensureCodexToolsConfig, type CodexConfigIo } from '../src/oar/codex-tools-config.ts'

function memoryIo(initial?: string): CodexConfigIo & { files: Map<string, string>; writes: number } {
  const files = new Map<string, string>()
  if (initial !== undefined) files.set('C:/homes/nina/config.toml', initial)
  const io = {
    files,
    writes: 0,
    read: (path: string) => files.get(path),
    write: (path: string, text: string) => { io.writes += 1; files.set(path, text) },
  }
  return io
}

describe('Codex product-tools approval block (HT-0): the isolated home pre-approves ONLY the server the product serves', () => {
  it('creates config.toml with a disabled, pre-approved placeholder entry (no secret in it)', () => {
    const io = memoryIo()
    ensureCodexToolsConfig('C:/homes/nina', 'persona', io)
    const text = io.files.get('C:/homes/nina/config.toml') ?? ''
    expect(text).toBe(codexToolsConfigBlock('persona'))
    expect(text).toContain('[mcp_servers.persona]')
    expect(text).toContain('enabled = false')
    expect(text).toContain('default_tools_approval_mode = "approve"')
    expect(text).not.toMatch(/token|bearer|authorization/iu)
  })

  it('is idempotent and leaves the person\'s own settings byte for byte', () => {
    const mine = 'model = "gpt-x"\n\n[mcp_servers.github]\nurl = "https://example.invalid/mcp"\n'
    const io = memoryIo(mine)
    ensureCodexToolsConfig('C:/homes/nina', 'persona', io)
    const once = io.files.get('C:/homes/nina/config.toml') ?? ''
    expect(once.startsWith(mine)).toBe(true)
    expect(once.endsWith(`${CODEX_BLOCK_END}\n`)).toBe(true)
    ensureCodexToolsConfig('C:/homes/nina', 'persona', io)
    expect(io.files.get('C:/homes/nina/config.toml')).toBe(once)
    expect(io.writes).toBe(1)
  })

  it('replaces only its own block when the managed content changes', () => {
    const stale = `before = 1\n\n${CODEX_BLOCK_BEGIN}\n[mcp_servers.persona]\nurl = "http://old"\n${CODEX_BLOCK_END}\n\nafter = 2\n`
    const io = memoryIo(stale)
    ensureCodexToolsConfig('C:/homes/nina', 'persona', io)
    const text = io.files.get('C:/homes/nina/config.toml') ?? ''
    expect(text).toContain('before = 1')
    expect(text).toContain('after = 2')
    expect(text).not.toContain('http://old')
    expect(text.match(/\[mcp_servers\.persona\]/gu)).toHaveLength(1)
  })

  it('refuses (tools_unavailable) when the file already defines that server outside our block: a TOML table cannot be defined twice', () => {
    const io = memoryIo('[mcp_servers.persona]\nurl = "https://elsewhere.invalid/mcp"\n')
    expect(() => ensureCodexToolsConfig('C:/homes/nina', 'persona', io)).toThrow(ToolsUnavailableError)
    expect(io.writes).toBe(0)
  })
})

describe('Codex runner: product tools only in an isolated home', () => {
  const base: StartTurnInput = {
    ticketId: 't-1', assignmentId: 'a-1', personaId: 'nina', cwd: 'C:/tmp/t-1', prompt: 'oi', model: 'scripted-1', permissionMode: 'deny',
  }
  const tools: TurnToolSet = {
    tools: [{ name: 'persona_recall', description: 'x', inputSchema: { type: 'object' }, handler: async () => ({ content: 'ok' }) }],
  }
  const serve: ServeHostTools = async options => ({
    server: { name: options.name, type: 'http', url: 'http://127.0.0.1:9/x', headers: { authorization: 'Bearer t' } },
    close: async () => undefined,
  })

  function runnerWith(extra: { codexHome?: string; io?: CodexConfigIo }) {
    const base0 = scriptedRuntime({ id: 'fake-cli', turn: (turn) => { turn.say('ok') } })
    const opened: SessionOptions[] = []
    const runtime: Runtime = new Proxy(base0, {
      get(target, prop) {
        if (prop === 'session') return (installation: never, options: SessionOptions) => { opened.push(options); return target.session(installation, options) }
        const value = Reflect.get(target, prop) as unknown
        return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value
      },
    })
    const runner = createOarRunner({
      runtime, capabilities: CODEX_CAPABILITIES, serveTools: serve,
      ...(extra.codexHome === undefined ? {} : { codexHome: extra.codexHome }),
      ...(extra.io === undefined ? {} : { codexConfigIo: extra.io }),
    })
    return { runner, opened }
  }

  async function drain(events: AsyncIterable<RunEvent>): Promise<void> {
    for await (const event of events) void event
  }

  it('writes the block into the isolated home and serves the tools (no secret on the command line)', async () => {
    const io = memoryIo()
    const { runner, opened } = runnerWith({ codexHome: 'C:/homes/nina', io })
    await drain(runner.stream(await runner.start({ ...base, mcpTools: tools })))
    expect(io.files.get('C:/homes/nina/config.toml')).toContain('default_tools_approval_mode = "approve"')
    expect(opened[0]?.mcpServers).toEqual([expect.objectContaining({ name: 'persona', type: 'http' })])
    expect(opened[0]?.launchArgs ?? []).toEqual([])
  })

  it('offers NO product tools to a Codex that runs in the person\'s native home, and never writes there', async () => {
    const io = memoryIo()
    const { runner, opened } = runnerWith({ io })
    await drain(runner.stream(await runner.start({ ...base, mcpTools: tools })))
    expect(io.writes).toBe(0)
    expect(opened[0]?.mcpServers).toBeUndefined()
  })
})
