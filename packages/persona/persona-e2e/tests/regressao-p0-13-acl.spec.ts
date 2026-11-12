/**
 * REGRESSÃO do Carbon, auditoria do snapshot 1 (`persona-spec/carbon/auditorias/colheita-s1.md`), P0-13: falta de ACL de escrita/dono nos `@Remote`.
 *   - um convidado/membro chamava `forgetPlaybook` (apaga dados) com checagem de LEITURA, e as mutações de Cofre/Navegador/Estação (`saveCofreKey`, `createBrowserProfile`,
 *     `closeBrowserProfile`, `setStationRunning`) sem exigir o dono — e como as duas últimas famílias são `async`, o teste da matriz de ACL as dava como "async" e passava verde sem testá-las;
 *   - um workspace SEM membros liberava os recursos globais da MÁQUINA (a estação, o navegador) a qualquer um;
 *   - `pairStation` aceitava 2.000 palpites por 10 s (força bruta no código de pareamento).
 *
 * O cenário pelo HOST em processo (0 IA): os remotes são chamados DE VERDADE e AGUARDADOS (`await`: uma rejeição vira "forbidden", uma Promise que resolve vira "ok"), em cada papel.
 * ESTADO: CORRIGIDO na árvore depois da auditoria (`requireWrite`, `requireMachineOwner`, bloqueio por tentativas no pareamento). Ficou NORMAL: regressão permanente, com a observação
 * antes (o DONO chama os mesmos remotes e não é barrado: a recusa do convidado é de ACL, não de payload).
 */
import { describe, expect, it as vitestIt } from 'vitest'
import { RemoteFault } from '../../persona-host/src/remote-guard.ts'
import type PersonaHost from '../../persona-host/src/index.ts'
import { it, openJourney, seedJourney } from '../../persona-host/tests/journeys/journey-host.ts'

type Outcome = 'ok' | 'forbidden' | `error:${string}`
type Call = (h: PersonaHost) => unknown

const SCOPE = { workspaceId: 'ws', projectId: 'pp' }
/** As escritas que a auditoria cita, com um payload válido (a recusa tem de ser da ACL, não do formato). */
const WRITES: ReadonlyArray<readonly [string, Call]> = [
  ['forgetPlaybook', h => h.forgetPlaybook({ ...SCOPE, id: 'nota-1' })],
  ['saveCofreKey', h => h.saveCofreKey({ ...SCOPE, service: 'telegram', secret: 'token-secreto-123', title: 'Telegram da loja' })],
  ['createBrowserProfile', h => h.createBrowserProfile({ ...SCOPE, name: 'Loja-acl' })],
  ['closeBrowserProfile', h => h.closeBrowserProfile({ ...SCOPE, profileId: 'p-inexistente' })],
  ['setStationRunning', h => h.setStationRunning({ ...SCOPE, running: false })],
  ['pairStation', h => h.pairStation({ ...SCOPE, code: 'ABCDEFGH' })],
]

/** O que o remote fez, AGUARDADO: resolveu (`ok`), foi recusado pela ACL (`forbidden`) ou falhou por outro motivo. */
async function outcomeOf(h: PersonaHost, call: Call): Promise<Outcome> {
  try {
    await call(h)
    return 'ok'
  } catch (error: unknown) {
    // The host refuses with `forbidden` either as a `RemoteFault` (code) or as a plain Error whose message is that word, depending on the layer that refused.
    const code = error instanceof RemoteFault ? error.code : undefined
    const message = error instanceof Error ? error.message : ''
    if (code === 'forbidden' || /^forbidden\b/u.test(message)) return 'forbidden'
    return `error:${code ?? (message.slice(0, 40) || 'desconhecido')}`
  }
}

/** O veredito, PURO: toda escrita que um convidado/membro conseguiu fazer, ou que a ACL não foi quem recusou (vazio = todas recusadas pela ACL). */
export function aclProblems(rows: ReadonlyArray<{ readonly remote: string; readonly role: string; readonly outcome: Outcome }>): string[] {
  return rows.filter(row => row.outcome !== 'forbidden').map(row => `${row.role} chamou ${row.remote} e o resultado foi "${row.outcome}" em vez de "forbidden"`)
}

