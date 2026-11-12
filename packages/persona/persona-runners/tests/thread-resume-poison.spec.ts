/**
 * P0-07, second half (Carbon, colheita-s1): `withThreadResume` remembers the CLI's own session id per thread and hands it back as `--resume`. When opening that session FAILED with anything but
 * "session not found" (a corrupted session, another cwd in OpenCode), the remembered id was never forgotten: every later turn of the thread tried the same dead id and failed the same way until
 * the app restarted. A failed resume must forget the id, so the turn after it starts fresh. No real CLI.
 */
import { scriptedRuntime } from '@botiverse/oar/testing'
import { describe, expect, it } from 'vitest'
import { createClaudeRunner, createOarSessionRunner, withThreadResume } from '../src/index.ts'

/** A runtime that records the `resume` option of every session it is asked to open, and cannot reopen a session once told to refuse it. */
function runtimeThatRefusesResume() {
  const inner = scriptedRuntime({ id: 'fake-cli', turn: (turn) => { turn.say('ok') } })
  const asked: (string | undefined)[] = []
  const refuse = { on: false }
  const runtime = {
    ...inner,
    session: async (installation: Parameters<typeof inner.session>[0], options: Parameters<typeof inner.session>[1]) => {
      asked.push(options.resume)
      if (options.resume !== undefined && refuse.on) throw new Error('sessão corrompida: não dá para reabrir')
      return inner.session(installation, options)
    },
  }
  return { runtime, asked, refuse }
}

describe('a failed --resume is forgotten', () => {
  it('the turn after a resume that failed (not "session not found") starts FRESH, and does not try the dead id again', async () => {
    const { runtime, asked, refuse } = runtimeThatRefusesResume()
    const turn = withThreadResume(createClaudeRunner({ runtime }), { shared: true })
    const session = createOarSessionRunner({ turn, personaId: 'nina', model: 'scripted-1', permissionMode: 'deny', purpose: 'talk' })
    await session.ensureSession('talk-1', '.', 'Nina', 'coordinator')
    await session.deliver('talk-1', 'req-1', 'oi', 'queue')
    await turn.dispose?.() // the process is gone; the thread remembers the native id
    refuse.on = true // …and that id can no longer be reopened
    await session.ensureSession('talk-2', '.', 'Nina', 'coordinator')
    await session.deliver('talk-2', 'req-2', 'e agora?', 'queue').catch(() => undefined) // the turn fails: the error is the turn's, not the test's
    refuse.on = false
    await session.ensureSession('talk-3', '.', 'Nina', 'coordinator')
    await session.deliver('talk-3', 'req-3', 'e depois?', 'queue')
    // first turn: fresh · second: tried to resume the remembered id (and failed) · third: fresh again (RED today: it tried the dead id a second time)
    expect(asked[0]).toBeUndefined()
    expect(asked[1]).toBeDefined()
    expect(asked[2]).toBeUndefined()
  })

  it('a resume that works is still kept: the next turn reattaches to the same native session (the memory is not wiped by a success)', async () => {
    const { runtime, asked } = runtimeThatRefusesResume()
    const turn = withThreadResume(createClaudeRunner({ runtime }), { shared: true })
    const session = createOarSessionRunner({ turn, personaId: 'nina', model: 'scripted-1', permissionMode: 'deny', purpose: 'talk' })
    await session.ensureSession('talk-1', '.', 'Nina', 'coordinator')
    await session.deliver('talk-1', 'req-1', 'oi', 'queue')
    await turn.dispose?.()
    await session.ensureSession('talk-2', '.', 'Nina', 'coordinator')
    await session.deliver('talk-2', 'req-2', 'e agora?', 'queue')
    expect(asked[0]).toBeUndefined()
    expect(asked[1]).toBeDefined()
  })
})
