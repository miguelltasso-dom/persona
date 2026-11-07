/**
 * TEAM-4: the tool of a round of opinions as the model sees it. The rules (caps, who is asked, the cost, the lines) live in the HOST; here
 * only that it is announced when wired, bound to the RUN (a forged identity in the arguments never reaches the host), and gated by the grant.
 */
import { describe, expect, it } from 'vitest'
import { HARNESS_TOOLS, harnessMcpTools, type HarnessCall } from '../src/mcp/harness-tools.ts'

const RUN = { personaId: 'atlas', ticketId: 't-1', assignmentId: 'a-1' }

describe('ask_team_opinion', () => {
  it('is part of the harness tools and announced ONLY when the host wired it (there is no separate "close": the host consolidates)', () => {
    expect(HARNESS_TOOLS).toContain('ask_team_opinion')
    expect(HARNESS_TOOLS).not.toContain('team_opinion_close')
    expect(harnessMcpTools(RUN, { tools: ['board_list'], call: async () => '{}' }, 'write').map(tool => tool.name)).toEqual(['board_list'])
    expect(harnessMcpTools(RUN, { tools: ['ask_team_opinion'], call: async () => '{}' }, 'write').map(tool => tool.name)).toEqual(['ask_team_opinion'])
    expect(harnessMcpTools(RUN, { call: async () => '{}' }, 'write')).toEqual([])
  })

  it('is COORDINATION (D-097), not a write on the person\'s files: a `read` persona has it, and the host opens a lease at `read` for a persona with no grant at all; the ACL, the caps and the budget are the host\'s (opinion-host.ts)', () => {
    const ports = { tools: ['ask_team_opinion'] as const, call: async () => '{}' }
    expect(harnessMcpTools(RUN, ports, 'read')).toHaveLength(1)
    expect(harnessMcpTools(RUN, ports, 'write')).toHaveLength(1)
    expect(harnessMcpTools(RUN, ports, 'none')).toEqual([]) // at `none` no lease opens at all; the host's opener raises it to `read` for the coordination tools
  })

  it('describes what the model passes: question + draft required; the round is the host\'s, never an argument', () => {
    const [ask] = harnessMcpTools(RUN, { tools: ['ask_team_opinion'], call: async () => '{}' }, 'write')
    expect(ask?.inputSchema).toMatchObject({ required: ['question', 'draft'], additionalProperties: false })
    expect(Object.keys((ask?.inputSchema as { properties: Record<string, unknown> }).properties).sort()).toEqual(['audience', 'draft', 'question'])
    expect(ask?.description).toMatch(/worth it/u)
    expect(ask?.description).not.toMatch(/team_opinion_close/u)
  })

  it('hands the host the RUN (never the arguments), a forged identity stripped, and a new call id each time', async () => {
    const seen: HarnessCall[] = []
    const [ask] = harnessMcpTools(RUN, { tools: ['ask_team_opinion'], call: async (input) => { seen.push(input); return '{"ok":true}' } }, 'write')
    await ask?.handler({ question: 'E então?', draft: { text: 'x' }, personaId: 'outra', assignmentId: 'a-forjada', projectId: 'p-forjado' })
    await ask?.handler({ question: 'E então?', draft: { text: 'x' } })
    expect(seen.map(call => call.tool)).toEqual(['ask_team_opinion', 'ask_team_opinion'])
    expect(seen[0]?.run).toEqual(RUN)
    expect(Object.keys(seen[0]?.args ?? {}).sort()).toEqual(['draft', 'question'])
    expect(new Set(seen.map(call => call.callId)).size).toBe(2)
  })

  it('says "unavailable" when no host port is behind it (never a silent no-op)', async () => {
    const [ask] = harnessMcpTools(RUN, { tools: ['ask_team_opinion'] }, 'write')
    expect((await ask?.handler({ question: 'q', draft: { text: 'x' } }))?.content).toBe('ask_team_opinion unavailable')
  })
})
