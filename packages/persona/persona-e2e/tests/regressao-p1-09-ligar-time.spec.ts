/**
 * REGRESSÃO do Carbon, auditoria do snapshot 1, P1-09 (item 13, "Ligar a IA para a equipe toda"; dono: Tally) — a parte do HOST, pronta para quando ele corrigir:
 *   A  a conta que a pessoa ESCOLHEU não fica ligada às personas acordadas: `applyEngine` muda o `cli` mas nunca grava `active_account`; a persona segue olhando o assento "primeiro da lista"
 *      (`activeAccountView` cai em `accounts.list(...)[0]`) e, ao rodar, `seatForPersona` escolhe um assento pela política, não o que a pessoa escolheu;
 *   B  `accountsOf` mostra SÓ os assentos salvos quando há algum: um assento salvo do Claude (deslogado) esconde o Codex que o probe encontrou logado, então a pessoa fica sem a conta que funciona.
 * (A parte de tela do P1-09 — modal sem contas e o estado `partial` que não se refaz — é do client e fica fora deste arquivo; o fim a fim de UI pede o app real.)
 *
 * Em processo (host real, probe injetado, 0 IA). Cada cenário tem antes um teste de OBSERVAÇÃO (a ligação aconteceu, as personas trocaram de motor, o assento existe) e o teste do que estava
 * vermelho. O Tally corrigiu (P1-09, 12/11): os dois viraram testes normais. O veredito é PURO e provado nos dois lados.
 */
import type { ConnectionSnapshot } from '@deepseek-ai/dsh-persona-runners'
import { describe, expect, vi } from 'vitest'
import type PersonaHost from '../../persona-host/src/index.ts'
import { SCOPE, it, openJourney } from '../../persona-host/tests/journeys/journey-host.ts'


const claudeIn: ConnectionSnapshot = { id: 'claude', kind: 'cli', installed: true, loggedIn: true, models: [] }
const claudeOut: ConnectionSnapshot = { id: 'claude', kind: 'cli', installed: true, loggedIn: false, models: [] }
const codexIn: ConnectionSnapshot = { id: 'codex', kind: 'cli', installed: true, loggedIn: true, models: [] }
const codexOut: ConnectionSnapshot = { id: 'codex', kind: 'cli', installed: true, loggedIn: false, models: [] }

/** What the scenario read of one woken persona: the account the host keeps for her and the one her card shows. */
export interface SeatSeen { readonly personaId: string; readonly stored: string | undefined; readonly shown: string | undefined }

/** O veredito de A, PURO: toda persona acordada tem de ter ligada a conta que a pessoa escolheu (o assento gravado E o que o cartão mostra). */
export function seatProblems(seen: readonly SeatSeen[], chosenId: string, chosenLabel: string): string[] {
  return seen.flatMap((row) => {
    const out: string[] = []
    if (row.stored !== chosenId) out.push(`${row.personaId}: o host não ligou a conta escolhida (${chosenId}); guardou ${String(row.stored)}`)
    if (row.shown !== chosenLabel) out.push(`${row.personaId}: o cartão mostra a conta "${String(row.shown)}" e não a escolhida ("${chosenLabel}")`)
    return out
  })
}

/** O veredito de B, PURO: o motor que o probe achou LOGADO tem de estar entre as escolhas, mesmo com um assento salvo de outro motor. */
export function choiceProblems(choices: ReadonlyArray<{ readonly provider: string }>, signedInProvider: string): string[] {
  return choices.some(choice => choice.provider === signedInProvider) ? [] : [`o ${signedInProvider} está logado no probe e não aparece entre as escolhas (${JSON.stringify(choices.map(choice => choice.provider))})`]
}

describe('P1-09 — vereditos do cenário (puros)', () => {
  it('A: a conta escolhida gravada e mostrada passa; cada falta é acusada, uma de cada vez', () => {
    expect(seatProblems([{ personaId: 'bia', stored: 'claude:trabalho', shown: 'Trabalho' }], 'claude:trabalho', 'Trabalho')).toEqual([])
    expect(seatProblems([{ personaId: 'bia', stored: undefined, shown: 'Trabalho' }], 'claude:trabalho', 'Trabalho')).toHaveLength(1)
    expect(seatProblems([{ personaId: 'bia', stored: 'claude:trabalho', shown: 'Pessoal' }], 'claude:trabalho', 'Trabalho')).toHaveLength(1)
    expect(seatProblems([{ personaId: 'bia', stored: undefined, shown: 'Pessoal' }], 'claude:trabalho', 'Trabalho')).toHaveLength(2)
  })
  it('B: o motor logado do probe entre as escolhas passa; ausente é acusado', () => {
    expect(choiceProblems([{ provider: 'claude' }, { provider: 'codex' }], 'codex')).toEqual([])
    expect(choiceProblems([{ provider: 'claude' }], 'codex')).toHaveLength(1)
    expect(choiceProblems([], 'codex')).toHaveLength(1)
  })
})

