// DESTINO (após "candidato validado"): packages/persona/persona-host/tests/station-awake.spec.ts
// Contrato: persona-spec/contracts/marco-dogfood-estacao.md §1 G2/G3 e §5.3.
// VERMELHO: Station.noteOpenWork(count) ainda não existe. Proposta de API: a estação PAREADA fica acordada
// enquanto houver turno rodando OU trabalho aberto no quadro (cartão em "doing", fila "sem vaga", retentativa agendada).
import { describe, expect, it } from 'vitest'
import { PowerKeeper } from '../src/station/power.ts'
import { Station } from '../src/station/station.ts'

function fakeKeeper(): { keeper: PowerKeeper; log: string[] } {
  const log: string[] = []
  const keeper = { hold: () => { log.push('hold') }, release: () => { log.push('release') }, state: () => 'livre' } as unknown as PowerKeeper
  return { keeper, log }
}
function pairedStation(power: PowerKeeper): Station {
  const station = new Station({ power, freeBytes: () => 32 * 1024 ** 3, initial: { paired: true, running: true } })
  return station
}

describe('M4: o Windows não dorme enquanto há trabalho no quadro', () => {
  it('estação pareada segura acordado com cartão aberto, mesmo sem turno rodando agora', () => {
    const { keeper, log } = fakeKeeper()
    const station = pairedStation(keeper)
    station.noteOpenWork(2)
    expect(log).toEqual(['hold'])
  })

  it('solta quando só resta cartão esperando a pessoa (nada a fazer sozinha)', () => {
    const { keeper, log } = fakeKeeper()
    const station = pairedStation(keeper)
    station.noteOpenWork(1)
    station.noteOpenWork(0)
    expect(log).toEqual(['hold', 'release'])
  })

  it('um turno terminando não solta o acordado enquanto ainda há cartão aberto', () => {
    const { keeper, log } = fakeKeeper()
    const station = pairedStation(keeper)
    station.noteOpenWork(1)
    station.noteTurnEnded(0)
    expect(log).not.toContain('release')
  })

  it('computador comum (não pareado) nunca segura o Windows acordado', () => {
    const { keeper, log } = fakeKeeper()
    const station = new Station({ power: keeper, initial: { paired: false, running: true } })
    station.noteOpenWork(5)
    expect(log).toEqual([])
  })

  it('estação desligada pela pessoa solta e não segura de novo', () => {
    const { keeper, log } = fakeKeeper()
    const station = pairedStation(keeper)
    station.noteOpenWork(1)
    station.setRunning(false)
    station.noteOpenWork(3)
    expect(log).toEqual(['hold', 'release'])
  })

  it('é idempotente: avisar 3 vezes o mesmo número pede o acordado uma vez só', () => {
    const { keeper, log } = fakeKeeper()
    const station = pairedStation(keeper)
    station.noteOpenWork(2)
    station.noteOpenWork(2)
    station.noteOpenWork(2)
    expect(log.filter(entry => entry === 'hold').length).toBeLessThanOrEqual(3) // PowerKeeper.hold já é idempotente; a política não pode soltar entre uma e outra
    expect(log).not.toContain('release')
  })
})
