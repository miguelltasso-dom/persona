// Vocabulário único de estado (Muse regra 0.2) — o host já manda `paused` ("Pausada") e `quiet` ("Descansando") em PersonaNowView e em
// PersonaView, SÓ quando true; ausente = acordada (Bolt, contrato house-rules). O cliente copia exatamente isso para o membro da faixa e o
// resto (rail, cartões, DM, organograma) lê do mesmo lugar: nunca inventa `false`, e se os dois vêm, "Pausada" vence "Descansando".
import { describe, expect, it } from 'vitest'
import type { PersonaNowView } from '@deepseek-ai/dsh-persona-host/types'
import { mapPersonaNowRow, mapTeamToStrip } from '../src/client/remote/map-host-ui.ts'
import type { TeamView } from '../src/client/remote/persona-remote-types.ts'
import { personaStateOf } from '../src/client/team/persona-state.ts'

const persona = (patch: Record<string, unknown> = {}) => ({
  id: 'p-bento', name: 'Bento', title: 'Engenharia', workspaceId: 'ws', projectId: 'pp', description: '', avatarKind: 'gallery', avatarRef: 'bento', systemRoles: [], canRecruit: false, ...patch,
})
const teamOf = (patch: Record<string, unknown> = {}): TeamView => ({ members: [], personas: [persona(patch)] }) as unknown as TeamView

const nowRow = (patch: Partial<PersonaNowView> = {}): PersonaNowView => ({
  personaId: 'p-bento', name: 'Bento', title: 'Engenharia', state: 'resting', currentTask: '', currentTaskId: '', queueCount: 0, idleMinutes: 0, deliveriesToday: 0, proposalsAcceptedToday: 0, ...patch,
})

describe('paused/quiet do host viram o membro (mapPersonaNowRow)', () => {
  it('ausente = acordada: o membro não leva as chaves (nem `false`)', () => {
    const { member } = mapPersonaNowRow(nowRow(), teamOf())
    expect('paused' in member).toBe(false)
    expect('quiet' in member).toBe(false)
    expect(personaStateOf(member)).toBe('available')
  })

  it('quiet na linha do "Agora": Descansando', () => {
    const { member } = mapPersonaNowRow(nowRow({ quiet: true }), teamOf())
    expect(member.quiet).toBe(true)
    expect('paused' in member).toBe(false)
    expect(personaStateOf(member)).toBe('resting')
  })

  it('paused na linha do "Agora": Pausada', () => {
    const { member } = mapPersonaNowRow(nowRow({ paused: true }), teamOf())
    expect(member.paused).toBe(true)
    expect(personaStateOf(member)).toBe('paused')
  })

  it('pausada dentro da janela traz os dois e "Pausada" vence', () => {
    const { member } = mapPersonaNowRow(nowRow({ paused: true, quiet: true }), teamOf())
    expect(member).toMatchObject({ paused: true, quiet: true })
    expect(personaStateOf(member)).toBe('paused')
  })

  it('o fato também vale quando só o PersonaView o traz (o mesmo fato nas duas fontes)', () => {
    expect(mapPersonaNowRow(nowRow(), teamOf({ paused: true })).member.paused).toBe(true)
    expect(mapPersonaNowRow(nowRow(), teamOf({ quiet: true })).member.quiet).toBe(true)
  })

  it('persona fora do roster (só a linha do host): o fato vem da linha', () => {
    const { member } = mapPersonaNowRow(nowRow({ personaId: 'p-solta', quiet: true }), { members: [], personas: [] } as unknown as TeamView)
    expect(member.quiet).toBe(true)
  })

  it('trabalhando de verdade ganha de "descansando": quiet não derruba quem está com a mão na massa', () => {
    const { member } = mapPersonaNowRow(nowRow({ state: 'working', quiet: true }), teamOf())
    expect(personaStateOf(member)).toBe('working')
  })
})

describe('o roster sem linha do "Agora" (mapTeamToStrip)', () => {
  it('a persona do roster pausada ou em silêncio leva o fato mesmo sem a linha do host', () => {
    const [paused] = mapTeamToStrip(teamOf({ paused: true }), [])
    expect(paused?.paused).toBe(true)
    expect(personaStateOf(paused as never)).toBe('paused')
    const [quiet] = mapTeamToStrip(teamOf({ quiet: true }), [])
    expect(quiet?.quiet).toBe(true)
    expect(personaStateOf(quiet as never)).toBe('resting')
  })

  it('sem o fato do host: Disponível (sem janela de silêncio) e as chaves ausentes', () => {
    const [member] = mapTeamToStrip(teamOf(), [])
    expect(member && 'paused' in member).toBe(false)
    expect(member && 'quiet' in member).toBe(false)
    expect(personaStateOf(member as never)).toBe('available')
  })
})
