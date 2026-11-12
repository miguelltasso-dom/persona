import type { StoredPersona } from '@deepseek-ai/dsh-persona-store'
import { describe, expect, it } from 'vitest'
import { memoryDirectory } from '../src/channel-directory.ts'
import { ChannelWire } from '../src/channel-wire.ts'

/** Item 22 (colheita): the host's seam. The orchestration only asks this class; off, or outside a channel, every answer is `undefined`. */
const persona = (id: string, name: string, title: string, systemRoles: string[] = []): StoredPersona =>
  ({ id, name, title, description: '', systemRoles }) as unknown as StoredPersona

const roster = [
  persona('guia', 'Guia', 'Coordenação', ['coordination']),
  persona('bia', 'Bia', 'Redatora de textos'),
  persona('caio', 'Caio', 'Designer de artes'),
  persona('lia', 'Lia', 'Atendimento ao cliente'),
]

const directory = memoryDirectory({
  roster: roster.map(item => item.id),
  teams: [
    { id: 'mkt', name: 'Marketing', personaIds: ['bia', 'caio'] },
    { id: 'atd', name: 'Atendimento', personaIds: ['lia'] },
  ],
  channels: [
    { id: 'geral', name: 'geral', kind: 'general' },
    { id: 'mkt', name: 'marketing', kind: 'team', teamId: 'mkt' },
    { id: 'atd', name: 'atendimento', kind: 'team', teamId: 'atd' },
  ],
})

/** `null` = the layer is off (an explicit `undefined` would fall back to the default directory). */
const wire = (dir: typeof directory | null = directory, paused: readonly string[] = []): ChannelWire =>
  new ChannelWire({ directory: () => dir ?? undefined, personas: () => roster, isPaused: (_project, id) => paused.includes(id) })

const msg = (streamId: string, body: string) => ({ projectId: 'p', streamId, body })

describe('ChannelWire.read', () => {
  it('is undefined when the layer is off, in a DM, and in a channel the directory does not know (the old behavior stands)', () => {
    expect(wire(null).read(msg('channel:mkt', '@Bia oi'))).toBeUndefined()
    expect(wire().read(msg('dm:dm-ana', '@Bia oi'))).toBeUndefined()
    expect(wire().read(msg('channel:nao-existe', '@Bia oi'))).toBeUndefined()
  })

  it('@Marketing in #marketing: the stored personas of the equipe answer, in roster order', () => {
    const reading = wire().read(msg('channel:mkt', '@Marketing preciso da campanha'))!
    expect(reading.named.map(item => item.id)).toEqual(['bia', 'caio'])
    expect(reading.addressing.via).toBe('team')
    expect(reading.members).toEqual(['bia', 'caio'])
    expect(reading.channelName).toBe('marketing')
  })

  it('@equipe in #atendimento calls the equipe of that channel', () => {
    expect(wire().read(msg('channel:atd', '@equipe bom dia'))!.named.map(item => item.id)).toEqual(['lia'])
  })

  it('#geral has everyone: a name there answers', () => {
    const reading = wire().read(msg('channel:geral', '@Lia me ajuda'))!
    expect(reading.named.map(item => item.id)).toEqual(['lia'])
    expect(reading.members).toEqual(['guia', 'bia', 'caio', 'lia'])
  })

  it('a persona named outside the channel is NOT in `named`; nobody is woken', () => {
    const reading = wire().read(msg('channel:mkt', '@Lia me ajuda'))!
    expect(reading.named).toEqual([])
    expect(reading.addressing.outsidePersonas.map(item => item.id)).toEqual(['lia'])
  })

  it('nobody named: `named` is empty and the function route is fenced to the members', () => {
    const reading = wire().read(msg('channel:mkt', 'preciso de um cartaz novo'))!
    expect(reading.named).toEqual([])
    expect(reading.addressing.via).toBe('function')
    expect(reading.addressing.personas.map(item => item.id)).toEqual(['caio'])
  })

  it('reads the pause of each persona (the fan-out decides what to do with it)', () => {
    const reading = wire(directory, ['bia']).read(msg('channel:mkt', '@Marketing oi'))!
    expect(reading.addressing.personas.map(item => [item.id, item.paused])).toEqual([['bia', true], ['caio', false]])
  })
})

describe('ChannelWire.noticesOf', () => {
  it('says who is outside, and offers the equipe\'s own channel for "Ir para #marketing"', () => {
    const w = wire()
    const reading = w.read(msg('channel:atd', '@Marketing preciso de uma arte'))!
    expect(w.noticesOf(reading)).toEqual([{
      kind: 'outside-team',
      text: 'Ninguém de Marketing está em #atendimento.',
      add: { label: 'Pôr Marketing no canal', personaIds: ['bia', 'caio'], teamId: 'mkt' },
      goTo: { label: 'Ir para #marketing', channelId: 'mkt' },
    }])
  })
  it('is empty when nobody named is outside', () => {
    const w = wire()
    expect(w.noticesOf(w.read(msg('channel:mkt', '@Bia oi'))!)).toEqual([])
  })
  it('is empty when the layer is off', () => {
    const w = wire()
    const reading = w.read(msg('channel:mkt', '@Lia oi'))!
    expect(new ChannelWire({ directory: () => undefined, personas: () => roster, isPaused: () => false }).noticesOf(reading)).toEqual([])
  })
})
