/**
 * TEAM-10 attempt 4 (09/11, P0-2/P0-3). The OAR adapter streams a CUMULATIVE `partial` of every piece of text of the turn: with tools in the middle it grew into the
 * persona's whole monologue ("Vou começar conferindo… contém.Nenhum arquivo…") and the host took it for her answer. The text restarts after each tool, so the last
 * `partial` is the text after the last tool and nothing else. The tools the persona holds also tell her the host draws an SVG as a PNG by itself (she never asks anyone
 * for a PNG, never speaks of shell): the real round had Téo saying "Não tenho ferramenta de shell" and asking Lia to export one.
 */
import { describe, expect, it } from 'vitest'
import { createClaudeRunner, type RunEvent, type StartTurnInput } from '../src/index.ts'
import { HARNESS_TOOLS, harnessMcpTools } from '../src/mcp/harness-tools.ts'

const input: StartTurnInput = {
  ticketId: 'ticket-final', assignmentId: 'assignment-final', personaId: 'teo', cwd: 'C:/tmp/final', prompt: 'oi', model: 'scripted-1', permissionMode: 'deny',
}

async function collect(events: AsyncIterable<RunEvent>): Promise<RunEvent[]> {
  const out: RunEvent[] = []
  for await (const event of events) out.push(event)
  return out
}

type Frame = { kind: string; text?: string; tool?: string; name?: string; callId?: string }

function scriptedRuntime(frames: readonly Frame[]) {
  return {
    id: 'fake-claude',
    session: async () => {
      const listeners: Array<(event: Frame) => void> = []
      return {
        id: 'sess-final',
        events: (listener: (event: Frame) => void) => { listeners.push(listener); return () => undefined },
        prompt: async () => {
          for (const frame of frames) for (const listener of listeners) listener(frame)
          return { kind: 'ok' }
        },
        abort: async () => undefined,
        dispose: async () => undefined,
        usage: () => ({ value: { total: { input: 1, output: 1 } } }),
        status: () => ({ value: { kind: 'idle' as const } }),
      }
    },
  }
}

describe('the adapter restarts the streamed text after every tool', () => {
  it('the last cumulative partial is the text after the last tool, never the monologue before it', async () => {
    const runner = createClaudeRunner({
      runtime: scriptedRuntime([
        { kind: 'text_delta', text: 'Vou começar conferindo se o `foto.png` existe no projeto e o que ele contém.' },
        { kind: 'tool_call_started', tool: 'Read', callId: 'c1' },
        { kind: 'text_delta', text: 'Nenhum arquivo de imagem no diretório de trabalho. Vou verificar.' },
        { kind: 'tool_call_started', tool: 'Write', callId: 'c2' },
        { kind: 'text_delta', text: 'O rascunho está pronto.' },
        { kind: 'text_delta', text: ' Falta só a foto.' },
      ]) as never,
    })
    const handle = await runner.start(input)
    const events = await collect(runner.stream(handle))
    const partials = events.filter((event): event is Extract<RunEvent, { type: 'partial' }> => event.type === 'partial').map(event => event.text)
    expect(partials.at(-1)).toBe('O rascunho está pronto. Falta só a foto.')
    // After the first tool no cumulative text still carries the text from before it.
    const afterTool = partials.slice(partials.findIndex(text => text.includes('Nenhum')))
    for (const text of afterTool) expect(text).not.toContain('Vou começar')
    expect(partials.some(text => text.includes('contém.Nenhum'))).toBe(false)
  })

  it('a turn with no tool streams one growing text, as before', async () => {
    const runner = createClaudeRunner({ runtime: scriptedRuntime([{ kind: 'text_delta', text: 'Olá' }, { kind: 'text_delta', text: ', tudo bem?' }]) as never })
    const handle = await runner.start(input)
    const events = await collect(runner.stream(handle))
    const partials = events.filter(event => event.type === 'partial').map(event => (event as { text: string }).text)
    expect(partials.at(-1)).toBe('Olá, tudo bem?')
  })
})

describe('the tools say the host draws an SVG as a PNG by itself (P0-3)', () => {
  const tools = harnessMcpTools({ personaId: 'teo', ticketId: 't', assignmentId: 'a' }, { tools: [...HARNESS_TOOLS], call: () => Promise.resolve('{}') }, 'write')
  const byName = new Map(tools.map(tool => [tool.name, tool.description]))

  for (const name of ['pass_forward', 'ask_colleague', 'ask_team_opinion']) {
    it(`${name}: SVG goes as it is, the host makes the PNG, nobody is asked for one`, () => {
      const text = byName.get(name) ?? ''
      expect(text).toMatch(/SVG/u)
      expect(text).toMatch(/PNG/u)
      expect(text).toMatch(/by itself|automatically/iu)
      expect(text).toMatch(/never ask[^.]*PNG/iu)
      expect(text.length).toBeLessThan(700) // a definition costs tokens on every call of every persona
    })
  }
})
