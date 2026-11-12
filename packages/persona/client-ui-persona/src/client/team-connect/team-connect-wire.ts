/**
 * "Ligar a IA para a equipe toda" no cliente (item 13, Tally, 11/11; spec: DESIGN/COLHEITA-MUSE §13, contrato do host: persona-spec/contracts/team-connect.md).
 * Puro + chamadas async finas sobre o Remote, no mesmo padrão de `remote/engine-status.ts`: o formato do host é validado aqui e qualquer coisa estranha vira "nada a mostrar",
 * nunca uma acusação ("sem IA") nem um erro na cara da pessoa. Sem React (o hook mora em `use-team-connect.ts`).
 */
import { unwrapRemote } from '../data/remote-call.ts'
import { isRemoteResult } from '../remote/persona-remote-unwrap.ts'

export interface TeamScope {
  readonly workspaceId: string
  readonly projectId: string
}

/** Folga da janela de uso de uma conta: nunca dinheiro (D-092); `desconhecida` = o fornecedor não publicou, nunca se presume folga. */
export type RoomUi = 'sobra' | 'quase_no_limite' | 'desconhecida'
export type TeamEngine = 'claude' | 'codex' | 'cursor' | 'opencode'
export type RowStatusUi = 'esperando' | 'conectando' | 'conectada' | 'nao_conectou'
export type RowReasonUi = 'sem_login' | 'nao_conferido' | 'falhou'

export interface TeamPersonUi {
  readonly personaId: string
  readonly name: string
  readonly title: string
}

export interface TeamAccountUi {
  readonly id: string
  readonly provider: TeamEngine
  readonly label: string
  readonly room: RoomUi
}

export interface TeamAiUi {
  /** CONFIRMADAS sem IA: o banner e a lista do modal. */
  readonly without: readonly TeamPersonUi[]
  /** Só sendo conferidas (ou que não deu para conferir): nunca entram no banner. */
  readonly unsure: number
  /** Contas para ligar, já ordenadas pela folga (a primeira é a padrão). */
  readonly choices: readonly TeamAccountUi[]
}

export interface TeamRowUi {
  readonly personaId: string
  readonly name: string
  readonly status: RowStatusUi
  readonly reason?: RowReasonUi
}

export type ConnectStateUi = 'idle' | 'running' | 'done' | 'partial'

export interface TeamConnectUi {
  readonly state: ConnectStateUi
  readonly accountId?: string
  readonly provider?: TeamEngine
  readonly rows: readonly TeamRowUi[]
}

export type StartUi =
  | { readonly ok: true; readonly view: TeamConnectUi }
  | { readonly ok: false; readonly code: 'no_one' | 'no_account' | 'unknown_account' | 'failed' }

export const TEAM_AI_EMPTY: TeamAiUi = { without: [], unsure: 0, choices: [] }
export const TEAM_CONNECT_IDLE: TeamConnectUi = { state: 'idle', rows: [] }

/** Superfície mínima e opcional do Remote (um host antigo, ou um fake, pode não ter os métodos: então não há o que mostrar). */
export interface TeamConnectRemoteWire {
  getTeamAi?(request: TeamScope): unknown
  connectTeam?(request: TeamScope & { readonly accountId?: string }): unknown
  getTeamConnect?(request: TeamScope): unknown
  retryTeamPersona?(request: TeamScope & { readonly personaId: string }): unknown
}

const ENGINES: readonly TeamEngine[] = ['claude', 'codex', 'cursor', 'opencode']
const ROOMS: readonly RoomUi[] = ['sobra', 'quase_no_limite', 'desconhecida']
const STATUSES: readonly RowStatusUi[] = ['esperando', 'conectando', 'conectada', 'nao_conectou']
const REASONS: readonly RowReasonUi[] = ['sem_login', 'nao_conferido', 'falhou']
const STATES: readonly ConnectStateUi[] = ['idle', 'running', 'done', 'partial']

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const text = (value: unknown): string => (typeof value === 'string' ? value : '')

/** @param view - A resposta de `getTeamAi`. @returns Os dados do banner e do modal; formato estranho = nada (sem banner). */
export function teamAiFromWire(view: unknown): TeamAiUi {
  if (!isRecord(view)) return TEAM_AI_EMPTY
  const without = (Array.isArray(view.without) ? view.without : []).flatMap((row): TeamPersonUi[] => {
    if (!isRecord(row) || text(row.personaId) === '') return []
    return [{ personaId: text(row.personaId), name: text(row.name) === '' ? text(row.personaId) : text(row.name), title: text(row.title) }]
  })
  const choices = (Array.isArray(view.choices) ? view.choices : []).flatMap((row): TeamAccountUi[] => {
    if (!isRecord(row) || text(row.id) === '') return []
    const provider = ENGINES.find(engine => engine === row.provider)
    if (provider === undefined) return []
    const room = ROOMS.find(candidate => candidate === row.room) ?? 'desconhecida'
    return [{ id: text(row.id), provider, label: text(row.label) === '' ? provider : text(row.label), room }]
  })
  const unsure = typeof view.unsure === 'number' && Number.isFinite(view.unsure) && view.unsure > 0 ? Math.floor(view.unsure) : 0
  return { without, unsure, choices }
}

