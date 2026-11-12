/**
 * Item 13, "Ligar a IA para a equipe toda" (Tally, 11/11): the person signs in ONCE and every persona that has no AI is woken, one at a time, in the order the team lists them, on the
 * account she chose (the accounts are offered ordered by how much room each window has). The progress is REAL (each row changes when that persona really connects), and a persona
 * that does not connect never stops the others: her row says "Não conectou" and she can try again alone.
 *
 * What counts as "sem IA" is a CONFIRMED lack, never a doubt: the persona's engine answered "not installed" or "not logged in". An engine that is still being checked, or that the
 * probe could not check (`unconfirmed`, `check-unconfirmed.ts`) is "conferindo", not "sem IA": the banner never accuses a logout nobody confirmed (COLHEITA-MUSE §13.4).
 * A persona already on the chosen engine keeps her model and her effort (she only needs her engine to answer); another one gets the engine's default.
 *
 * Domain only: the host gives the ports (the personas, the probe cards, the accounts with their quota, applying a runner, the state store). No model call is made here: waking a
 * persona is applying her engine and checking that it answers (`wakeVerdict`); a later step may also warm her session through the same port.
 */

import type { PersonaRunner } from '@deepseek-ai/dsh-persona-core'
import type { ConnectionView, ProjectScopeRequest } from './types.ts'

/** A window this full or fuller reads "quase no limite". */
export const NEAR_LIMIT_PERCENT = 85

const CLIS: ReadonlySet<string> = new Set(['claude', 'codex', 'cursor', 'opencode'])
export type CliName = 'claude' | 'codex' | 'cursor' | 'opencode'

/** The engine a runner uses, as the probe names it (`dsh` = the built-in engine). */
export function engineOf(runner: PersonaRunner): string {
  return runner.kind === 'cli' ? runner.cli : 'dsh'
}

export interface TeamPerson {
  readonly id: string
  readonly name: string
  readonly title: string
  readonly runner: PersonaRunner
}

export interface WithoutAiPerson {
  readonly personaId: string
  readonly name: string
  readonly title: string
}

/** What the probe confirmed about one engine: `without` = it said "not installed"/"not logged in"; `unsure` = still checking or could not tell; `ok` = answers. */
export type EngineFact = 'ok' | 'without' | 'unsure'

/** @param card - The engine's probe card, if any. @returns What is CONFIRMED about it (no card = unsure: nothing was said). */
export function engineFact(card: ConnectionView | undefined): EngineFact {
  if (card === undefined) return 'unsure'
  if (card.phase === 'ready' && card.available && card.loggedIn && card.error === undefined) return 'ok'
  if (card.phase !== 'ready' || card.unconfirmed === true) return 'unsure'
  return 'without'
}

export interface TeamAiCounts {
  /** Confirmed without an engine: the banner and the list of the modal. */
  readonly without: readonly WithoutAiPerson[]
  /** Still being checked or not checked: never counted as "sem IA". */
  readonly unsure: number
}

/**
 * Who is without AI, for the banner "3 pessoas da equipe estão sem IA".
 * @param team - The project's personas.
 * @param cards - The probe's cached cards.
 */
export function peopleWithoutAi(team: readonly TeamPerson[], cards: readonly ConnectionView[]): TeamAiCounts {
  const without: WithoutAiPerson[] = []
  let unsure = 0
  for (const person of team) {
    const fact = engineFact(cards.find(card => card.id === engineOf(person.runner)))
    if (fact === 'without') without.push({ personaId: person.id, name: person.name, title: person.title })
    else if (fact === 'unsure') unsure += 1
  }
  return { without, unsure }
}

export interface AccountInput {
  readonly id: string
  readonly provider: string
  readonly label: string
  readonly loggedIn: boolean
  /** The official quota windows of this account (empty = the vendor said nothing). */
  readonly windows: readonly { readonly usedPercent?: number; readonly resetsAt?: string }[]
}

/** How much room the tightest window has: `sobra` ("sobra bastante"), `quase_no_limite`, or `desconhecida` (the vendor published nothing: never assumed free). */
export type Room = 'sobra' | 'quase_no_limite' | 'desconhecida'

export interface AccountChoice {
  readonly id: string
  readonly provider: CliName
  readonly label: string
  readonly room: Room
  /** The fullest window, when the vendor published one. */
  readonly usedPercent?: number
}

/**
 * The accounts the person may use to wake the team: logged in, on an engine that can run a persona, ordered by room (the fullest window decides; more room first; unknown last).
 * The first one is the default of the modal.
 * @param accounts - The seats with their quota.
 */
