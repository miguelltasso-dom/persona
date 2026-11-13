import { describe, expect, it } from 'vitest'
import { RAM_FLOOR_BYTES, RAM_PER_CLI_BYTES } from '../src/station/admission.ts'
import { ComputerPresence, HEARTBEAT_STALE_MS, type Beat, type PresenceRecord, type RosterComputer } from '../src/station/computer-presence.ts'

const GB = 1024 ** 3
const PADARIA: RosterComputer = { computerId: 'pc-padaria', label: 'PC da padaria', registeredBy: 'dono', isThis: false }
const DONO: RosterComputer = { computerId: 'pc-dono', label: 'PC do dono', registeredBy: 'dono', isThis: true }

function setup(options: { roster?: RosterComputer[]; personas?: Record<string, number>; saved?: Record<string, PresenceRecord> | undefined } = {}) {
  const clock = { now: 1_000_000 }
  const roster = { current: options.roster ?? [DONO, PADARIA] }
  let saved: Record<string, PresenceRecord> | undefined = options.saved
  const presence = new ComputerPresence({
    now: () => clock.now,
    roster: () => roster.current,
    ...(options.personas === undefined ? {} : { personasOn: (id: string) => options.personas?.[id] ?? 0 }),
    load: () => saved ?? {},
    save: (records) => { saved = { ...records } },
  })
  return { presence, clock, roster, saved: () => saved }
}
const beat = (counter: number, extra: Partial<Beat> = {}): Beat => ({ counter, running: true, ram: { totalBytes: 16 * GB, freeBytes: 8 * GB }, personaCount: 2, queue: 0, aiAccountLabel: 'Claude · conta da Ana', ...extra })

describe('M4/D-116: presença dos computadores do roster do Bolt', () => {
  it('ligado até 90 s, desligado depois, pausado quando a pessoa desligou a Estação', () => {
    const s = setup()
    expect(s.presence.stateOf('pc-padaria')).toBe('desligado') // nunca visto
    expect(s.presence.heartbeat('pc-padaria', beat(1))).toBe('ok')
    expect(s.presence.stateOf('pc-padaria')).toBe('ligado')
    s.clock.now += HEARTBEAT_STALE_MS
    expect(s.presence.stateOf('pc-padaria')).toBe('ligado') // exatamente 90 s ainda vale
    s.clock.now += 1
    expect(s.presence.stateOf('pc-padaria')).toBe('desligado')
    expect(s.presence.heartbeat('pc-padaria', beat(2, { running: false }))).toBe('ok')
    expect(s.presence.stateOf('pc-padaria')).toBe('pausado')
  })

  it('batimento repetido ou mais velho é recusado', () => {
    const s = setup()
    expect(s.presence.heartbeat('pc-padaria', beat(5))).toBe('ok')
    expect(s.presence.heartbeat('pc-padaria', beat(5))).toBe('repetido')
    expect(s.presence.heartbeat('pc-padaria', beat(4))).toBe('repetido')
    expect(s.presence.heartbeat('pc-padaria', beat(6))).toBe('ok')
  })

  it('computador fora do roster (nunca cadastrado ou revogado) recebe "revogado" e some da lista', () => {
    const s = setup()
    expect(s.presence.heartbeat('desconhecido', beat(1))).toBe('revogado')
    s.presence.heartbeat('pc-padaria', beat(1))
    s.roster.current = [DONO] // o Bolt revogou
    expect(s.presence.heartbeat('pc-padaria', beat(2))).toBe('revogado')
    expect(s.presence.stateOf('pc-padaria')).toBe('desligado')
    expect(s.presence.list().map(item => item.computerId)).toEqual(['pc-dono'])
    expect(JSON.stringify(s.saved())).not.toContain('pc-padaria') // o registro dele foi esquecido
  })

  it('um computador revogado que volta é outra identidade: não herda o batimento antigo', () => {
    const s = setup()
    s.presence.heartbeat('pc-padaria', beat(9))
    s.roster.current = [DONO]
    s.presence.heartbeat('pc-padaria', beat(10))
    s.roster.current = [DONO, { ...PADARIA }]
    expect(s.presence.stateOf('pc-padaria')).toBe('desligado')
    expect(s.presence.heartbeat('pc-padaria', beat(1))).toBe('ok')
  })

  it('capacidade por RAM: quantos turnos a mais cabem', () => {
    const s = setup()
    s.presence.heartbeat('pc-padaria', beat(1, { ram: { totalBytes: 16 * GB, freeBytes: RAM_FLOOR_BYTES + RAM_PER_CLI_BYTES * 3 + 5 } }))
    expect(s.presence.list().find(item => item.computerId === 'pc-padaria')?.capacity).toBe(3)
    s.presence.heartbeat('pc-padaria', beat(2, { ram: { totalBytes: 16 * GB, freeBytes: 100 } }))
    expect(s.presence.list().find(item => item.computerId === 'pc-padaria')?.capacity).toBe(0)
  })

  it('n de personas: a do Flint quando existe, senão a do batimento', () => {
    const flint = setup({ personas: { 'pc-padaria': 4 } })
    flint.presence.heartbeat('pc-padaria', beat(1, { personaCount: 1 }))
    expect(flint.presence.list().find(item => item.computerId === 'pc-padaria')?.personas).toBe(4)
    const beating = setup()
    beating.presence.heartbeat('pc-padaria', beat(1, { personaCount: 1 }))
    expect(beating.presence.list().find(item => item.computerId === 'pc-padaria')?.personas).toBe(1)
  })

  it('só os campos declarados chegam à tela e ao disco: o que o remetente acrescenta é descartado', () => {
    const s = setup()
    s.presence.heartbeat('pc-padaria', { ...beat(1), token: 'sk-segredo', apiKey: 'xyz' } as Beat)
    const json = JSON.stringify(s.presence.list()) + JSON.stringify(s.saved())
    expect(json).not.toContain('sk-segredo')
    expect(json).not.toContain('xyz')
    expect(json).toContain('Claude · conta da Ana')
  })

  it('a lista segue a ordem do roster e traz quem cadastrou e qual é este computador', () => {
    const s = setup()
    const rows = s.presence.list()
    expect(rows.map(item => [item.computerId, item.isThis, item.registeredBy])).toEqual([['pc-dono', true, 'dono'], ['pc-padaria', false, 'dono']])
    expect(s.presence.computersOf()).toEqual(['pc-dono', 'pc-padaria'])
  })

  it('o último batimento sobrevive ao reinício do host do dono, mas ninguém finge "ligado"', () => {
    const first = setup()
    first.presence.heartbeat('pc-padaria', beat(1))
    const second = setup({ saved: first.saved() })
    second.clock.now += 5 * 60_000
    const row = second.presence.list().find(item => item.computerId === 'pc-padaria')
    expect(row?.state).toBe('desligado')
    expect(row?.lastSeenAt).toBe(first.clock.now) // "visto pela última vez às…"
  })
})
