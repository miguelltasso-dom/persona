/**
 * Carbon P1-04 (colheita snapshot 1): `browser_login` and `ask_vault_code` never reached a persona the app creates. Her tools are `{ files: 'write' }` and a Task without a draft folder has no file grant at
 * all (`grantless`): only the COORDINATION tools were offered, and neither of these two is one. RED first.
 *
 * Both only coordinate: `ask_vault_code` opens a card the owner fills, and `browser_login` types a Cofre login into the browser of a profile the owner lent the persona (it exists only while the turn
 * HAS that browser, the Cofre has a login, and the host's own gates pass). Neither touches the persona's files or the world beyond that, so the file grant has no say.
 */
import { describe, expect, it } from 'vitest'
import { neededToolNames, offeredToolNames, type ProductToolsRules } from '../src/harness-turn.ts'

const TURN = { personaId: 'bia', ticketId: 't1' }

function rules(over: Partial<ProductToolsRules> & { text?: string } = {}): ProductToolsRules {
  const { text = 'Entre no portal do contador e baixe a nota', ...rest } = over
  return { taskTextOf: () => text, ...rest }
}

describe('a persona with a browser and a login in the Cofre is offered the two tools that use them', () => {
  it('with no file or shell grant (the usual Task: no draft folder) she still gets browser_login and ask_vault_code', () => {
    const names = offeredToolNames(rules({ browserLoginOf: () => true }), 'none', TURN)
    expect(names).toContain('browser_login')
    expect(names).toContain('ask_vault_code')
  })

  it('with a file grant too, and the words of the request do not matter: a login page may ask for a code nobody mentioned', () => {
    const names = offeredToolNames(rules({ browserLoginOf: () => true, text: 'Baixe a nota fiscal de outubro' }), 'write', TURN)
    expect(names).toContain('browser_login')
    expect(names).toContain('ask_vault_code')
  })

  it('without the browser (no profile, or the Cofre has no login) neither is offered unless the words ask for a code', () => {
    expect(offeredToolNames(rules({ browserLoginOf: () => false }), 'none', TURN)).not.toContain('browser_login')
    expect(offeredToolNames(rules({ browserLoginOf: () => false }), 'none', TURN)).not.toContain('ask_vault_code')
    expect(offeredToolNames(rules(), 'none', TURN)).not.toContain('browser_login')
    // a request that talks about a second factor still gets the card tool (the owner may type the code in herself)
    expect(offeredToolNames(rules({ text: 'O banco vai mandar um código por SMS' }), 'none', TURN)).toContain('ask_vault_code')
  })

  it('what the host decided is what the turn needs: both names are in the needed list when the browser is there', () => {
    const needed = neededToolNames(rules({ browserLoginOf: () => true }), TURN)
    expect(needed).toContain('browser_login')
    expect(needed).toContain('ask_vault_code')
    expect(new Set(needed).size).toBe(needed.length) // never twice (a code request in the words AND the browser)
    const both = neededToolNames(rules({ browserLoginOf: () => true, text: 'Entre com 2FA' }), TURN)
    expect(both.filter(name => name === 'ask_vault_code')).toHaveLength(1)
  })

  it('board, sprint, routine and hiring tools still follow the file grant: a persona with none gets no board tool even with the browser', () => {
    const names = offeredToolNames(rules({ browserLoginOf: () => true, text: 'Mova o cartão para Fazendo' }), 'none', TURN)
    expect(names).not.toContain('board_card_move')
    expect(names).toContain('browser_login')
  })
})
