/**
 * H23 / F4: the invitation link is a door a link from outside opens (Keel's rules): EXACTLY `persona://entrar/<time>/<token>`, fixed length and alphabet, nothing free-form,
 * and a second launch (Windows) hands it over without ever joining anyone. The desktop has no dependency on persona-sync, so
 * its parser is a copy of the strict one there; this spec holds the two identical on a corpus and on generated strings.
 */
import { describe, expect, it, vi } from 'vitest'
import { parseInviteLink } from '../../../packages/persona/persona-sync/src/invite-link.ts'
import { parsePersonaInviteLink } from '../src/deep-link.ts'
import { claimDesktopSingleInstance, type DesktopSingleInstanceApplication } from '../src/single-instance.ts'

const TEAM = 'padaria-lua'
const TOKEN = 'a'.repeat(48)
const GOOD = `persona://entrar/${TEAM}/${TOKEN}`

describe('persona://entrar/<time>/<token> on the desktop', () => {
  it('accepts exactly that shape', () => {
    expect(parsePersonaInviteLink(GOOD)).toEqual({ kind: 'invite', teamId: TEAM, token: TOKEN })
  })

  it('refuses malformed, long, escaped and control-character links, and every other persona:// link', () => {
    const refused: unknown[] = [
      undefined, 42, '', 'persona://task/t-1', 'persona://open', `https://entrar/${TEAM}/${TOKEN}`, `PERSONA://entrar/${TEAM}/${TOKEN}`, `persona://ENTRAR/${TEAM}/${TOKEN}`,
      `persona://entrar/${TOKEN}`, `${GOOD}/extra`, `${GOOD}/`, `persona://entrar//${TOKEN}`, `persona://entrar/${TEAM}/`, `${GOOD}?x=1`, `${GOOD}#x`,
      `persona://entrar:80/${TEAM}/${TOKEN}`, `persona://u:p@entrar/${TEAM}/${TOKEN}`, `persona://entrar/../${TOKEN}`, `persona://entrar/%2e%2e/${TOKEN}`,
      `persona://entrar/${TEAM}/${'a'.repeat(40)}%41%41`, `${GOOD}\n`, ` ${GOOD}`, `persona://entrar/${TEAM}/${'a'.repeat(30)}\u0000`, `persona://entrar/${TEAM}/\u001b[31m${'a'.repeat(30)}`,
      `persona://entrar/${TEAM}/${'a'.repeat(21)}`, `persona://entrar/${TEAM}/${'a'.repeat(65)}`, `persona://entrar/${'a'.repeat(65)}/${TOKEN}`, `persona://entrar/-x/${TOKEN}`,
      `persona://entrar/${TEAM}/${'a'.repeat(30)}\u0430`, `persona://entrar/${TEAM}/${'a'.repeat(30)}\u200b`, `persona://entrar/${TEAM}/${'a'.repeat(1_000_000)}`,
    ]
    for (const link of refused) expect(parsePersonaInviteLink(link), String(link).slice(0, 60)).toBeUndefined()
  })

  it('reads every link exactly as the strict parser of persona-sync does (corpus + 4000 generated strings)', () => {
    const same = (link: unknown): void => {
      const desktop = parsePersonaInviteLink(link)
      const sync = parseInviteLink(link)
      expect(desktop === undefined ? undefined : { teamId: desktop.teamId, token: desktop.token }, String(link).slice(0, 80)).toEqual(sync)
    }
    for (const link of [GOOD, `persona://entrar/a/${'B-_9'.repeat(8)}`, `persona://entrar/${'a'.repeat(64)}/${'T'.repeat(64)}`, `${GOOD}/`, `${GOOD}?x`, `persona://entrar/${TEAM}`]) same(link)
    // A deterministic generator (no Math.random: same strings on every run): near-misses of the real pieces.
    const pieces = ['persona://', 'entrar', '/', 'padaria-lua', '-', 'A', 'z', '9', '_', '%2e', '..', '.', '?', '#', ':', '@', ' ', '\n', '\t', '\u0000', '\u0430', '\u200b', '\uff0f', 'a'.repeat(22), 'a'.repeat(64), TOKEN]
    let seed = 20261112
    const next = (): number => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed }
    for (let round = 0; round < 4000; round += 1) {
      let link = round % 3 === 0 ? 'persona://entrar/' : round % 3 === 1 ? `persona://entrar/${TEAM}/` : ''
      for (let part = next() % 6; part > 0; part -= 1) link += pieces[next() % pieces.length]
      same(link)
    }
  })
})

describe('a second launch (Windows protocol click) hands its link to the running app', () => {
  const application = (listeners: Array<(event: unknown, argv: readonly string[]) => void>): DesktopSingleInstanceApplication => ({
    requestSingleInstanceLock: () => true,
    quit: vi.fn(),
    on: vi.fn((_event: 'second-instance', listener: (event: unknown, argv: readonly string[]) => void) => { listeners.push(listener) }),
  })

  it('focuses the window and gives the persona:// argument to the router, which decides (nothing joins here)', () => {
    const listeners: Array<(event: unknown, argv: readonly string[]) => void> = []
    const focus = vi.fn()
    const onLink = vi.fn()
    expect(claimDesktopSingleInstance(application(listeners), focus, onLink)).toBe(true)
    listeners[0]?.({}, ['C:\\Persona\\Persona.exe', '--flag', GOOD])
    expect(focus).toHaveBeenCalledOnce()
    expect(onLink).toHaveBeenCalledWith(GOOD)
  })

  it('a second launch without a persona:// argument only focuses', () => {
    const listeners: Array<(event: unknown, argv: readonly string[]) => void> = []
    const focus = vi.fn()
    const onLink = vi.fn()
    claimDesktopSingleInstance(application(listeners), focus, onLink)
    listeners[0]?.({}, ['C:\\Persona\\Persona.exe', 'https://example.com/x'])
    listeners[0]?.({}, [])
    expect(focus).toHaveBeenCalledTimes(2)
    expect(onLink).not.toHaveBeenCalled()
  })
})
