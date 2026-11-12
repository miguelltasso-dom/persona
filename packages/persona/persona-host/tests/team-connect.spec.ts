import { describe, expect, it } from 'vitest'
import {
  NEAR_LIMIT_PERCENT, TeamConnect, engineFact, peopleWithoutAi, rankAccounts, wakeVerdict,
  type AccountInput, type TeamConnectPorts, type TeamConnectView, type TeamPerson, type WakeResult,
} from '../src/team-connect.ts'
import type { ConnectionView } from '../src/types.ts'

/**
 * Item 13 (Tally, 11/11), "Ligar a IA para a equipe toda": one sign-in wakes every persona that is CONFIRMED without AI, one at a time, on the account the person chose
 * (accounts ordered by the room in their window). A persona that does not connect never stops the others; a doubt about an engine is never "sem IA". No CLI, no model.
 */
const card = (over: Partial<ConnectionView> = {}): ConnectionView => ({ id: 'claude', kind: 'claude', available: true, loggedIn: true, loginHint: '', phase: 'ready', ...over })
const OUT = card({ loggedIn: false }) // confirmed: installed, not logged in
const person = (id: string, over: Partial<TeamPerson> = {}): TeamPerson => ({ id, name: id.toUpperCase(), title: 'Cargo', runner: { kind: 'cli', cli: 'claude', model: 'default' }, ...over })
const seat = (id: string, used: number | undefined, over: Partial<AccountInput> = {}): AccountInput => ({
  id, provider: 'claude', label: id, loggedIn: true, windows: used === undefined ? [] : [{ usedPercent: used }], ...over,
})

describe('who is without AI (a CONFIRMED lack, never a doubt)', () => {
  it('a card that answered "not logged in" or "not installed" is without; one still checking or that could not be checked is only unsure', () => {
    expect(engineFact(OUT)).toBe('without')
    expect(engineFact(card({ available: false, loggedIn: false }))).toBe('without')
    expect(engineFact(card())).toBe('ok')
    expect(engineFact(card({ phase: 'checking', loggedIn: false }))).toBe('unsure')
    expect(engineFact(card({ phase: 'checking', loggedIn: false, unconfirmed: true }))).toBe('unsure')
    expect(engineFact(undefined)).toBe('unsure')
  })

  it('counts the banner from the team: only the confirmed ones, and says how many are only being checked', () => {
    const team = [person('ana'), person('bia'), person('teo', { runner: { kind: 'cli', cli: 'codex', model: 'default' } })]
    const result = peopleWithoutAi(team, [OUT, card({ id: 'codex', kind: 'codex', phase: 'checking', loggedIn: false, unconfirmed: true })])
    expect(result.without.map(row => row.personaId)).toEqual(['ana', 'bia'])
    expect(result.unsure).toBe(1) // Teo's engine could not be checked: he is NOT accused
    expect(peopleWithoutAi(team, [card(), card({ id: 'codex', kind: 'codex' })]).without).toEqual([])
  })
})

describe('the accounts, ordered by the room in their window', () => {
  it('more room first, unknown last, never assuming an unpublished window is free; a logout or an engine that cannot run a persona is not offered', () => {
    const ranked = rankAccounts([
      seat('cheia', 90), seat('folgada', 20), seat('desconhecida', undefined), seat('meio', 60),
      seat('deslogada', 5, { loggedIn: false }), seat('nativa', 1, { provider: 'dsh' }),
    ])
    expect(ranked.map(row => row.id)).toEqual(['folgada', 'meio', 'cheia', 'desconhecida'])
    expect(ranked.map(row => row.room)).toEqual(['sobra', 'sobra', 'quase_no_limite', 'desconhecida'])
    expect(NEAR_LIMIT_PERCENT).toBe(85)
  })

  it('the tightest window decides, and ties are broken by name (a stable order)', () => {
    const ranked = rankAccounts([
      { id: 'a', provider: 'codex', label: 'Zeta', loggedIn: true, windows: [{ usedPercent: 10 }, { usedPercent: 40 }] },
      { id: 'b', provider: 'claude', label: 'Alfa', loggedIn: true, windows: [{ usedPercent: 40 }] },
    ])
    expect(ranked.map(row => [row.id, row.usedPercent])).toEqual([['b', 40], ['a', 40]])
  })
})

