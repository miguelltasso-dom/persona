import { expect, it } from 'vitest'
import { validatePlacement } from '../src/computer-placement.ts'

/**
 * D-117: the host binds Zinc's `validatePersonaComputerConfig` (the ONE matrix) to the shape of `PersonaScopeBook`/`PersonaHomeBook`. The adapter adds nothing to the rule: it only maps the fields and fails CLOSED
 * when the computer's kind is unknown (nobody told the host what that computer is).
 */
const persona = (audience: 'private' | 'team', computerUse: boolean) => ({ id: 'p1', audience, creatorId: 'ana', computerUse, homeComputerId: 'pc-1' })
const home = (kind: 'personal' | 'team' | undefined, ownerId = 'ana', teamComputerUse = false) => ({ computerId: 'pc-1', kind, ownerId, teamComputerUse })

it('a private persona lives only on her creator\'s own personal PC (computer use on or off)', () => {
  expect(validatePlacement({ persona: persona('private', false), home: home('personal') })).toEqual({ ok: true })
  expect(validatePlacement({ persona: persona('private', true), home: home('personal') })).toEqual({ ok: true })
  expect(validatePlacement({ persona: persona('private', false), home: home('team') })).toEqual({ ok: false, reason: 'private-persona-on-team-pc' })
  expect(validatePlacement({ persona: persona('private', false), home: home('personal', 'bob') })).toEqual({ ok: false, reason: 'not-owner' })
})

it('a team persona with computer use ON never lives on a personal PC; with it off she may live anywhere', () => {
  expect(validatePlacement({ persona: persona('team', true), home: home('personal') })).toEqual({ ok: false, reason: 'team-persona-on-personal-pc' })
  expect(validatePlacement({ persona: persona('team', true), home: home('team', 'ana', true) })).toEqual({ ok: true })
  expect(validatePlacement({ persona: persona('team', false), home: home('personal') })).toEqual({ ok: true })
})

it('an unknown kind of computer fails CLOSED (the host was not told what that computer is)', () => {
  expect(validatePlacement({ persona: persona('team', false), home: home(undefined) })).toEqual({ ok: false, reason: 'invalid' })
  expect(validatePlacement({ persona: persona('private', false), home: home(undefined) })).toEqual({ ok: false, reason: 'invalid' })
})
