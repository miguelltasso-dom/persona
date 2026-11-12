import { expect, vi } from 'vitest'
import type { ConnectionSnapshot } from '@deepseek-ai/dsh-persona-runners'
import type PersonaHost from '../src/index.ts'
import { peopleWithoutAi, type TeamPerson } from '../src/team-connect.ts'
import { teamConnectPorts } from '../src/team-connect-host.ts'
import { bindHostFile, it } from './host-harness.ts'

/**
 * Carbon P1-09 (Tally): "Ligar a IA para a equipe toda" with NAMED accounts. Written RED first:
 *  1. the chosen account is BOUND to each persona woken (`active_account`), including the one who was already on that engine (she used to be skipped, and kept pointing at the default home);
 *  2. the stored seats do not hide the other engines the probe found logged in (one saved Claude seat used to hide a signed-in Codex);
 *  3. a persona bound to a seat is "sem IA" by what HER seat says (a seat with its own home that is logged in is fine though the default-home probe says logged out).
 */
const { host } = bindHostFile()
const SCOPE = { workspaceId: 'ws', projectId: 'pp' }

const claudeOut: ConnectionSnapshot = { id: 'claude', kind: 'cli', installed: true, loggedIn: false, models: [] }
const codexIn: ConnectionSnapshot = { id: 'codex', kind: 'cli', installed: true, loggedIn: true, models: [] }

function team(h: PersonaHost, runners: ReadonlyArray<readonly [string, string, 'claude' | 'codex']>): void {
  h.createWorkspace({ id: 'ws', name: 'Padaria', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...SCOPE, displayName: 'Ana', handle: 'ana', role: 'owner' })
  for (const [id, name, cli] of runners) {
    h.createPersona({
      ...SCOPE, id, name, title: 'Cargo', description: 'x', personality: 'Clara.', instructions: 'Ajude.', avatarKind: 'gallery', avatarRef: name.toLowerCase(),
      runnerKind: 'cli', runnerCli: cli, runnerModel: 'default', canRecruit: false, createdBy: 'ana',
    })
  }
}

const bound = (h: PersonaHost, personaId: string): unknown => h.screens.screens.get('pp', 'active_account', personaId)

it('the account the person chose is BOUND to every persona woken, also the one already on that engine', async () => {
  const h = host()
  team(h, [['bia', 'Bia', 'codex'], ['teo', 'Teo', 'claude']])
  h.accounts.create({ id: 'codex:pessoal', workspaceId: 'ws', provider: 'codex', label: 'Pessoal' })
  h.accounts.create({ id: 'codex:trabalho', workspaceId: 'ws', provider: 'codex', label: 'Trabalho' })
  vi.spyOn(h.connections, 'detect').mockResolvedValue([claudeOut, codexIn])
  await h.connections.ready()
  expect(h.getTeamAi(SCOPE).without.map(row => row.personaId)).toEqual(['teo']) // Bia is on Codex, which answers
  const started = h.connectTeam({ ...SCOPE, accountId: 'codex:trabalho' })
  expect(started.ok).toBe(true)
  await h.teamConnect.settled('pp')
  expect(h.getTeamConnect(SCOPE)).toMatchObject({ state: 'done', accountId: 'codex:trabalho' })
  expect(bound(h, 'teo'), 'the persona that was moved').toEqual({ accountId: 'codex:trabalho' })
})

it('a persona already on the chosen engine is bound to the chosen seat too (she was skipped, and kept the default home)', async () => {
  const h = host()
  team(h, [['bia', 'Bia', 'claude'], ['teo', 'Teo', 'claude']])
  h.accounts.create({ id: 'claude:trabalho', workspaceId: 'ws', provider: 'claude', label: 'Trabalho' })
  vi.spyOn(h.connections, 'detect').mockResolvedValue([claudeOut])
  await h.connections.ready()
  // The seat is logged in by its own home; the persona never changes engine (she is on Claude already).
  const ports = teamConnectPorts({
    product: h.product, accounts: h.accounts, usage: h.usage, screens: h.screens.screens, orchestration: h.orchestration,
    connections: () => h.connections.list(), recheck: () => h.connections.retry(), loginStatus: () => 'logged_in',
  })
  expect(ports.bindAccount, 'the host side has a way to bind a seat').toBeTypeOf('function')
  ports.bindAccount?.('pp', 'bia', 'claude:trabalho')
  expect(bound(h, 'bia')).toEqual({ accountId: 'claude:trabalho' })
  ports.bindAccount?.('pp', 'bia', 'nao-existe')
  expect(bound(h, 'bia'), 'an id that is no seat binds nothing').toEqual({ accountId: 'claude:trabalho' })
})