describe('waking one persona is a verdict, never a false logout', () => {
  it('answers = ok; confirmed logout = sem_login; a check that could not tell = nao_conferido', () => {
    expect(wakeVerdict(card())).toEqual({ ok: true })
    expect(wakeVerdict(OUT)).toEqual({ ok: false, reason: 'sem_login' })
    expect(wakeVerdict(card({ phase: 'checking', loggedIn: false, unconfirmed: true }))).toEqual({ ok: false, reason: 'nao_conferido' })
    expect(wakeVerdict(card({ available: false, loggedIn: false }))).toEqual({ ok: false, reason: 'falhou' })
    expect(wakeVerdict(undefined)).toEqual({ ok: false, reason: 'nao_conferido' })
  })
})

interface Rig {
  readonly connect: TeamConnect
  readonly log: string[]
  readonly saved: TeamConnectView[]
  readonly team: TeamPerson[]
  cards: ConnectionView[]
}

function rig(options: {
  team?: TeamPerson[]
  cards?: ConnectionView[]
  afterSignIn?: ConnectionView[]
  accounts?: AccountInput[]
  wake?: (personaId: string, log: string[]) => Promise<WakeResult>
  applyThrows?: string
} = {}): Rig {
  const team = options.team ?? [person('ana'), person('bia'), person('teo')]
  const log: string[] = []
  const saved: TeamConnectView[] = []
  let stored: TeamConnectView | undefined
  const state: Rig = { connect: undefined as never, log, saved, team, cards: options.cards ?? [OUT] }
  const ports: TeamConnectPorts = {
    team: () => team,
    cards: () => state.cards,
    recheck: async () => { log.push('recheck'); if (options.afterSignIn !== undefined) state.cards = options.afterSignIn; return state.cards },
    accounts: () => options.accounts ?? [seat('conta', 30)],
    applyEngine: (_project, personaId, cli) => {
      if (options.applyThrows === personaId) throw new Error('disk')
      log.push(`apply:${personaId}:${cli}`)
      const at = team.findIndex(item => item.id === personaId)
      team[at] = { ...team[at]!, runner: { kind: 'cli', cli, model: 'default' } }
    },
    wake: async (_project, personaId) => {
      log.push(`wake:${personaId}`)
      return options.wake === undefined ? wakeVerdict(state.cards.find(item => item.id === 'claude')) : options.wake(personaId, log)
    },
    load: () => stored,
    save: (_project, view) => { stored = view; saved.push(view) },
  }
  return Object.assign(state, { connect: new TeamConnect(ports) })
}

