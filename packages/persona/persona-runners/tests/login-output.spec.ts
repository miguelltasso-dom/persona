import { describe, expect, it } from 'vitest'
import {
  LOGIN_REQUIRED_PHRASES,
  RunnerResolveError,
  classifyLoginOutput,
  createClaudeRunner,
  createCodexRunner,
  createCursorRunner,
  createOpencodeRunner,
  loginHintFor,
  mayBecomeLogin,
  type CliKind,
  type RunEvent,
} from '../src/index.ts'
import { scriptedRuntime } from '@botiverse/oar/testing'

const PHRASES: Readonly<Record<CliKind, string>> = {
  claude: 'Not logged in · Please run /login',
  codex: 'Not logged in. Please run /login',
  opencode: 'login required — please sign in',
  cursor: 'Please sign in to Cursor',
}

const input = {
  ticketId: 't',
  assignmentId: 'a',
  personaId: 'nina',
  cwd: 'C:/tmp',
  prompt: 'hi',
  model: 'haiku',
  permissionMode: 'deny' as const,
}

const factory: Record<CliKind, (text: string) => ReturnType<typeof createClaudeRunner>> = {
  claude: text => createClaudeRunner({ runtime: scriptedRuntime({ turn: (turn) => { turn.say(text) } }) }),
  codex: text => createCodexRunner({ runtime: scriptedRuntime({ turn: (turn) => { turn.say(text) } }) }),
  opencode: text => createOpencodeRunner({ runtime: scriptedRuntime({ turn: (turn) => { turn.say(text) } }) }),
  cursor: text => createCursorRunner({ runtime: scriptedRuntime({ turn: (turn) => { turn.say(text) } }) }),
}

describe('classifyLoginOutput', () => {
  it('lists phrases per CLI and matches Keel wording', () => {
    for (const cli of ['claude', 'codex', 'opencode', 'cursor'] as const) {
      expect(LOGIN_REQUIRED_PHRASES[cli].length).toBeGreaterThan(3)
      expect(classifyLoginOutput(cli, PHRASES[cli])).toEqual({
        cli, code: 'not_logged_in', loginHint: loginHintFor(cli),
      })
      expect(classifyLoginOutput(cli, 'não logado')).toMatchObject({ code: 'not_logged_in' })
      expect(classifyLoginOutput(cli, 'login required')).toMatchObject({ code: 'not_logged_in' })
    }
    expect(classifyLoginOutput('claude', 'Please run /login')).toBeDefined()
    expect(classifyLoginOutput('claude', 'The files are listed.')).toBeUndefined()
    expect(classifyLoginOutput('codex', 'hello world')).toBeUndefined()
  })

  it('holds only a login-phrase prefix so ordinary first tokens flush', () => {
    expect(mayBecomeLogin('claude', 'n')).toBe(true)
    expect(mayBecomeLogin('claude', 'not log')).toBe(true)
    expect(mayBecomeLogin('claude', 'Hi')).toBe(false)
    expect(mayBecomeLogin('claude', 'OK')).toBe(false)
  })
})

describe('OAR adapter login wall', () => {
  it.each(['claude', 'codex', 'opencode', 'cursor'] as const)(
    'throws typed not_logged_in for %s and never emits the raw text as a delta',
    async (cli) => {
      const runner = factory[cli](PHRASES[cli])
      const handle = await runner.start(input)
      const events: RunEvent[] = []
      try {
        for await (const event of runner.stream(handle)) events.push(event)
        throw new Error('expected RunnerResolveError')
      } catch (error) {
        expect(error).toBeInstanceOf(RunnerResolveError)
        expect(error).toMatchObject({ code: 'not_logged_in', loginHint: loginHintFor(cli) })
        expect((error as RunnerResolveError).message).not.toMatch(/Please run \/login/u)
      }
      expect(events.some(event => event.type === 'delta')).toBe(false)
    },
  )
})
