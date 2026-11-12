import { describe, expect, it } from 'vitest'
import { RAM_FLOOR_BYTES, RAM_PER_CLI_BYTES } from '../src/station/admission.ts'
import { PairingBook } from '../src/station/pairing.ts'
import { PowerKeeper } from '../src/station/power.ts'
import { Station } from '../src/station/station.ts'

const TAILSCALE = { state: 'ativo', address: '100.64.0.1', line: 'O Tailscale está ligado neste computador.' } as const

function station(freeBytes: number, extra: Partial<ConstructorParameters<typeof Station>[0]> = {}): Station {
  return new Station({
    pairing: new PairingBook({ pick: () => 'A' }),
    // A keeper that never starts a process: the state is what the station reports.
    power: new PowerKeeper({ platform: 'linux' }),
    freeBytes: () => freeBytes,
    tailscale: async () => TAILSCALE,
    ...extra,
  })
}

describe('COLHEITA 24: the station as one object', () => {
  it('pairs with the code, and the screen says so', async () => {
    const machine = station(32 * 1024 ** 3)
    expect((await machine.view()).paired).toBe(false)
    const code = machine.issueCode()
    expect(machine.redeem(code.code)).toBe('ok')
    expect((await machine.view()).paired).toBe(true)
  })

  it('admits a turn by RAM and reports the floor, the cost of a CLI and the queue', async () => {
    const machine = station(RAM_FLOOR_BYTES + RAM_PER_CLI_BYTES * 2, { queue: () => 1 })
    expect(machine.admitTurn()).toEqual({ ok: true, evict: [] })
    const view = await machine.view()
    expect(view).toMatchObject({
      running: true,
      queue: 1,
      ram: { floorBytes: RAM_FLOOR_BYTES, perCliBytes: RAM_PER_CLI_BYTES },
      tailscale: TAILSCALE,
    })
  })

  it('a station that is off accepts nothing, and turning it off lets Windows sleep', async () => {
    const machine = station(32 * 1024 ** 3)
    machine.setRunning(false)
    expect(machine.admitTurn()).toEqual({ ok: false, reason: 'sem-vaga', evict: [] })
    expect((await machine.view()).running).toBe(false)
  })

  it('a low machine says "sem vaga" instead of failing the turn', async () => {
    const machine = station(200 * 1024 ** 2)
    expect(machine.admitTurn()).toMatchObject({ ok: false, reason: 'sem-vaga' })
  })
})
