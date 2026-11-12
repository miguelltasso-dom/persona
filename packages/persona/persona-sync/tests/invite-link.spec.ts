/**
 * H23 / F4: the invite link parser is the door a link from outside opens (Keel's rules): exactly `persona://entrar/<time>/<token>`, fixed length and alphabet, nothing free-form,
 * and everything else refused — malformed, long, with control characters, escapes, look-alikes.
 */
import { describe, expect, it } from 'vitest'
import { INVITE_LINK_MAX, inviteLinkOf, parseInviteLink } from '../src/invite-link.ts'

const TEAM = 'padaria-lua'
const TOKEN = 'a'.repeat(48) // what the host issues: 24 random bytes as hex
const GOOD = `persona://entrar/${TEAM}/${TOKEN}`

describe('the link that is accepted', () => {
  it('is exactly persona://entrar/<time>/<token>', () => {
    expect(parseInviteLink(GOOD)).toEqual({ teamId: TEAM, token: TOKEN })
    expect(parseInviteLink(`persona://entrar/a/${'B-_9'.repeat(8)}`)).toEqual({ teamId: 'a', token: 'B-_9'.repeat(8) }) // one-letter team, base64url token
    expect(parseInviteLink(`persona://entrar/${'a'.repeat(64)}/${'T'.repeat(64)}`)).toBeDefined() // the longest legal pieces
    expect(inviteLinkOf({ teamId: TEAM, token: TOKEN })).toBe(GOOD) // what the host builds is what the parser reads
  })
})

describe('everything else is refused (never cleaned and retried)', () => {
  const refused: Array<[string, unknown]> = [
    ['not a string', 42],
    ['nothing', undefined],
    ['empty', ''],
    ['another scheme', `https://entrar/${TEAM}/${TOKEN}`],
    ['the task link of the app', 'persona://task/t-1'],
    ['upper-case scheme', `PERSONA://entrar/${TEAM}/${TOKEN}`],
    ['upper-case host', `persona://ENTRAR/${TEAM}/${TOKEN}`],
    ['another host', `persona://entrarx/${TEAM}/${TOKEN}`],
    ['one segment', `persona://entrar/${TOKEN}`],
    ['three segments', `persona://entrar/${TEAM}/${TOKEN}/extra`],
    ['trailing slash', `${GOOD}/`],
    ['empty team', `persona://entrar//${TOKEN}`],
    ['empty token', `persona://entrar/${TEAM}/`],
    ['query', `${GOOD}?x=1`],
    ['fragment', `${GOOD}#x`],
    ['port', `persona://entrar:80/${TEAM}/${TOKEN}`],
    ['user info', `persona://u:p@entrar/${TEAM}/${TOKEN}`],
    ['a dot-segment', `persona://entrar/../${TOKEN}`],
    ['an encoded dot-segment', `persona://entrar/%2e%2e/${TOKEN}`],
    ['a percent escape in the token', `persona://entrar/${TEAM}/${'a'.repeat(40)}%41%41`],
    ['a space', `persona://entrar/${TEAM}/${'a'.repeat(23)} ${'a'.repeat(20)}`],
    ['a newline', `${GOOD}\n`],
    ['a leading space', ` ${GOOD}`],
    ['a NUL', `persona://entrar/${TEAM}/${'a'.repeat(30)}\u0000`],
    ['a tab in the team', `persona://entrar/pad\taria/${TOKEN}`],
    ['an escape character', `persona://entrar/${TEAM}/\u001b[31m${'a'.repeat(30)}`],
    ['a backslash', `persona://entrar/${TEAM}\\x/${TOKEN}`],
    ['a short token (21)', `persona://entrar/${TEAM}/${'a'.repeat(21)}`],
    ['a long token (65)', `persona://entrar/${TEAM}/${'a'.repeat(65)}`],
    ['a long team (65)', `persona://entrar/${'a'.repeat(65)}/${TOKEN}`],
    ['a team that starts with a dash', `persona://entrar/-padaria/${TOKEN}`],
    ['a team with an upper-case letter', `persona://entrar/Padaria/${TOKEN}`],
    ['a team with a dot', `persona://entrar/padaria.lua/${TOKEN}`],
    ['a look-alike letter in the token (Cyrillic a)', `persona://entrar/${TEAM}/${'a'.repeat(30)}а`],
    ['a full-width slash', `persona://entrar${'／'}${TEAM}/${TOKEN}`],
    ['a zero-width space', `persona://entrar/${TEAM}/${'a'.repeat(30)}​`],
    ['over the length limit', `persona://entrar/${TEAM}/${'a'.repeat(INVITE_LINK_MAX)}`],
    ['a megabyte', `persona://entrar/${TEAM}/${'a'.repeat(1_000_000)}`],
  ]
  for (const [name, link] of refused) {
    it(`${name}`, () => {
      expect(parseInviteLink(link)).toBeUndefined()
    })
  }

  it('a link the host would build from bad pieces throws instead of producing something the parser refuses', () => {
    expect(() => inviteLinkOf({ teamId: 'Padaria Lua', token: TOKEN })).toThrow('INVITE_LINK_INVALID')
    expect(() => inviteLinkOf({ teamId: TEAM, token: 'curto' })).toThrow('INVITE_LINK_INVALID')
  })
})