export function rankAccounts(accounts: readonly AccountInput[]): AccountChoice[] {
  const rows = accounts.filter(account => account.loggedIn && CLIS.has(account.provider)).map((account): AccountChoice => {
    const used = account.windows.map(window => window.usedPercent).filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    const fullest = used.length === 0 ? undefined : Math.max(...used)
    const room: Room = fullest === undefined ? 'desconhecida' : fullest >= NEAR_LIMIT_PERCENT ? 'quase_no_limite' : 'sobra'
    return { id: account.id, provider: account.provider as CliName, label: account.label, room, ...(fullest === undefined ? {} : { usedPercent: fullest }) }
  })
  return rows.sort((a, b) => {
    if ((a.usedPercent === undefined) !== (b.usedPercent === undefined)) return a.usedPercent === undefined ? 1 : -1
    if (a.usedPercent !== undefined && b.usedPercent !== undefined && a.usedPercent !== b.usedPercent) return a.usedPercent - b.usedPercent
    return a.label.localeCompare(b.label, 'pt-BR') || a.id.localeCompare(b.id)
  })
}

export type WakeFailure = 'sem_login' | 'nao_conferido' | 'falhou'
export type WakeResult = { readonly ok: true } | { readonly ok: false; readonly reason: WakeFailure }

/**
 * The verdict of waking one persona on an engine, from its probe card: it answers, it is confirmed logged out, or the probe could not tell (never reported as a logout).
 * @param card - The engine's card after the forced check.
 */
export function wakeVerdict(card: ConnectionView | undefined): WakeResult {
  const fact = engineFact(card)
  if (fact === 'ok') return { ok: true }
  if (fact === 'unsure') return { ok: false, reason: 'nao_conferido' }
  return { ok: false, reason: card?.available === true ? 'sem_login' : 'falhou' }
}

export type RowStatus = 'esperando' | 'conectando' | 'conectada' | 'nao_conectou'

export interface TeamConnectRow {
  readonly personaId: string
  readonly name: string
  readonly status: RowStatus
  /** Only when `nao_conectou`. */
  readonly reason?: WakeFailure
}

export interface TeamConnectView {
  /** `idle` = nothing running or run yet; `done` = every row connected; `partial` = it ended and some did not connect (they can try again alone). */
  readonly state: 'idle' | 'running' | 'done' | 'partial'
  readonly accountId?: string
  readonly provider?: CliName
  readonly rows: readonly TeamConnectRow[]
}

export interface TeamConnectPorts {
  /** The project's personas, in the order the team lists them. */
  readonly team: (projectId: string) => readonly TeamPerson[]
  /** The probe's cached cards. */
  readonly cards: () => readonly ConnectionView[]
  /** One forced check of the engines (the person has just signed in). */
  readonly recheck: () => Promise<readonly ConnectionView[]>
  /** The accounts with their quota. */
  readonly accounts: (projectId: string) => readonly AccountInput[]
  /** Put a persona on this engine (saves her runner, drops her warm session). Called only when she is not on it already. */
  readonly applyEngine: (projectId: string, personaId: string, cli: CliName) => void
  /** Wake one persona on her engine and the account the person chose; the default is {@link wakeVerdict} of her engine's fresh card. */
  readonly wake?: (projectId: string, personaId: string, cli: CliName, accountId: string | undefined) => Promise<WakeResult>
  readonly load: (projectId: string) => TeamConnectView | undefined
  readonly save: (projectId: string, view: TeamConnectView) => void
}

/** The banner and the modal of "Ligar para todas": who is without AI, how many are only being checked, the accounts to choose from (the first is the default). */
export interface TeamAiView extends TeamAiCounts {
  readonly choices: readonly AccountChoice[]
}

export interface ConnectTeamRequest extends ProjectScopeRequest {
  /** The account the person chose; absent = the first by room. */
  readonly accountId?: string
}

export interface RetryTeamPersonaRequest extends ProjectScopeRequest {
  readonly personaId: string
}

export type StartResult =
  | { readonly ok: true; readonly view: TeamConnectView }
  | { readonly ok: false; readonly code: 'no_one' | 'no_account' | 'unknown_account' }

export class TeamConnect {
  private readonly running = new Map<string, Promise<void>>()

  constructor(private readonly ports: TeamConnectPorts) {}

  /** @returns The banner and the modal: who is without AI, how many are only being checked, and the accounts to choose from (the first is the default). */
  overview(projectId: string): TeamAiView {
    const counts = peopleWithoutAi(this.ports.team(projectId), this.ports.cards())
    return { ...counts, choices: rankAccounts(this.ports.accounts(projectId)) }
  }

