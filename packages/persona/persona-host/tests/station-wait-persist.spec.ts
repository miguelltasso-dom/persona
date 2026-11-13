// DESTINO: packages/persona/persona-host/tests/station-wait-persist.spec.ts
// Contrato: persona-spec/contracts/marco-dogfood-estacao.md §1 G1. O gate guarda a fila "sem vaga" no disco; o reinício não perde cartão.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { PowerKeeper } from '../src/station/power.ts'
import { Station } from '../src/station/station.ts'
import { StationGate } from '../src/station/station-gate.ts'
import { WAIT_FILE, fileWaitStore } from '../src/station/station-wait-store.ts'

function setup(dir: string, resumed: { count: number }, log: string[] = []): { gate: StationGate; station: Station } {
  const power = { hold: () => { log.push('hold') }, release: () => { log.push('release') }, state: () => 'livre' } as unknown as PowerKeeper
  const station = new Station({ power, freeBytes: () => 32 * 1024 ** 3, initial: { paired: true, running: true } })
  const gate = new StationGate(station, {
    resume: () => { resumed.count += 1; return Promise.resolve(0) },
    store: fileWaitStore(dir),
    schedule: () => 0,
    cancel: () => undefined,
  })
  return { gate, station }
}
const ROW = { projectId: 'pp', ticketId: 't1', assignmentId: 'a1' }

describe('M4/G1: a fila "sem vaga" sobrevive à queda', () => {
  it('o cartão parado volta para a fila depois de reabrir a estação', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wait-'))
    const first = setup(dir, { count: 0 })
    first.gate.waitFor(ROW)
    expect(first.gate.waitingCount()).toBe(1)
    const again = setup(dir, { count: 0 }) // queda: a RAM do gate some
    expect(again.gate.waitingCount()).toBe(1)
    expect(again.gate.takeWaiting()).toEqual([ROW])
  })

  it('quem foi retomado sai do disco: uma 2ª queda não roda o cartão de novo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wait-'))
    const first = setup(dir, { count: 0 })
    first.gate.waitFor(ROW)
    first.gate.takeWaiting()
    expect(setup(dir, { count: 0 }).gate.waitingCount()).toBe(0)
  })

  it('a ordem de chegada é mantida e uma linha repetida não duplica', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wait-'))
    const first = setup(dir, { count: 0 })
    first.gate.waitFor(ROW)
    first.gate.waitFor({ ...ROW, ticketId: 't2', assignmentId: 'a2' })
    first.gate.waitFor(ROW)
    expect(setup(dir, { count: 0 }).gate.takeWaiting().map(row => row.ticketId)).toEqual(['t1', 't2'])
  })

  it('cartão esperando mantém o Windows acordado, e solta quando a fila esvazia', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wait-'))
    const log: string[] = []
    const { gate } = setup(dir, { count: 0 }, log)
    gate.waitFor(ROW)
    expect(log).toContain('hold')
    gate.takeWaiting()
    expect(log.at(-1)).toBe('release')
  })

  it('depois do reinício o cartão esperando já pede o acordado (o Windows não dorme antes de a fila andar)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wait-'))
    setup(dir, { count: 0 }).gate.waitFor(ROW)
    const log: string[] = []
    setup(dir, { count: 0 }, log)
    expect(log).toContain('hold')
  })

  it('arquivo ilegível ou com linhas inválidas vira lista vazia, sem derrubar a estação', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wait-'))
    writeFileSync(join(dir, WAIT_FILE), '{{{ lixo')
    expect(setup(dir, { count: 0 }).gate.waitingCount()).toBe(0)
    writeFileSync(join(dir, WAIT_FILE), JSON.stringify([ROW, { projectId: 1 }, null, 'x']))
    expect(setup(dir, { count: 0 }).gate.takeWaiting()).toEqual([ROW])
  })

  it('o arquivo guarda só identificadores', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wait-'))
    setup(dir, { count: 0 }).gate.waitFor(ROW)
    expect(JSON.parse(readFileSync(join(dir, WAIT_FILE), 'utf8'))).toEqual([ROW])
  })
})
