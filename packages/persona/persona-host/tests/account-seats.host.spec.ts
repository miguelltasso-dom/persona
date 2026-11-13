/**
 * Varias contas DE VERDADE (3 Claude + 2 GPT) + D-116 (Keel 15:04/15:28): o assento (`active_account`) e das MAQUINAS. Em um computador so valem as contas ENTRADAS nele; se o assento aponta para uma conta que
 * a maquina nao tem (persona que veio de outro computador, ou conta REMOVIDA) o turno dela NAO pode quebrar; duas contas nunca dividem a pasta de login; persona com casa em outro computador nao recebe
 * motor/conta daqui; ao mover, o assento e as esperas de cota ficam para tras.
 */
import { expect, vi } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { releaseMachineSeat } from '../src/account-docs.ts'
import { teamConnectPorts } from '../src/team-connect-host.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()
const CLOCK = '2026-11-04T15:00:00.000Z'
const SCOPE = { workspaceId: 'ws', projectId: 'pp' }

function persona(h: PersonaHost, id: string, name: string, cli: string): void {
  h.createPersona({
    ...SCOPE, id, name, title: 'Pesquisa', description: 'Pesquisa.', personality: 'Calma.', instructions: 'Ajude.',
    avatarKind: 'gallery', avatarRef: 'atlas', runnerKind: 'cli', runnerCli: cli, runnerModel: 'm', canRecruit: false, createdBy: 'ana',
  })
}