it('one saved seat does not hide the other engines the probe found signed in', async () => {
  const h = host()
  team(h, [['bia', 'Bia', 'claude']])
  h.accounts.create({ id: 'claude:pessoal', workspaceId: 'ws', provider: 'claude', label: 'Pessoal' })
  vi.spyOn(h.connections, 'detect').mockResolvedValue([claudeOut, codexIn])
  await h.connections.ready()
  const choices = h.getTeamAi(SCOPE).choices
  expect(choices.map(choice => choice.provider).sort(), 'Codex is signed in: it must be offered').toEqual(['codex'])
  const ports = teamConnectPorts({
    product: h.product, accounts: h.accounts, usage: h.usage, screens: h.screens.screens, orchestration: h.orchestration,
    connections: () => [{ id: 'claude', kind: 'claude', phase: 'ready', available: true, loggedIn: true }, { id: 'codex', kind: 'codex', phase: 'ready', available: true, loggedIn: true }] as never,
    recheck: async () => [], loginStatus: () => 'logged_out',
  })
  expect(ports.accounts('pp').map(account => account.id).sort(), 'the saved seat AND the signed-in Codex').toEqual(['claude:pessoal', 'codex'])
})

it('a persona bound to a seat is "sem IA" by what her seat says, not by the default-home probe', () => {
  const claudeCard = { id: 'claude', kind: 'claude', phase: 'ready', available: true, loggedIn: false } as never
  const person = (accountFact?: 'ok' | 'without' | 'unsure'): TeamPerson => ({
    id: 'bia', name: 'Bia', title: 'Cargo', runner: { kind: 'cli', cli: 'claude', model: 'default' }, ...(accountFact === undefined ? {} : { accountFact }),
  })
  expect(peopleWithoutAi([person()], [claudeCard]).without.map(row => row.personaId), 'no seat: the probe says logged out').toEqual(['bia'])
  expect(peopleWithoutAi([person('ok')], [claudeCard]).without, 'her own seat is logged in').toEqual([])
  expect(peopleWithoutAi([person('without')], [{ ...(claudeCard as object), loggedIn: true } as never]).without.map(row => row.personaId), 'her seat is logged out').toEqual(['bia'])
  expect(peopleWithoutAi([person('unsure')], [claudeCard])).toMatchObject({ without: [], unsure: 1 })
})

it('the host reads the seat of each persona (active_account) and answers her fact from that seat', async () => {
  const h = host()
  team(h, [['bia', 'Bia', 'claude'], ['teo', 'Teo', 'claude']])
  h.accounts.create({ id: 'claude:trabalho', workspaceId: 'ws', provider: 'claude', label: 'Trabalho', homeDir: 'C:/contas/trabalho' })
  h.screens.screens.put('pp', 'active_account', 'bia', { accountId: 'claude:trabalho' })
  const ports = (status: 'logged_in' | 'logged_out') => teamConnectPorts({
    product: h.product, accounts: h.accounts, usage: h.usage, screens: h.screens.screens, orchestration: h.orchestration,
    connections: () => [{ id: 'claude', kind: 'claude', phase: 'ready', available: true, loggedIn: false }] as never, recheck: async () => [], loginStatus: () => status,
  })
  const fact = (status: 'logged_in' | 'logged_out', id: string): unknown => ports(status).team('pp').find(row => row.id === id)?.accountFact
  expect(fact('logged_in', 'bia')).toBe('ok')
  expect(fact('logged_out', 'bia')).toBe('without')
  expect(fact('logged_in', 'teo'), 'no seat bound: no fact of her own').toBeUndefined()
})