describe('P0-13 — vereditos do cenário (puros)', () => {
  it('só "forbidden" passa; "ok" (a escrita passou) e outro erro (a ACL nem foi quem recusou) são acusados', () => {
    expect(aclProblems([{ remote: 'a', role: 'guest', outcome: 'forbidden' }])).toEqual([])
    expect(aclProblems([{ remote: 'a', role: 'guest', outcome: 'ok' }])).toHaveLength(1)
    expect(aclProblems([{ remote: 'a', role: 'member', outcome: 'error:invalid-payload' }])).toHaveLength(1)
  })
})

function open(): PersonaHost {
  const h = openJourney()
  seedJourney(h, [])
  h.createMember({ id: 'bia', ...SCOPE, displayName: 'Bia', handle: 'bia', role: 'member' })
  h.createMember({ id: 'gus', ...SCOPE, displayName: 'Gus', handle: 'gus', role: 'guest' })
  return h
}

describe('P0-13 — as escritas da máquina, do Cofre e dos dados são do dono (host em processo, remotes AGUARDADOS)', () => {
  it('OBSERVAÇÃO: o DONO chama as mesmas escritas e nenhuma é barrada pela ACL (a recusa abaixo não é de payload)', async () => {
    const h = open()
    h.sessionMemberId = 'ana'
    const seen: Record<string, Outcome> = {}
    for (const [name, call] of WRITES) seen[name] = await outcomeOf(h, call)
    expect(Object.values(seen).filter(outcome => outcome === 'forbidden'), JSON.stringify(seen)).toEqual([])
  })

  vitestIt.each([['member', 'bia'], ['guest', 'gus']] as const)('o %s é recusado em TODAS as escritas, inclusive as async', async (role, memberId) => {
    const h = open()
    h.sessionMemberId = memberId
    const rows: Array<{ remote: string; role: string; outcome: Outcome }> = []
    for (const [name, call] of WRITES) rows.push({ remote: name, role, outcome: await outcomeOf(h, call) })
    expect(aclProblems(rows), JSON.stringify(rows)).toEqual([])
  }, 60_000)

  it('um workspace SEM membros não libera a estação nem o navegador da máquina a quem é de outro workspace', async () => {
    const h = open()
    h.createWorkspace({ id: 'vazio', name: 'Vazio', personalProjectId: 'pv' })
    h.sessionMemberId = 'gus' // alguém que não é dono de nada no "vazio"
    const empty = { workspaceId: 'vazio', projectId: 'pv' }
    const rows = [
      { remote: 'setStationRunning (workspace vazio)', role: 'guest', outcome: await outcomeOf(h, hh => hh.setStationRunning({ ...empty, running: false })) },
      { remote: 'createBrowserProfile (workspace vazio)', role: 'guest', outcome: await outcomeOf(h, hh => hh.createBrowserProfile({ ...empty, name: 'Vazio-acl' })) },
      { remote: 'stationView (workspace vazio)', role: 'guest', outcome: await outcomeOf(h, hh => hh.stationView(empty)) },
    ]
    expect(aclProblems(rows), JSON.stringify(rows)).toEqual([])
  })

  it('o pareamento da estação trava com poucos palpites errados (não 2.000 por 10 s), e continua travado', async () => {
    const h = open()
    h.sessionMemberId = 'ana'
    // A guess is locked out in one of two ways, both fine: the guard of the remote refuses it (`rate-limited`) or the pairing book answers "tentativas demais".
    const states: Array<'palpite' | 'travado'> = []
    for (let guess = 0; guess < 25; guess += 1) {
      try {
        const result = h.pairStation({ ...SCOPE, code: `ZZZZ${String(1000 + guess)}` })
        expect(result.ok, 'um palpite errado nunca pareia').toBe(false)
        states.push(/demais|espere uns minutos/u.test(result.line) ? 'travado' : 'palpite')
      } catch (error: unknown) {
        expect(error instanceof Error ? error.message : '', 'o palpite só pode ser barrado por limite de taxa').toMatch(/rate-limited/u)
        states.push('travado')
      }
    }
    const firstLocked = states.indexOf('travado')
    expect(firstLocked, `nenhum bloqueio em 25 palpites: ${states.join(',')}`).toBeGreaterThanOrEqual(0)
    expect(firstLocked, 'o bloqueio tem de vir logo (até o 10º palpite), não depois de 2.000').toBeLessThan(10)
    expect(states.slice(firstLocked).every(state => state === 'travado'), `depois de travar, continua travado: ${states.join(',')}`).toBe(true)
  })
})