/** Um host com a Ana (dona) e três pessoas no motor `cli`. */
function team(cli: 'claude' | 'codex'): PersonaHost {
  const h = openJourney()
  h.createWorkspace({ id: 'ws', name: 'Padaria', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...SCOPE, displayName: 'Ana', handle: 'ana', role: 'owner' })
  for (const [id, name] of [['bia', 'Bia'], ['teo', 'Teo'], ['lia', 'Lia']] as const) {
    h.createPersona({
      ...SCOPE, id, name, title: 'Cargo', description: 'x', personality: 'Clara.', instructions: 'Ajude.', avatarKind: 'gallery', avatarRef: name.toLowerCase(),
      runnerKind: 'cli', runnerCli: cli, runnerModel: 'default', canRecruit: false, createdBy: 'ana',
    })
  }
  return h
}

describe('P1-09 A — a conta escolhida fica ligada a cada persona acordada (host em processo, probe injetado)', () => {
  /** O time está no Codex (deslogado de verdade); o Claude está logado e a pessoa tem DOIS assentos dele: "Pessoal" (o primeiro da lista) e "Trabalho" (o que ela escolhe). */
  async function connectOnWork(): Promise<{ readonly h: PersonaHost; readonly seen: SeatSeen[]; readonly view: ReturnType<PersonaHost['getTeamConnect']> }> {
    const h = team('codex')
    h.accounts.create({ id: 'claude:pessoal', workspaceId: 'ws', provider: 'claude', label: 'Pessoal' })
    h.accounts.create({ id: 'claude:trabalho', workspaceId: 'ws', provider: 'claude', label: 'Trabalho' })
    vi.spyOn(h.connections, 'detect').mockResolvedValue([claudeIn, codexOut])
    await h.connections.ready()
    const started = h.connectTeam({ ...SCOPE, accountId: 'claude:trabalho' })
    expect(started.ok, JSON.stringify(started)).toBe(true)
    await h.teamConnect.settled('pp')
    // `activeAccount` is on the persona CARD (`getPersonaCard`), not on the `listPersonas` row.
    const seen = ['bia', 'teo', 'lia'].map(personaId => ({
      personaId,
      stored: h.screens.screens.get<{ accountId: string }>('pp', 'active_account', personaId)?.accountId,
      shown: h.getPersonaCard({ ...SCOPE, personaId }).activeAccount?.label,
    }))
    return { h, seen, view: h.getTeamConnect(SCOPE) }
  }

  it('OBSERVAÇÃO: o time inteiro foi ligado na conta "Trabalho" (a ligação terminou, as três pessoas trocaram para o Claude; havia dois assentos)', async () => {
    const { h, view } = await connectOnWork()
    expect(view).toMatchObject({ state: 'done', provider: 'claude', accountId: 'claude:trabalho' })
    expect(view.rows.map(row => row.status)).toEqual(['conectada', 'conectada', 'conectada'])
    for (const id of ['bia', 'teo', 'lia']) expect(h.product.getPersona(id)?.runner).toMatchObject({ kind: 'cli', cli: 'claude' })
    expect(h.accounts.list('ws', 'claude').map(row => row.id).sort()).toEqual(['claude:pessoal', 'claude:trabalho'])
  }, 60_000)

  it('P1-09 A — cada persona acordada fica com a conta ESCOLHIDA ("Trabalho") gravada e mostrada, não o primeiro assento da lista', async () => {
    const { seen } = await connectOnWork()
    expect(seatProblems(seen, 'claude:trabalho', 'Trabalho'), JSON.stringify(seen)).toEqual([])
  }, 60_000)
})

describe('P1-09 B — o motor logado do probe não some quando há um assento salvo de outro motor (host em processo, probe injetado)', () => {
  /** O time está no Claude (deslogado de verdade), há UM assento salvo dele e o Codex está logado no probe, sem assento salvo. */
  async function overviewWithOneSeat(): Promise<{ readonly h: PersonaHost; readonly overview: ReturnType<PersonaHost['getTeamAi']> }> {
    const h = team('claude')
    h.accounts.create({ id: 'claude:pessoal', workspaceId: 'ws', provider: 'claude', label: 'Pessoal' })
    vi.spyOn(h.connections, 'detect').mockResolvedValue([claudeOut, codexIn])
    await h.connections.ready()
    return { h, overview: h.getTeamAi(SCOPE) }
  }

  it('OBSERVAÇÃO: as três pessoas estão sem IA (o Claude está deslogado, confirmado) e existe o assento salvo do Claude', async () => {
    const { h, overview } = await overviewWithOneSeat()
    expect(overview.without.map(row => row.personaId).sort()).toEqual(['bia', 'lia', 'teo'])
    expect(h.accounts.list('ws', 'claude').map(row => row.id)).toEqual(['claude:pessoal'])
  }, 60_000)

  it('P1-09 B — o Codex logado no probe aparece entre as escolhas, junto do assento salvo', async () => {
    const { overview } = await overviewWithOneSeat()
    expect(choiceProblems(overview.choices, 'codex'), JSON.stringify(overview.choices)).toEqual([])
  }, 60_000)
})