/** @param view - A resposta de `getTeamConnect` (ou a visão dentro de `connectTeam`). @returns O progresso; formato estranho = parado. */
export function teamConnectFromWire(view: unknown): TeamConnectUi {
  if (!isRecord(view)) return TEAM_CONNECT_IDLE
  const state = STATES.find(candidate => candidate === view.state) ?? 'idle'
  const rows = (Array.isArray(view.rows) ? view.rows : []).flatMap((row): TeamRowUi[] => {
    if (!isRecord(row) || text(row.personaId) === '') return []
    const status = STATUSES.find(candidate => candidate === row.status) ?? 'esperando'
    const reason = REASONS.find(candidate => candidate === row.reason)
    return [{ personaId: text(row.personaId), name: text(row.name) === '' ? text(row.personaId) : text(row.name), status, ...(status === 'nao_conectou' && reason !== undefined ? { reason } : {}) }]
  })
  const provider = ENGINES.find(engine => engine === view.provider)
  return {
    state,
    ...(text(view.accountId) === '' ? {} : { accountId: text(view.accountId) }),
    ...(provider === undefined ? {} : { provider }),
    rows,
  }
}

/** @param view - A resposta de `connectTeam`. */
export function startFromWire(view: unknown): StartUi {
  if (!isRecord(view)) return { ok: false, code: 'failed' }
  if (view.ok === true) return { ok: true, view: teamConnectFromWire(view.view) }
  const code = (['no_one', 'no_account', 'unknown_account'] as const).find(candidate => candidate === view.code)
  return { ok: false, code: code ?? 'failed' }
}

async function settle(value: unknown): Promise<unknown> {
  const resolved = await Promise.resolve(value)
  return isRemoteResult(resolved) ? unwrapRemote(resolved) : resolved
}

/** Lê quem está sem IA. Falha ou host sem o método = ninguém (o banner não existe): nunca acusa por falta de resposta. */
export async function fetchTeamAi(remote: TeamConnectRemoteWire, scope: TeamScope): Promise<TeamAiUi> {
  try {
    if (remote.getTeamAi !== undefined) return teamAiFromWire(await settle(remote.getTeamAi(scope)))
  } catch {
    /* host ocupado ou sem o método: sem banner */
  }
  return TEAM_AI_EMPTY
}

/** Liga a equipe na conta escolhida (ausente = a primeira). Devolve a 1ª visão; o resto se lê com {@link fetchTeamConnect}. */
export async function startTeamConnect(remote: TeamConnectRemoteWire, scope: TeamScope, accountId?: string): Promise<StartUi> {
  try {
    if (remote.connectTeam !== undefined) return startFromWire(await settle(remote.connectTeam({ ...scope, ...(accountId === undefined ? {} : { accountId }) })))
  } catch {
    /* cai no "não deu" */
  }
  return { ok: false, code: 'failed' }
}

/** Lê o progresso real. Falha = parado (a tela repete a leitura; não inventa avanço). */
export async function fetchTeamConnect(remote: TeamConnectRemoteWire, scope: TeamScope): Promise<TeamConnectUi> {
  try {
    if (remote.getTeamConnect !== undefined) return teamConnectFromWire(await settle(remote.getTeamConnect(scope)))
  } catch {
    /* sem leitura agora */
  }
  return TEAM_CONNECT_IDLE
}

/** "Tentar de novo" numa persona que não conectou. */
export async function retryTeamPersona(remote: TeamConnectRemoteWire, scope: TeamScope, personaId: string): Promise<TeamConnectUi> {
  try {
    if (remote.retryTeamPersona !== undefined) return teamConnectFromWire(await settle(remote.retryTeamPersona({ ...scope, personaId })))
  } catch {
    /* mantém a linha como estava */
  }
  return fetchTeamConnect(remote, scope)
}

/** Igualdade rasa do progresso (evita re-render a cada leitura quando nada mudou). */
export function sameTeamConnect(a: TeamConnectUi, b: TeamConnectUi): boolean {
  return a.state === b.state && a.accountId === b.accountId && a.rows.length === b.rows.length
    && a.rows.every((row, at) => row.personaId === b.rows[at]?.personaId && row.status === b.rows[at]?.status && row.reason === b.rows[at]?.reason)
}
