/**
 * Item 13 (Tally, 11/11), the host's side of "Ligar a IA para a equipe toda": the ports `TeamConnect` (`team-connect.ts`) needs, built from what the host already has: the product's
 * personas, the engine probe, the accounts with their official quota, the state store. Nothing here calls a model.
 *
 *  - ACCOUNTS: the stored seats (their own home when they have one) or, with none stored, one row per engine the probe found; each carries the windows the vendor published for IT, so the
 *    modal can order them by room. A seat on the default home is logged in when the probe says so; a seat with its own home when that home says so.
 *  - WAKE: for a seat with its own home the verdict is that home's login (the default-home probe says nothing about it); otherwise the probe's fresh card. Never a logout from a doubt.
 *  - APPLY: a persona put on the chosen engine gets that engine's default model (`default`: nothing is sent to the CLI), her warm session is dropped and the change is audited like
 *    `setPersonaEngine`. A persona already on that engine is never touched (she keeps her model and her effort).
 */

import type { AccountRepos, ProductRepos, ScreenRepos, SqliteUsageStore } from '@deepseek-ai/dsh-persona-store'
import { ENGINE_DEFAULT_MODEL } from './engine-menu.ts'
import type { Orchestration } from './orchestration.ts'
import { engineFact, wakeVerdict, type AccountInput, type TeamConnectPorts, type TeamConnectView } from './team-connect.ts'
import type { ConnectionView } from './types.ts'

const DOC = 'team_connect'
const ACTIVE = 'active_account'

export interface TeamConnectHostDeps {
  readonly product: ProductRepos
  readonly accounts: AccountRepos
  readonly usage: SqliteUsageStore
  readonly screens: ScreenRepos
  readonly orchestration: Orchestration
  /** The probe's cached cards. */
  readonly connections: () => readonly ConnectionView[]
  /** One forced check ("Tentar de novo": forgets the old timeouts). */
  readonly recheck: () => Promise<readonly ConnectionView[]>
  /** The login state of an isolated account home (`logged_in` …). */
  readonly loginStatus: (homeDir: string) => string
  /** The persona audit line (`setPersonaEngine` writes one). */
  readonly audit?: (projectId: string, personaId: string, action: string) => void
  /** D-116 (regra 2): whether the persona's HOME is this computer. Absent = every persona is home here (a single computer). */
  readonly homeHere?: (personaId: string) => boolean
}

/**
 * @param deps - The host's repos and probe.
 * @returns The ports of the team connection for this host.
 */
