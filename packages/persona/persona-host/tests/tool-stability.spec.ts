import { describe, expect, it } from 'vitest'
import { STABLE_DOMAIN_TOOLS, StableTools } from '../src/tool-stability.ts'

/** Item 9a: the list a persona is offered changes at most ONCE (lean → with the product domains), never back and never per turn. */
describe('StableTools (ferramentas estáveis no pool quente)', () => {
  const LEAN = ['ask_colleague', 'pass_forward', 'ask_team_opinion', 'persona_ask']

  it('a request that needs no domain tool is offered exactly what it needs', () => {
    const stable = new StableTools()
    expect(stable.offer('pp:bia', LEAN)).toEqual(LEAN)
    expect(stable.isWidened('pp:bia')).toBe(false)
  })

  it('the first board/sprint/routine request widens the list to the whole domain group, and it never shrinks again', () => {
    const stable = new StableTools()
    const lean = stable.offer('pp:bia', LEAN)
    const first = stable.offer('pp:bia', [...LEAN, 'board_list'])
    const later = stable.offer('pp:bia', LEAN) // a plain post again
    expect(new Set(first)).toEqual(new Set([...LEAN, ...STABLE_DOMAIN_TOOLS]))
    expect(new Set(later)).toEqual(new Set(first))
    expect(new Set(lean)).not.toEqual(new Set(first))
  })

  it('signature churn over a mixed week: the lean list flips on and off per turn today, but changes at most once with the memory', () => {
    const week: string[][] = [
      LEAN, [...LEAN, 'board_list', 'board_card_move'], LEAN, [...LEAN, 'routine_list', 'routine_create'],
      LEAN, [...LEAN, 'sprint_list'], LEAN, [...LEAN, 'board_list'], LEAN,
    ]
    const signature = (names: readonly string[]): string => [...names].sort().join(',')
    const before = week.map(signature).filter((sig, at, all) => at === 0 || sig !== all[at - 1]).length
    const stable = new StableTools()
    const after = week.map(turn => signature(stable.offer('pp:bia', turn))).filter((sig, at, all) => at === 0 || sig !== all[at - 1]).length
    expect(before).toBe(9) // every turn is a different list than the one before it
    expect(after).toBe(2) // lean, then with the domains: ONE rebuild for the persona's life
  })

  it('COLHEITA 15b: browser_login stays announced once it was offered, so the browser opening and closing never flips the list', () => {
    const stable = new StableTools()
    const without = stable.offer('pp:bia', LEAN)
    expect(without).not.toContain('browser_login')
    const withBrowser = stable.offer('pp:bia', [...LEAN, 'browser_login'])
    expect(withBrowser).toContain('browser_login')
    const laterWithout = stable.offer('pp:bia', LEAN)
    expect(laterWithout).toContain('browser_login')
    expect(new Set(laterWithout)).toEqual(new Set(withBrowser))
  })

  it('is idempotent: offering the same turn twice (the record of the turn and the opener) gives the same list', () => {
    const stable = new StableTools()
    const turn = [...LEAN, 'sprint_plan']
    expect(stable.offer('pp:bia', turn)).toEqual(stable.offer('pp:bia', turn))
  })

  it('is per persona and per project: one persona\'s board request never widens another\'s list', () => {
    const stable = new StableTools()
    stable.offer('pp:bia', [...LEAN, 'board_list'])
    expect(stable.offer('pp:teo', LEAN)).toEqual(LEAN)
    expect(stable.offer('qq:bia', LEAN)).toEqual(LEAN)
  })

  it('a reviewer\'s Task has one job: it neither widens nor receives the domain group, even for a persona already widened', () => {
    const stable = new StableTools()
    stable.offer('pp:guia', [...LEAN, 'board_list'])
    expect(stable.offer('pp:guia', ['review_verdict', 'persona_ask'])).toEqual(['review_verdict', 'persona_ask'])
    const fresh = new StableTools()
    expect(fresh.offer('pp:guia', ['review_verdict', 'board_list'])).toEqual(['review_verdict', 'board_list'])
    expect(fresh.isWidened('pp:guia')).toBe(false)
  })

  it('hiring is never part of the group: it stays by the words of each request', () => {
    expect(STABLE_DOMAIN_TOOLS).not.toContain('persona_hire')
    const stable = new StableTools()
    stable.offer('pp:bia', [...LEAN, 'board_list'])
    expect(stable.offer('pp:bia', LEAN)).not.toContain('persona_hire')
  })

  it('clear() forgets the widening', () => {
    const stable = new StableTools()
    stable.offer('pp:bia', [...LEAN, 'board_list'])
    stable.clear()
    expect(stable.offer('pp:bia', LEAN)).toEqual(LEAN)
  })
})
