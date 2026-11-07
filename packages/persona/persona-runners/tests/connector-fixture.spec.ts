/**
 * OPT-10b: the TEST connector (no personal data) and the zero-model context measure it is counted with. The fixture must look like a real mail connector to the
 * permission gate and to the CLI (the right size, proven read tools, destructive ones marked) while answering only made-up data.
 */
import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { contextDelta, measureContext } from '../src/oar/context-measure.ts'
import type { ControlLaunch, ControlSession, OpenControl } from '../src/oar/claude-control.ts'
import { FIXTURE_LABELS, FIXTURE_SERVER, connectorFixtureDefinitions, connectorFixtureStatus, connectorFixtureToolSet, type FixtureCall } from '../src/mcp/connector-fixture.ts'
import { annotationTable } from '../src/resolve/permission-gate.ts'
import { classifyTool } from '../src/resolve/tool-action.ts'

describe('the fixture has the size and the shape of a real mail connector', () => {
  const definitions = connectorFixtureDefinitions(30)
  it('30 tools with unique names, descriptions and JSON schemas of a real connector\'s size', () => {
    expect(definitions).toHaveLength(30)
    expect(new Set(definitions.map(item => item.name)).size).toBe(30)
    const chars = JSON.stringify(definitions).length
    expect(chars).toBeGreaterThan(15_000)
    expect(chars).toBeLessThan(40_000)
    for (const item of definitions) {
      expect(item.description.length).toBeGreaterThan(40)
      expect(item.inputSchema).toMatchObject({ type: 'object' })
    }
  })
  it('the model finds list_labels where it would look for it, and a count other than 30 pads or trims', () => {
    expect(definitions.map(item => item.name)).toContain('list_labels')
    expect(connectorFixtureDefinitions(5)).toHaveLength(5)
    expect(connectorFixtureDefinitions(0)).toHaveLength(0)
    expect(connectorFixtureDefinitions(35)).toHaveLength(35)
  })
  it('reads are annotated readOnly, deletes/trashes destructive, and the gate classifies them that way (send and the rest are NOT proven reads)', () => {
    const table = annotationTable(connectorFixtureStatus(30))
    const prefix = `mcp__${FIXTURE_SERVER}__`
    expect(classifyTool(`${prefix}list_labels`, table(`${prefix}list_labels`)).actionClass).toBe('read')
    expect(classifyTool(`${prefix}get_message`, table(`${prefix}get_message`)).actionClass).toBe('read')
    expect(classifyTool(`${prefix}delete_label`, table(`${prefix}delete_label`)).actionClass).toBe('delete')
    expect(classifyTool(`${prefix}send_message`, table(`${prefix}send_message`)).actionClass).toBe('send')
    expect(classifyTool(`${prefix}create_draft`, table(`${prefix}create_draft`)).actionClass).toBe('change')
    // a tool the table does not know is a send (fail closed), not a read
    expect(classifyTool(`${prefix}frobnicate`, table(`${prefix}frobnicate`)).actionClass).toBe('send')
  })
})

describe('the fixture answers only made-up data and records only names', () => {
  it('list_labels returns the invented labels; any other tool a plain ok; the call log has tool names and nothing else', async () => {
    const calls: FixtureCall[] = []
    const set = connectorFixtureToolSet({ count: 30, calls })
    expect(set.server).toBe(FIXTURE_SERVER)
    expect(set.tools).toHaveLength(30)
    const labels = await set.tools.find(tool => tool.name === 'list_labels')?.handler({ query: 'qualquer coisa' })
    expect(JSON.parse(labels?.content ?? '{}')).toEqual({ labels: FIXTURE_LABELS.map(name => ({ name })), total: FIXTURE_LABELS.length })
    expect(JSON.parse((await set.tools.find(tool => tool.name === 'get_message')?.handler({ id: 'x' }))?.content ?? '{}')).toEqual({ ok: true, note: 'fixture' })
    expect(calls).toEqual([{ tool: 'list_labels', ran: true }, { tool: 'get_message', ran: true }])
    expect(JSON.stringify(calls)).not.toMatch(/qualquer coisa/u)
    expect(FIXTURE_LABELS.join(' ')).toMatch(/teste/u)
  })
})

describe('measureContext: the CLI counts its own opening context (control requests only)', () => {
  /** A fake control session: the context grows by 500 tokens per tool of the MCP server that came up. */
  function fakeOpen(log: string[], readyAfter = 1): OpenControl {
    return (launch: ControlLaunch): ControlSession => {
      const config = launch.args.includes('--mcp-config') ? (JSON.parse(launch.args[launch.args.indexOf('--mcp-config') + 1] ?? '{}') as { mcpServers?: Record<string, { env?: { TOOLS_FILE?: string } }> }) : undefined
      const name = Object.keys(config?.mcpServers ?? {})[0]
      const tools = name === undefined ? 0 : (JSON.parse(readFileSync(config?.mcpServers?.[name]?.env?.TOOLS_FILE ?? '', 'utf8')) as unknown[]).length
      let asked = 0
      return {
        request: async (subtype) => {
          log.push(subtype)
          if (subtype === 'mcp_status') { asked += 1; return { mcpServers: name === undefined ? [] : [{ name, status: asked > readyAfter ? 'connected' : 'pending', tools: new Array<unknown>(asked > readyAfter ? tools : 0).fill({}) }] } }
          if (subtype === 'get_context_usage') return { totalTokens: 1_600 + tools * 500, categories: [{ name: 'System prompt', tokens: 1_600 }, ...(tools > 0 ? [{ name: 'MCP tools', tokens: tools * 500 }] : [])] }
          return {}
        },
        close: async () => { log.push('close') },
      }
    }
  }

  it('with and without a server: the difference is what the tool definitions cost', async () => {
    const work = mkdtempSync(join(tmpdir(), 'ctx-measure-'))
    try {
      const log: string[] = []
      const open = fakeOpen(log)
      const launch = { args: ['--tools', ''], env: {}, cwd: work }
      const baseline = await measureContext(open, launch)
      const withServer = await measureContext(open, { ...launch, server: { name: 'overhead', definitions: connectorFixtureDefinitions(30), work }, pauseMs: 1 })
      expect(baseline).toMatchObject({ connected: true, serverTools: 0, totalTokens: 1_600 })
      expect(withServer).toMatchObject({ connected: true, serverTools: 30, totalTokens: 16_600 })
      expect(contextDelta(withServer, baseline)).toBe(15_000)
      expect(withServer.categories.find(item => item.name === 'MCP tools')?.tokens).toBe(15_000)
      expect(log.every(entry => ['initialize', 'mcp_status', 'get_context_usage', 'close'].includes(entry))).toBe(true) // control only: no prompt, no model
    } finally {
      rmSync(work, { recursive: true, force: true })
    }
  })

  it('a server that never comes up reports connected: false (the round would end at zero cost); a missing total gives no delta', async () => {
    const work = mkdtempSync(join(tmpdir(), 'ctx-measure-'))
    try {
      const never: OpenControl = () => ({ request: async subtype => (subtype === 'mcp_status' ? { mcpServers: [{ name: 'overhead', status: 'failed', tools: [] }] } : subtype === 'get_context_usage' ? { categories: [] } : {}), close: async () => undefined })
      const reading = await measureContext(never, { args: [], env: {}, cwd: work, server: { name: 'overhead', definitions: connectorFixtureDefinitions(3), work }, arriveMs: 20, pauseMs: 5 })
      expect(reading.connected).toBe(false)
      expect(contextDelta(reading, reading)).toBeUndefined()
    } finally {
      rmSync(work, { recursive: true, force: true })
    }
  })
})
