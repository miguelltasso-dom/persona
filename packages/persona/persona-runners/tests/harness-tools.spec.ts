import { describe, expect, it } from 'vitest'
import { allowsTool } from '../src/resolve/tool-level.ts'
import {
  createMcpGateway,
  harnessMcpTools,
  HARNESS_TOOLS,
  openTurnTools,
  type HarnessCall,
  type HarnessMcpPorts,
  type PersonaToolHooks,
} from '../src/index.ts'

const run = { personaId: 'nina', ticketId: 't1', assignmentId: 'a1' }
const hooks: PersonaToolHooks = { report: () => {}, recall: () => '', ask: () => {} }

function wired(tools: HarnessMcpPorts['tools'], seen: HarnessCall[] = []): HarnessMcpPorts {
  return { ...(tools === undefined ? {} : { tools }), call: (input) => { seen.push(input); return Promise.resolve('{"ok":true}') } }
}

describe('harness MCP tools (board, sprints, routines)', () => {
  it('announces only what the host wired, and nothing without ports', () => {
    expect(harnessMcpTools(run, {}, 'write')).toEqual([])
    expect(harnessMcpTools(run, { call: () => Promise.resolve('x') }, 'write')).toEqual([]) // a dispatch with no list announces nothing
    const names = harnessMcpTools(run, wired(['board_list', 'board_card_move']), 'write').map(tool => tool.name)
    expect(names).toEqual(['board_list', 'board_card_move'])
    expect(harnessMcpTools(run, wired([...HARNESS_TOOLS]), 'write').map(tool => tool.name)).toEqual([...HARNESS_TOOLS])
  })

  it('the reads are `read`, everything that changes the product is `write`', () => {
    // The COORDINATION tools (D-097) are `read`: the verdict of a review, asking a colleague, passing work on and the team's opinion do not touch the person's files or the
    // world (the host holds their ACL: the persona's own switch, the caps, the circle, the person's mandate); a persona that may only read can use them.
    const reads = ['board_list', 'sprint_list', 'routine_list', 'review_verdict', 'ask_colleague', 'pass_forward', 'ask_team_opinion']
    for (const name of reads) expect(allowsTool('read', name), name).toBe(true)
    for (const name of HARNESS_TOOLS.filter(item => !reads.includes(item))) expect(allowsTool('read', name), name).toBe(false)
    const read = harnessMcpTools(run, wired([...HARNESS_TOOLS]), 'read').map(tool => tool.name)
    expect(read).toEqual(['board_list', 'sprint_list', 'routine_list', 'ask_team_opinion', 'ask_colleague', 'pass_forward', 'review_verdict'])
    expect(harnessMcpTools(run, wired([...HARNESS_TOOLS]), 'none')).toEqual([])
  })

  it('the team tools are coordination: a `read` persona has them all, a persona with no grant at all has none here (the host opens the lease at `read` for her); the schemas name the bilhete and the verdict', () => {
    const write = harnessMcpTools(run, wired(['ask_colleague', 'pass_forward', 'review_verdict']), 'write')
    expect(write.map(tool => tool.name)).toEqual(['ask_colleague', 'pass_forward', 'review_verdict'])
    expect(harnessMcpTools(run, wired(['ask_colleague', 'pass_forward', 'review_verdict']), 'read').map(tool => tool.name)).toEqual(['ask_colleague', 'pass_forward', 'review_verdict'])
    expect(harnessMcpTools(run, wired(['ask_colleague', 'pass_forward', 'review_verdict']), 'none')).toEqual([])
    const [ask, pass, verdict] = write
    for (const tool of [ask, pass]) {
      expect(tool?.inputSchema).toMatchObject({ required: ['colleague', 'title'], properties: { colleague: {}, title: {}, done: {}, needed: {}, files: {}, decisions: {} } })
    }
    expect(verdict?.inputSchema).toMatchObject({ required: ['verdict'], properties: { verdict: { enum: ['approve', 'changes'] }, points: {} } })
  })

  it('the run\'s own ids in the team tools\' arguments never reach the host (the asker is the run, never an argument)', async () => {
    const seen: HarnessCall[] = []
    const ask = harnessMcpTools(run, wired(['ask_colleague'], seen), 'write')[0]!
    await ask.handler({ colleague: 'Teo', title: 'Arte', personaId: 'intruso', projectId: 'outro', assignmentId: 'x' })
    expect(seen[0]).toMatchObject({ tool: 'ask_colleague', run })
    expect(Object.keys(seen[0]!.args).sort()).toEqual(['colleague', 'title'])
  })

  it('the run owns the identity: forged persona/project/assignment arguments never reach the host; the card id still does', async () => {
    const seen: HarnessCall[] = []
    const tools = Object.fromEntries(harnessMcpTools(run, wired(['board_card_move'], seen), 'write').map(tool => [tool.name, tool]))
    await tools.board_card_move?.handler({ ticketId: 'card-9', columnId: 'doing', personaId: 'intruso', projectId: 'outro', assignmentId: 'x', workspaceId: 'w' })
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ tool: 'board_card_move', run, args: { ticketId: 'card-9', columnId: 'doing' } })
    expect(Object.keys(seen[0]!.args).sort()).toEqual(['columnId', 'ticketId'])
  })

  it('each call carries a NEW id, and a second lease of the SAME assignment never reuses an id (a deliberate repeat acts; only a retry matches)', async () => {
    const seen: HarnessCall[] = []
    const first = harnessMcpTools(run, wired(['board_list'], seen), 'write')[0]!
    await first.handler({})
    await first.handler({})
    const second = harnessMcpTools(run, wired(['board_list'], seen), 'write')[0]!
    await second.handler({})
    const ids = seen.map(call => call.callId)
    expect(new Set(ids).size).toBe(3)
    expect(ids.every(id => id.startsWith('a1:'))).toBe(true)
    expect(ids[0]!.endsWith(':1') && ids[1]!.endsWith(':2') && ids[2]!.endsWith(':1')).toBe(true) // the counter restarts, the lease nonce does not
  })

  it('through the gateway and the turn bridge: the model sees only the wired, permitted tools and a call reaches the host with the lease identity', async () => {
    const seen: HarnessCall[] = []
    const gw = createMcpGateway({ hooks, harness: wired(['board_list', 'sprint_create'], seen), onlyWired: true })
    const read = gw.openTurn({ run, toolLevel: 'read', worktree: 'C:/tmp' })
    expect(gw.list(read.token).filter(name => (HARNESS_TOOLS as readonly string[]).includes(name))).toEqual(['board_list'])
    const set = openTurnTools(gw, { run: { ...run, assignmentId: 'a2' }, toolLevel: 'write', worktree: 'C:/tmp' })
    const names = set?.tools.map(tool => tool.name) ?? []
    expect(names).toContain('board_list')
    expect(names).toContain('sprint_create')
    const create = set?.tools.find(tool => tool.name === 'sprint_create')
    const answer = await create?.handler({ name: 'Sprint 1', objective: 'Meta' })
    expect(answer).toEqual({ content: '{"ok":true}' })
    expect(seen.at(-1)).toMatchObject({ tool: 'sprint_create', run: { ...run, assignmentId: 'a2' }, args: { name: 'Sprint 1', objective: 'Meta' } })
    set?.close?.()
  })

  it('every tool has a schema the model can use: required fields are declared and extra fields refused', () => {
    for (const tool of harnessMcpTools(run, wired([...HARNESS_TOOLS]), 'write')) {
      expect(tool.description.length, tool.name).toBeGreaterThan(20)
      expect(tool.inputSchema.type, tool.name).toBe('object')
      expect(tool.inputSchema.additionalProperties, tool.name).toBe(false)
    }
    const move = harnessMcpTools(run, wired(['board_card_move']), 'write')[0]!
    expect(move.inputSchema.required).toEqual(['ticketId', 'columnId'])
  })
})