export function teamConnectPorts(deps: TeamConnectHostDeps): TeamConnectPorts {
  const windowsOf = (projectId: string, provider: string, accountId: string | undefined): AccountInput['windows'] =>
    deps.usage.listQuota(projectId, provider)
      .filter(quota => (accountId === undefined ? quota.accountId === undefined : quota.accountId === accountId))
      .flatMap(quota => quota.windows.map(window => ({
        ...(window.usedPercent === undefined ? {} : { usedPercent: window.usedPercent }),
        ...(window.resetsAt === undefined ? {} : { resetsAt: window.resetsAt }),
      })))

  const accountsOf = (projectId: string): AccountInput[] => {
    const workspaceId = deps.product.getProject(projectId)?.workspaceId
    if (workspaceId === undefined) return []
    const cards = deps.connections()
    const stored = deps.accounts.list(workspaceId)
    const fromSeats = stored.map((row): AccountInput => {
      const probe = cards.find(card => card.kind === row.provider)
      const loggedIn = row.homeDir === '' ? probe !== undefined && engineFact(probe) === 'ok' : deps.loginStatus(row.homeDir) === 'logged_in'
      return { id: row.id, provider: row.provider, label: row.label, loggedIn, windows: windowsOf(projectId, row.provider, row.homeDir === '' ? undefined : row.id) }
    })
    // Carbon P1-09: the seats the person saved AND the engines the probe found signed in that have no seat of their own (one saved Claude seat used to hide a signed-in Codex).
    const covered = new Set(stored.map(row => row.provider))
    const fromCards = cards.filter(card => card.kind !== 'dsh' && !covered.has(card.kind)).map((card): AccountInput => ({
      id: card.id, provider: card.kind, label: card.kind, loggedIn: engineFact(card) === 'ok', windows: windowsOf(projectId, card.kind, undefined),
    }))
    return [...fromSeats, ...fromCards]
  }

  return {
    team: (projectId) => {
      const workspaceId = deps.product.getProject(projectId)?.workspaceId
      const seats = workspaceId === undefined ? [] : deps.accounts.list(workspaceId)
      return deps.product.listPersonas(projectId).filter(row => deps.homeHere?.(row.id) !== false).map((row) => {
        const seatId = deps.screens.get<{ accountId: string }>(projectId, ACTIVE, row.id)?.accountId
        const seat = seatId === undefined ? undefined : seats.find(item => item.id === seatId)
        // Carbon P1-09: only a seat with its OWN home speaks for her (the default home is what the probe already says): that home is logged in or out, a fact and never a doubt.
        const accountFact = seat === undefined || seat.homeDir === '' ? undefined : deps.loginStatus(seat.homeDir) === 'logged_in' ? 'ok' as const : 'without' as const
        return { id: row.id, name: row.name, title: row.title, runner: row.runner, ...(accountFact === undefined ? {} : { accountFact }) }
      })
    },
    cards: deps.connections,
    recheck: deps.recheck,
    accounts: accountsOf,
    applyEngine: (projectId, personaId, cli) => {
      const persona = deps.product.getPersona(personaId)
      if (persona === undefined) throw new Error('persona-not-found')
      if (deps.homeHere?.(personaId) === false) throw new Error('home-elsewhere') // D-116: a sessao dela esta em outro computador
      deps.product.updatePersona({ ...persona, runner: { kind: 'cli', cli, model: ENGINE_DEFAULT_MODEL }, updatedAt: deps.orchestration.now() }, projectId)
      // Carbon P1-08: a seat of the engine she LEFT is not her active account on the new one (it would be read for a persona that no longer runs on it).
      const kept = deps.screens.get<{ accountId: string }>(projectId, ACTIVE, personaId)?.accountId
      if (kept !== undefined && deps.accounts.get(kept)?.provider !== cli) deps.screens.delete(projectId, ACTIVE, personaId)
      deps.orchestration.evictWarmRunners(projectId, personaId)
      deps.audit?.(projectId, personaId, 'engine')
    },
    bindAccount: (projectId, personaId, accountId) => {
      const workspaceId = deps.product.getProject(projectId)?.workspaceId
      const persona = deps.product.getPersona(personaId)
      const seat = workspaceId === undefined ? undefined : deps.accounts.list(workspaceId).find(row => row.id === accountId)
      if (seat === undefined || persona === undefined || persona.runner.kind !== 'cli' || persona.runner.cli !== seat.provider || deps.homeHere?.(personaId) === false) return
      if (deps.screens.get<{ accountId: string }>(projectId, ACTIVE, personaId)?.accountId === seat.id) return // the same seat again: nothing changed, her session stays
      deps.screens.put(projectId, ACTIVE, personaId, { accountId: seat.id })
      deps.orchestration.evictWarmRunners(projectId, personaId) // Carbon P1-08: her warm session still holds the account she had (the engine did not change, so applyEngine did not drop it)
    },
    wake: async (projectId, _personaId, cli, accountId) => {
      const workspaceId = deps.product.getProject(projectId)?.workspaceId
      const seat = accountId === undefined || workspaceId === undefined ? undefined : deps.accounts.list(workspaceId).find(row => row.id === accountId)
      if (seat !== undefined && seat.homeDir !== '') {
        return deps.loginStatus(seat.homeDir) === 'logged_in' ? { ok: true } : { ok: false, reason: 'sem_login' }
      }
      return wakeVerdict(deps.connections().find(card => card.id === cli))
    },
    load: projectId => deps.screens.get<TeamConnectView>(projectId, DOC, 'v1'),
    save: (projectId, view) => { deps.screens.put(projectId, DOC, 'v1', view) },
  }
}