describe('TeamConnect: one sign-in wakes the whole team, in sequence', () => {
  it('after the sign-in every confirmed persona connects, ONE AT A TIME and in the team\'s order, then "done"', async () => {
    const r = rig({ afterSignIn: [card()] })
    const started = r.connect.start('pp')
    expect(started.ok).toBe(true)
    if (started.ok) expect(started.view.rows.map(row => row.status)).toEqual(['esperando', 'esperando', 'esperando'])
    await r.connect.settled('pp')
    expect(r.log).toEqual(['recheck', 'wake:ana', 'wake:bia', 'wake:teo']) // already on Claude: nobody's runner is rewritten
    const final = r.connect.progress('pp')
    expect(final).toMatchObject({ state: 'done', provider: 'claude', accountId: 'conta' })
    expect(final.rows.map(row => row.status)).toEqual(['conectada', 'conectada', 'conectada'])
    // the progress is REAL: a row is "conectando" while it is the one being woken, and only one at a time
    for (const view of r.saved) expect(view.rows.filter(row => row.status === 'conectando').length).toBeLessThanOrEqual(1)
    expect(r.saved.some(view => view.rows[1]?.status === 'conectando' && view.rows[0]?.status === 'conectada' && view.rows[2]?.status === 'esperando')).toBe(true)
  })

  it('a persona on ANOTHER engine is put on the chosen one; one already on it keeps her model and effort', async () => {
    const team = [
      person('ana', { runner: { kind: 'cli', cli: 'claude', model: 'opus', effort: 'high' } }),
      person('bia', { runner: { kind: 'dsh', model: 'm' } }),
    ]
    const r = rig({ team, cards: [OUT, card({ id: 'dsh', kind: 'dsh', loggedIn: false })], afterSignIn: [card(), card({ id: 'dsh', kind: 'dsh', loggedIn: false })] })
    r.connect.start('pp')
    await r.connect.settled('pp')
    expect(r.log).toEqual(['recheck', 'wake:ana', 'apply:bia:claude', 'wake:bia'])
    expect(r.team[0]?.runner).toEqual({ kind: 'cli', cli: 'claude', model: 'opus', effort: 'high' })
    expect(r.connect.progress('pp').state).toBe('done')
  })

  it('a persona that does not connect NEVER stops the others; the end is "partial" and she can try again alone', async () => {
    let bia = 0
    const r = rig({ afterSignIn: [card()], wake: async id => (id === 'bia' && (bia += 1) === 1 ? { ok: false, reason: 'falhou' } : { ok: true }) })
    r.connect.start('pp')
    await r.connect.settled('pp')
    let view = r.connect.progress('pp')
    expect(view.state).toBe('partial')
    expect(view.rows.map(row => [row.personaId, row.status, row.reason])).toEqual([['ana', 'conectada', undefined], ['bia', 'nao_conectou', 'falhou'], ['teo', 'conectada', undefined]])
    view = await r.connect.retry('pp', 'bia')
    expect(view.state).toBe('done')
    expect(view.rows.map(row => row.status)).toEqual(['conectada', 'conectada', 'conectada'])
    expect(await r.connect.retry('pp', 'ana')).toEqual(view) // a persona that is connected has nothing to retry
  })

  it('a step that throws is a row that did not connect, not a crash of the run', async () => {
    const dshOut = card({ id: 'dsh', kind: 'dsh', loggedIn: false })
    const r = rig({ cards: [OUT, dshOut], afterSignIn: [card(), dshOut], team: [person('ana', { runner: { kind: 'dsh', model: 'm' } }), person('bia')], applyThrows: 'ana' })
    r.connect.start('pp')
    await r.connect.settled('pp')
    expect(r.connect.progress('pp').rows.map(row => [row.personaId, row.status, row.reason])).toEqual([['ana', 'nao_conectou', 'falhou'], ['bia', 'conectada', undefined]])
  })

  it('HONEST: if the sign-in is still not seen the rows say "sem login"; if the check could not tell they say "não consegui conferir", never the other way round', async () => {
    const still = rig({ afterSignIn: [OUT] })
    still.connect.start('pp')
    await still.connect.settled('pp')
    expect(still.connect.progress('pp').rows.every(row => row.status === 'nao_conectou' && row.reason === 'sem_login')).toBe(true)
    const unsure = rig({ afterSignIn: [card({ phase: 'checking', loggedIn: false, unconfirmed: true })] })
    unsure.connect.start('pp')
    await unsure.connect.settled('pp')
    expect(unsure.connect.progress('pp').rows.every(row => row.reason === 'nao_conferido')).toBe(true)
  })

  it('refuses honestly: nobody confirmed without AI, no account to use, or an account that is not offered', () => {
    expect(rig({ cards: [card()] }).connect.start('pp')).toEqual({ ok: false, code: 'no_one' })
    // the probe could not tell: nobody is accused, so there is nobody to wake
    expect(rig({ cards: [card({ phase: 'checking', loggedIn: false, unconfirmed: true })] }).connect.start('pp')).toEqual({ ok: false, code: 'no_one' })
    expect(rig({ accounts: [] }).connect.start('pp')).toEqual({ ok: false, code: 'no_account' })
    expect(rig({ accounts: [seat('x', 10, { loggedIn: false })] }).connect.start('pp')).toEqual({ ok: false, code: 'no_account' })
    expect(rig().connect.start('pp', 'outra')).toEqual({ ok: false, code: 'unknown_account' })
  })

  it('the account the person picks is the one used; asking again while it runs does not start a second run', async () => {
    const r = rig({ afterSignIn: [card()], accounts: [seat('cheia', 90), seat('folgada', 10)] })
    expect(r.connect.overview('pp').choices.map(choice => choice.id)).toEqual(['folgada', 'cheia']) // the first is the default
    const a = r.connect.start('pp', 'cheia')
    const b = r.connect.start('pp', 'folgada')
    expect(a.ok && b.ok && a.view.accountId === 'cheia' && b.view.accountId === 'cheia').toBe(true)
    await r.connect.settled('pp')
    expect(r.log.filter(line => line === 'recheck')).toHaveLength(1)
  })

  it('one persona at a time even when waking is slow: the next one never starts before the previous one ends', async () => {
    const releases: Array<() => void> = []
    const r = rig({
      afterSignIn: [card()],
      wake: (id, log) => new Promise<WakeResult>((resolve) => { releases.push(() => { log.push(`done:${id}`); resolve({ ok: true }) }) }),
    })
    r.connect.start('pp')
    const tick = async (): Promise<void> => { for (let at = 0; at < 20; at += 1) await Promise.resolve() }
    await tick()
    expect(r.log).toEqual(['recheck', 'wake:ana'])
    releases.shift()?.()
    await tick()
    expect(r.log).toEqual(['recheck', 'wake:ana', 'done:ana', 'wake:bia'])
    releases.shift()?.(); await tick(); releases.shift()?.()
    await r.connect.settled('pp')
    expect(r.connect.progress('pp').state).toBe('done')
  })
})
