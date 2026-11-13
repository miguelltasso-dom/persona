/**
 * Varias contas + D-116 (Tally): o estado de CONTA e da MAQUINA. Nada disso viaja com a persona (o pacote do "Levar" nao o leva) e nada disso e lido de outro computador. Este arquivo e a lista UNICA do que e
 * da maquina, e as duas limpezas que a mantem coerente:
 *  - `releaseMachineSeat`: a persona SAIU deste computador (mover): some o assento dela, a espera (hold) e as esperas de cota das Tarefas dela; o historico (livro de limites e de trocas) fica, so de acrescimo;
 *  - `releaseAccountDocs`: uma conta foi REMOVIDA: some o que apontava para ela (assento de cada persona, hold, limite em andamento), para nenhum turno apontar para o vazio.
 * Mais `sameAccountHome`: duas contas nunca dividem a pasta de login (no Windows `C:\A` e `c:/a/` sao a mesma pasta).
 */

import type { ProductRepos, ScreenRepos } from '@deepseek-ai/dsh-persona-store'

/** Docs da tela (`screens`) que sao da maquina e NUNCA entram no pacote de uma persona. */
export const MACHINE_ACCOUNT_DOCS = [
  'active_account',
  'account_hold',
  'account_limit',
  'account_limit_log',
  'account_swap',
  'account_activity',
  'quota_wait',
  'engine_local',
] as const

/** Tabelas do banco que tambem sao da maquina (credenciais e politica de troca). */
export const MACHINE_ACCOUNT_TABLES = ['accounts', 'account_policy'] as const

export type MachineAccountDoc = (typeof MACHINE_ACCOUNT_DOCS)[number]

/** @returns Whether a screens doc kind is account state of the machine (never travels). */
export function isMachineAccountDoc(kind: string): boolean {
  return (MACHINE_ACCOUNT_DOCS as readonly string[]).includes(kind)
}

interface SeatDoc { readonly accountId: string }
interface WaitDoc { readonly ticketId: string; readonly personaId?: string }

export interface ReleaseDeps {
  readonly screens: Pick<ScreenRepos, 'get' | 'list' | 'delete'>
}

/**
 * The persona left this computer: drop her seat, her hold and the quota waits of her Tasks.
 * @param deps - The screens KV.
 * @param projectId - Her project.
 * @param personaId - Her id.
 * @returns What was dropped.
 */
export function releaseMachineSeat(deps: ReleaseDeps, projectId: string, personaId: string): { readonly seat: boolean; readonly hold: boolean; readonly waits: number; readonly engine: boolean } {
  const seat = deps.screens.get<SeatDoc>(projectId, 'active_account', personaId) !== undefined
  if (seat) deps.screens.delete(projectId, 'active_account', personaId)
  const hold = deps.screens.get<SeatDoc>(projectId, 'account_hold', personaId) !== undefined
  if (hold) deps.screens.delete(projectId, 'account_hold', personaId)
  const engine = deps.screens.get(projectId, 'engine_local', personaId) !== undefined
  if (engine) deps.screens.delete(projectId, 'engine_local', personaId)
  let waits = 0
  for (const row of deps.screens.list<WaitDoc>(projectId, 'quota_wait')) {
    if (row.personaId !== personaId) continue
    deps.screens.delete(projectId, 'quota_wait', row.ticketId)
    waits += 1
  }
  return { seat, hold, waits, engine }
}

export interface ReleaseAccountDeps extends ReleaseDeps {
  readonly product: Pick<ProductRepos, 'listProjects' | 'listPersonas'>
}

/**
 * An account was removed: drop everything that pointed to it.
 * @param deps - Screens KV and the product's projects and personas.
 * @param workspaceId - Tenant.
 * @param accountId - The removed account.
 * @returns The personas that had it as their seat (their warm sessions must be dropped by the caller).
 */
export function releaseAccountDocs(deps: ReleaseAccountDeps, workspaceId: string, accountId: string): readonly { readonly projectId: string; readonly personaId: string }[] {
  const affected: { projectId: string; personaId: string }[] = []
  for (const project of deps.product.listProjects(workspaceId)) {
    for (const persona of deps.product.listPersonas(project.id)) {
      if (deps.screens.get<SeatDoc>(project.id, 'active_account', persona.id)?.accountId === accountId) {
        deps.screens.delete(project.id, 'active_account', persona.id)
        affected.push({ projectId: project.id, personaId: persona.id })
      }
      if (deps.screens.get<SeatDoc>(project.id, 'account_hold', persona.id)?.accountId === accountId) deps.screens.delete(project.id, 'account_hold', persona.id)
    }
    if (deps.screens.get(project.id, 'account_limit', accountId) !== undefined) deps.screens.delete(project.id, 'account_limit', accountId)
  }
  return affected
}

const normalizedHome = (home: string): string => home.trim().replace(/\\/gu, '/').replace(/\/+$/u, '').toLowerCase()

/**
 * @param a - A login folder.
 * @param b - Another one.
 * @returns Whether they are the same folder (empty = the engine's default home, which is told apart by the account id, never equal).
 */
export function sameAccountHome(a: string, b: string): boolean {
  const left = normalizedHome(a)
  return left !== '' && left === normalizedHome(b)
}