function seed(h: PersonaHost, options: { accounts?: boolean } = {}): void {
  h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
  h.createWorkspace({ id: 'ws', name: 'Padaria', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...SCOPE, displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createMember({ id: 'bob', ...SCOPE, displayName: 'Bob', handle: 'bob', role: 'member' })
  persona(h, 'bia', 'Bia', 'claude')
  h.createChannel({ id: 'geral', ...SCOPE, name: 'geral', topic: '' })
  if (options.accounts !== false) {
    h.accounts.create({ id: 'claude:pessoal', workspaceId: 'ws', provider: 'claude', label: 'Pessoal' })
    h.accounts.create({ id: 'claude:trabalho', workspaceId: 'ws', provider: 'claude', label: 'Trabalho' })
  }
  vi.spyOn(h.connections, 'list').mockReturnValue([{ id: 'claude', kind: 'claude', phase: 'ready', available: true, loggedIn: true }] as never)
}

const seatOf = (h: PersonaHost, personaId = 'bia'): { home: string; accountId?: string } => h.orchestration.accountSeatOf!('pp', h.product.getPersona(personaId)!)
const activeOf = (h: PersonaHost, personaId = 'bia'): string | undefined => h.screens.screens.get<{ accountId: string }>('pp', 'active_account', personaId)?.accountId

// ---- o assento que a maquina nao tem ----------------------------------------------------------------------------------------------------------------------

it('SEAT-1 (controle): ligada a uma conta que a maquina tem, o assento e essa conta', () => {
  const h = host()
  seed(h)
  h.screens.screens.put('pp', 'active_account', 'bia', { accountId: 'claude:trabalho' })
  expect(seatOf(h).accountId).toBe('claude:trabalho')
})

it('SEAT-2 (D-116): o assento aponta para uma conta que ESTA maquina nao tem (veio de outro computador): o turno nao quebra e cai numa conta daqui', () => {
  const h = host()
  seed(h)
  h.screens.screens.put('pp', 'active_account', 'bia', { accountId: 'claude:do-pc-da-padaria' })
  expect(() => seatOf(h)).not.toThrow()
  expect(['claude:pessoal', 'claude:trabalho']).toContain(seatOf(h).accountId)
  expect(['claude:pessoal', 'claude:trabalho']).toContain(activeOf(h)) // o doc nao fica apontando para o vazio
})

it('SEAT-3 (varias contas): tirar a conta a que a persona esta ligada NAO derruba o turno dela; ela passa a outra conta e nenhum doc fica apontando para o vazio', () => {
  const h = host()
  seed(h)
  h.screens.screens.put('pp', 'active_account', 'bia', { accountId: 'claude:pessoal' })
  h.screens.screens.put('pp', 'account_hold', 'bia', { personaId: 'bia', accountId: 'claude:pessoal', since: CLOCK })
  h.screens.screens.put('pp', 'account_limit', 'claude:pessoal', { accountId: 'claude:pessoal', label: 'Pessoal', provider: 'claude', since: CLOCK, logId: 'l1' })
  expect(h.removeConnectionAccount({ ...SCOPE, accountId: 'claude:pessoal' })).toBe(true)
  expect(activeOf(h)).toBeUndefined()
  expect(h.screens.screens.get('pp', 'account_hold', 'bia')).toBeUndefined()
  expect(h.screens.screens.get('pp', 'account_limit', 'claude:pessoal')).toBeUndefined()
  expect(() => seatOf(h)).not.toThrow()
  expect(seatOf(h).accountId).toBe('claude:trabalho')
})

it('SEAT-4 (Desfazer): se a conta que ela deixou foi removida entre a troca e o Desfazer, o Desfazer diz `stale` em vez de ligar a persona a uma conta que nao existe', () => {
  const h = host()
  seed(h)
  h.screens.screens.put('pp', 'active_account', 'bia', { accountId: 'claude:trabalho' })
  h.screens.screens.put('pp', 'account_swap', 'bia:t1', {
    swapId: 'bia:t1', personaId: 'bia', personaName: 'Bia', provider: 'claude', from: { accountId: 'claude:pessoal', label: 'Pessoal' }, to: { accountId: 'claude:trabalho', label: 'Trabalho' },
    auto: false, undone: false, at: CLOCK,
  })
  h.removeConnectionAccount({ ...SCOPE, accountId: 'claude:pessoal' })
  expect(h.undoAccountSwap({ ...SCOPE, swapId: 'bia:t1' })).toEqual({ undone: false, reason: 'stale' })
  expect(activeOf(h)).toBe('claude:trabalho')
})

// ---- 3 Claude + 2 GPT, sem colisao -----------------------------------------------------------------------------------------------------------------------

it('ACC-1: 3 contas Claude + 2 Codex entram no mesmo PC: 5 pastas DISTINTAS e cada persona so enxerga as do motor dela', () => {
  const h = host()
  seed(h, { accounts: false })
  persona(h, 'cris', 'Cris', 'codex')
  for (const label of ['Pessoal', 'Trabalho', 'Reserva']) h.addConnectionAccount({ ...SCOPE, provider: 'claude', label })
  for (const label of ['Pessoal', 'Casa']) h.addConnectionAccount({ ...SCOPE, provider: 'codex', label })
  const rows = h.accounts.list('ws')
  expect(rows.map(row => row.id).sort()).toEqual(['claude:pessoal', 'claude:reserva', 'claude:trabalho', 'codex:casa', 'codex:pessoal'])
  expect(new Set(rows.map(row => row.homeDir.toLowerCase())).size).toBe(5)
  expect(rows.every(row => row.homeDir !== '')).toBe(true)
  expect(seatOf(h, 'bia').accountId).toMatch(/^claude:/u)
  expect(seatOf(h, 'cris').accountId).toMatch(/^codex:/u)
})

it('ACC-2: a mesma pasta de login em duas contas e recusada (conflict), mesmo escrita de outro jeito no Windows; os turnos seguem', () => {
  const h = host()
  seed(h, { accounts: false })
  h.addConnectionAccount({ ...SCOPE, provider: 'claude', label: 'Pessoal', homeDir: 'C:\\Contas\\A' })
  expect(() => h.addConnectionAccount({ ...SCOPE, provider: 'claude', label: 'Trabalho', homeDir: 'C:\\Contas\\A' })).toThrow('conflict')
  expect(() => h.addConnectionAccount({ ...SCOPE, provider: 'claude', label: 'Reserva', homeDir: 'c:/contas/a/' })).toThrow('conflict')
  expect(h.accounts.list('ws').map(row => row.id)).toEqual(['claude:pessoal'])
  expect(() => seatOf(h)).not.toThrow()
})

it('ACC-3: so o dono entra conta na maquina; o mesmo rotulo de novo e `conflict` e nao sobrescreve nada; "Pessoal" em dois motores convive', () => {
  const h = host()
  seed(h, { accounts: false })
  h.addConnectionAccount({ ...SCOPE, provider: 'claude', label: 'Pessoal' })
  const first = h.accounts.get('claude:pessoal')!
  expect(() => h.addConnectionAccount({ ...SCOPE, provider: 'claude', label: 'pessoal ' })).toThrow('conflict')
  expect(h.accounts.get('claude:pessoal')).toEqual(first) // nada sobrescrito
  h.addConnectionAccount({ ...SCOPE, provider: 'codex', label: 'Pessoal' })
  expect(h.accounts.get('codex:pessoal')!.homeDir).not.toBe(first.homeDir)
  h.sessionMemberId = 'bob'
  expect(() => h.addConnectionAccount({ ...SCOPE, provider: 'claude', label: 'Do Bob' })).toThrow('forbidden') // a conta da maquina e de quem a configurou
  expect(() => h.removeConnectionAccount({ ...SCOPE, accountId: 'claude:pessoal' })).toThrow('forbidden')
})

// ---- D-116: casa em outro computador ---------------------------------------------------------------------------------------------------------------------

function connectPorts(h: PersonaHost, homeHere: (personaId: string) => boolean) {
  return teamConnectPorts({
    product: h.product, accounts: h.accounts, usage: h.usage, screens: h.screens.screens, orchestration: h.orchestration,
    connections: () => [], recheck: () => Promise.resolve([]), loginStatus: () => 'logged_out', homeHere,
  })
}

it('TC-1 (regra 2): a persona com casa em OUTRO computador nao aparece em "Ligar a IA para a equipe" e nao recebe motor nem conta daqui', () => {
  const h = host()
  seed(h)
  persona(h, 'cris', 'Cris', 'claude')
  const ports = connectPorts(h, id => id !== 'bia')
  expect(ports.team('pp').map(row => row.id)).toEqual(['cris'])
  expect(() => ports.applyEngine('pp', 'bia', 'codex')).toThrow('home-elsewhere')
  expect(h.product.getPersona('bia')!.runner).toMatchObject({ kind: 'cli', cli: 'claude' }) // a ficha dela nao mudou
  ports.bindAccount?.('pp', 'bia', 'claude:trabalho')
  expect(activeOf(h)).toBeUndefined()
})

it('TC-2 (regra 2, controle): a persona com casa AQUI recebe motor e conta como sempre', () => {
  const h = host()
  seed(h)
  persona(h, 'cris', 'Cris', 'claude')
  const ports = connectPorts(h, () => true)
  expect(ports.team('pp').map(row => row.id).sort()).toEqual(['bia', 'cris'])
  ports.bindAccount?.('pp', 'cris', 'claude:trabalho')
  expect(activeOf(h, 'cris')).toBe('claude:trabalho')
  ports.applyEngine('pp', 'cris', 'codex')
  expect(h.product.getPersona('cris')!.runner).toMatchObject({ kind: 'cli', cli: 'codex' })
})

// ---- D-116: o "Levar" ------------------------------------------------------------------------------------------------------------------------------------

it('MOVE-1 (regra 4): ao sair do computador, o assento, a espera e as esperas de cota da persona somem; o historico e as outras personas ficam', () => {
  const h = host()
  seed(h)
  persona(h, 'cris', 'Cris', 'claude')
  const kv = h.screens.screens
  kv.put('pp', 'active_account', 'bia', { accountId: 'claude:pessoal' })
  kv.put('pp', 'active_account', 'cris', { accountId: 'claude:trabalho' })
  kv.put('pp', 'account_hold', 'bia', { personaId: 'bia', accountId: 'claude:pessoal', since: CLOCK })
  kv.put('pp', 'quota_wait', 'tk-bia', { ticketId: 'tk-bia', assignmentId: 'a1', provider: 'claude', personaId: 'bia', since: CLOCK })
  kv.put('pp', 'quota_wait', 'tk-cris', { ticketId: 'tk-cris', assignmentId: 'a2', provider: 'claude', personaId: 'cris', since: CLOCK })
  kv.put('pp', 'engine_local', 'bia', { cli: 'codex', model: 'default', at: CLOCK })
  kv.put('pp', 'account_limit_log', 'l1', { accountId: 'claude:pessoal', label: 'Pessoal', provider: 'claude', at: CLOCK })
  expect(releaseMachineSeat({ screens: kv }, 'pp', 'bia')).toEqual({ seat: true, hold: true, waits: 1, engine: true })
  expect(activeOf(h, 'bia')).toBeUndefined()
  expect(kv.get('pp', 'account_hold', 'bia')).toBeUndefined()
  expect(kv.get('pp', 'quota_wait', 'tk-bia')).toBeUndefined()
  expect(kv.get('pp', 'quota_wait', 'tk-cris')).toBeDefined() // a espera de OUTRA persona fica
  expect(activeOf(h, 'cris')).toBe('claude:trabalho')
  expect(kv.get('pp', 'account_limit_log', 'l1')).toBeDefined() // o livro e so de acrescimo
  expect(releaseMachineSeat({ screens: kv }, 'pp', 'bia')).toEqual({ seat: false, hold: false, waits: 0, engine: false }) // repetir nao faz nada
})