  /** @returns The progress of the project's last (or running) connection. */
  progress(projectId: string): TeamConnectView {
    return this.ports.load(projectId) ?? { state: 'idle', rows: [] }
  }

  /** @returns A promise that settles when the project's running connection ends (tests, shutdown). */
  settled(projectId: string): Promise<void> {
    return this.running.get(projectId) ?? Promise.resolve()
  }

  /**
   * Wake everyone who is without AI on the chosen account, one at a time.
   * @param projectId - Tenant.
   * @param accountId - The account the person chose; absent = the first by room.
   * @returns The first view at once (every row waiting); the rest happens in the background and is read with {@link progress}.
   */
  start(projectId: string, accountId?: string): StartResult {
    if (this.running.has(projectId)) return { ok: true, view: this.progress(projectId) }
    const { without, choices } = this.overview(projectId)
    if (without.length === 0) return { ok: false, code: 'no_one' }
    const chosen = accountId === undefined ? choices[0] : choices.find(choice => choice.id === accountId)
    if (chosen === undefined) return { ok: false, code: accountId === undefined ? 'no_account' : 'unknown_account' }
    const rows: TeamConnectRow[] = without.map(person => ({ personaId: person.personaId, name: person.name, status: 'esperando' }))
    const first: TeamConnectView = { state: 'running', accountId: chosen.id, provider: chosen.provider, rows }
    this.ports.save(projectId, first)
    const job = this.run(projectId, chosen.provider, first).finally(() => { this.running.delete(projectId) })
    this.running.set(projectId, job)
    return { ok: true, view: first }
  }

  /**
   * Try one persona again, alone (her row said "Não conectou").
   * @param projectId - Tenant.
   * @param personaId - The persona.
   * @returns The view after her attempt; unchanged when she is not in a row that failed.
   */
  async retry(projectId: string, personaId: string): Promise<TeamConnectView> {
    const view = this.progress(projectId)
    const row = view.rows.find(item => item.personaId === personaId)
    if (row?.status !== 'nao_conectou' || view.provider === undefined || this.running.has(projectId)) return view
    const job = (async (): Promise<void> => {
      await this.ports.recheck()
      await this.step(projectId, personaId, view.provider as CliName, { ...view, state: 'running' })
      const after = this.progress(projectId)
      this.ports.save(projectId, { ...after, state: after.rows.every(item => item.status === 'conectada') ? 'done' : 'partial' })
    })().finally(() => { this.running.delete(projectId) })
    this.running.set(projectId, job)
    await job
    return this.progress(projectId)
  }

  private async run(projectId: string, cli: CliName, start: TeamConnectView): Promise<void> {
    try {
      await this.ports.recheck() // the person has just signed in: ask the engines again, once, before anyone is woken
    } catch (error) {
      void error // a failed check is not a logout: each persona's own verdict says what it could tell
    }
    let view = start
    for (const row of start.rows) view = await this.step(projectId, row.personaId, cli, view)
    this.ports.save(projectId, { ...view, state: view.rows.every(item => item.status === 'conectada') ? 'done' : 'partial' })
  }

  /** One persona: connecting → apply her engine (only when she is not on it) → wake → connected or "did not connect". Never throws. */
  private async step(projectId: string, personaId: string, cli: CliName, from: TeamConnectView): Promise<TeamConnectView> {
    const mark = (status: RowStatus, reason?: WakeFailure): TeamConnectView => {
      const current = this.ports.load(projectId) ?? from
      const next: TeamConnectView = {
        ...current,
        rows: current.rows.map(row => row.personaId === personaId
          ? { personaId: row.personaId, name: row.name, status, ...(reason === undefined ? {} : { reason }) }
          : row),
      }
      this.ports.save(projectId, next)
      return next
    }
    mark('conectando')
    try {
      const person = this.ports.team(projectId).find(item => item.id === personaId)
      if (person === undefined) return mark('nao_conectou', 'falhou')
      if (!(person.runner.kind === 'cli' && person.runner.cli === cli)) this.ports.applyEngine(projectId, personaId, cli)
      const woke = await (this.ports.wake?.(projectId, personaId, cli, from.accountId) ?? Promise.resolve(wakeVerdict(this.ports.cards().find(card => card.id === cli))))
      return woke.ok ? mark('conectada') : mark('nao_conectou', woke.reason)
    } catch (error) {
      void error
      return mark('nao_conectou', 'falhou')
    }
  }
}
