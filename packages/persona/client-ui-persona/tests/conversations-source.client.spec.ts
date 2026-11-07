// @vitest-environment jsdom
// CV-1: de onde a barra única tira Canais e Pessoas: o mapeador puro, a equipe (setor do organograma) de cada persona e o
// observável estável que o PersonaSidebar assina.
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import { describe, expect, it, vi } from 'vitest'
import {
  EMPTY_CONVERSATIONS,
  createConversationsObservable,
  createRosterChangeSubscriber,
  createSectorsObservable,
  mapConversationsSource,
  sectorsFromOrgChart,
  type SectorByPersonaId,
  type SectorsRemote,
  type SectorsSource,
} from '../src/client/shell/conversations-source.ts'
import type { RailPersona } from '../src/client/shell/RailTeam.tsx'
import type { PersonaLiveStore } from '../src/client/remote/persona-live-store.ts'

const rail = (id: string, over: Partial<RailPersona> = {}): RailPersona => ({
  id,
  characterId: id,
  name: id.charAt(0).toUpperCase() + id.slice(1),
  role: 'Engenharia',
  state: 'resting',
  unread: 0,
  ...over,
})

describe('mapConversationsSource', () => {
  const base = {
    channelId: 'ch-geral',
    generalName: 'geral',
    sectorByPersonaId: { nina: { id: 's1', title: 'Estudos' } } as SectorByPersonaId,
  }

  it('quem já tem DM ganha a posição da DM (a ordem do host); quem não tem fica sem posição', () => {
    const source = mapConversationsSource({
      ...base,
      rail: [rail('luna'), rail('nina'), rail('bento')],
      dms: [{ id: 'd1', peerId: 'bento' }, { id: 'd2', peerId: 'nina' }],
    })
    const byId = Object.fromEntries(source.people.map(p => [p.id, p]))
    expect(byId.bento).toMatchObject({ hasConversation: true, recentRank: 0 })
    expect(byId.nina).toMatchObject({ hasConversation: true, recentRank: 1 })
    expect(byId.luna?.hasConversation).toBe(false)
    expect(byId.luna?.recentRank).toBeUndefined()
  })

  it('leva função, retrato, estado e não lidas da faixa da equipe; a equipe vem do organograma', () => {
    const source = mapConversationsSource({ ...base, rail: [rail('nina', { role: 'Pesquisa', unread: 3, state: 'working' })], dms: [] })
    expect(source.people[0]).toMatchObject({ role: 'Pesquisa', unread: 3, state: 'working', characterId: 'nina', teamId: 's1', teamName: 'Estudos' })
  })

  it('quem o organograma não conhece fica sem equipe (nunca um nome inventado)', () => {
    const source = mapConversationsSource({ ...base, rail: [rail('luna')], dms: [] })
    expect(source.people[0]).toMatchObject({ teamId: null, teamName: null })
  })

  it('duas DMs com a mesma pessoa: vale a primeira (a mais recente)', () => {
    const source = mapConversationsSource({ ...base, rail: [rail('nina')], dms: [{ id: 'd1', peerId: 'nina' }, { id: 'd2', peerId: 'nina' }] })
    expect(source.people[0]?.recentRank).toBe(0)
  })

  it('o canal geral só existe quando o host já disse o id; sem linha de não lidas inventada', () => {
    expect(mapConversationsSource({ ...base, rail: [], dms: [] }).channels).toEqual([{ id: 'ch-geral', name: 'geral', unread: 0 }])
    expect(mapConversationsSource({ ...base, channelId: null, rail: [], dms: [] }).channels).toEqual([])
    expect(mapConversationsSource({ ...base, channelId: '', rail: [], dms: [] }).channels).toEqual([])
  })
})

describe('sectorsFromOrgChart', () => {
  it('só os grupos de setor; pessoas penduradas num setor ganham aquele setor', () => {
    const view = {
      groups: [
        { id: 'owner', title: 'Você', kind: 'person', members: [{ id: 'atlas' }] },
        { id: 's1', title: 'Marketing', kind: 'sector', members: [{ id: 'nina' }, { id: 'sol' }] },
        { id: 's2', title: 'Engenharia', kind: 'sector', members: [{ id: 'bento' }] },
      ],
    }
    expect(sectorsFromOrgChart(view)).toEqual({
      nina: { id: 's1', title: 'Marketing' },
      sol: { id: 's1', title: 'Marketing' },
      bento: { id: 's2', title: 'Engenharia' },
    })
  })

  it('a primeira equipe vence se a persona aparece em duas; lixo é ignorado sem lançar', () => {
    const view = {
      groups: [
        { id: 's1', title: 'A', kind: 'sector', members: [{ id: 'nina' }] },
        { id: 's2', title: 'B', kind: 'sector', members: [{ id: 'nina' }] },
        null,
        { id: 3, title: 'X', kind: 'sector', members: [] },
        { id: 's4', title: 'Y', kind: 'sector', members: 'não é lista' },
      ],
    }
    expect(sectorsFromOrgChart(view)).toEqual({ nina: { id: 's1', title: 'A' } })
    expect(sectorsFromOrgChart(null)).toEqual({})
    expect(sectorsFromOrgChart({ groups: 'x' })).toEqual({})
  })
})

describe('createSectorsObservable', () => {
  const chart = { groups: [{ id: 's1', title: 'Marketing', kind: 'sector', members: [{ id: 'nina' }] }] }

  function setup(over: Partial<SectorsSource> & { getOrgChart?: ReturnType<typeof vi.fn> } = {}) {
    const getOrgChart = over.getOrgChart ?? vi.fn(() => Promise.resolve(chart))
    let notify: (() => void) | undefined
    const source: SectorsSource = {
      remote: over.remote ?? ({ getOrgChart } as SectorsRemote),
      workspaceId: over.workspaceId ?? (() => 'ws1'),
      subscribeChange: (listener) => { notify = listener; return () => { notify = undefined } },
    }
    const observable = createSectorsObservable(source)
    return { observable, getOrgChart, change: () => { notify?.() }, hasListener: () => notify !== undefined }
  }

  it('só consulta o host quando alguém assina, e publica a equipe de cada persona', async () => {
    const { observable, getOrgChart } = setup()
    expect(getOrgChart).not.toHaveBeenCalled()
    const listener = vi.fn()
    observable.subscribe(listener)
    await vi.waitFor(() => { expect(listener).toHaveBeenCalled() })
    expect(getOrgChart).toHaveBeenCalledWith({ workspaceId: 'ws1', groupBy: 'sector' })
    expect(observable.getSnapshot()).toEqual({ nina: { id: 's1', title: 'Marketing' } })
  })

  it('lê de novo quando o elenco muda; o mesmo resultado não acorda ninguém', async () => {
    const { observable, getOrgChart, change } = setup()
    const listener = vi.fn()
    observable.subscribe(listener)
    await vi.waitFor(() => { expect(listener).toHaveBeenCalledTimes(1) })
    change()
    await vi.waitFor(() => { expect(getOrgChart).toHaveBeenCalledTimes(2) })
    await Promise.resolve()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('sem tenant ainda ou host antigo (sem getOrgChart) ou erro: fica sem equipes, sem lançar', async () => {
    const noTenant = setup({ workspaceId: () => null })
    noTenant.observable.subscribe(() => {})
    const oldHost = setup({ remote: {} })
    oldHost.observable.subscribe(() => {})
    const failing = setup({ getOrgChart: vi.fn(() => Promise.reject(new Error('host ocupado'))) })
    failing.observable.subscribe(() => {})
    await Promise.resolve()
    await Promise.resolve()
    expect(noTenant.getOrgChart).not.toHaveBeenCalled()
    expect(noTenant.observable.getSnapshot()).toEqual({})
    expect(oldHost.observable.getSnapshot()).toEqual({})
    expect(failing.observable.getSnapshot()).toEqual({})
  })

  it('quando o último assinante sai, solta a assinatura', () => {
    const { observable, hasListener } = setup()
    const off = observable.subscribe(() => {})
    expect(hasListener()).toBe(true)
    off()
    expect(hasListener()).toBe(false)
  })
})

describe('createConversationsObservable', () => {
  function fakeLive(initial: object): { live: PersonaLiveStore; set: (next: object) => void } {
    let snap = initial
    const listeners = new Set<() => void>()
    const live = {
      observable: {
        getSnapshot: () => snap,
        subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
      },
    } as unknown as PersonaLiveStore
    return { live, set: (next) => { snap = next; for (const listener of [...listeners]) listener() } }
  }
  const constant = <T>(value: T): HostObservable<T> => ({ getSnapshot: () => value, subscribe: () => () => {} })

  it('junta equipe, DMs e canal; e o snapshot NÃO muda quando só o resto do live muda (sem re-render à toa)', () => {
    const team = [rail('nina'), rail('luna')]
    const { live, set } = fakeLive({ tenant: { channelId: 'ch' }, dms: [{ id: 'd1', peerId: 'nina' }], messages: [] })
    const observable = createConversationsObservable({ live, railTeam: constant(team), sectors: constant({}), generalName: () => 'geral' })
    const first = observable.getSnapshot()
    expect(first.channels).toEqual([{ id: 'ch', name: 'geral', unread: 0 }])
    expect(first.people.map(p => p.id)).toEqual(['nina', 'luna'])
    expect(first.people[0]?.hasConversation).toBe(true)
    // uma mensagem nova no canal troca o snapshot do live, mas a barra não mostra nada diferente
    set({ tenant: { channelId: 'ch' }, dms: [{ id: 'd1', peerId: 'nina' }], messages: [{ id: 'm1' }] })
    expect(observable.getSnapshot()).toBe(first)
    // uma DM nova muda o que a barra mostra
    set({ tenant: { channelId: 'ch' }, dms: [{ id: 'd2', peerId: 'luna' }, { id: 'd1', peerId: 'nina' }], messages: [] })
    const second = observable.getSnapshot()
    expect(second).not.toBe(first)
    expect(second.people.find(p => p.id === 'luna')?.recentRank).toBe(0)
  })

  it('antes de qualquer coisa o snapshot é o vazio estável', () => {
    const { live } = fakeLive({ tenant: null, dms: [], messages: [] })
    const observable = createConversationsObservable({ live, railTeam: constant([]), sectors: constant({}), generalName: () => 'geral' })
    expect(observable.getSnapshot()).toEqual(EMPTY_CONVERSATIONS)
  })

  it('assina as três fontes e solta todas', () => {
    const { live } = fakeLive({ tenant: null, dms: [] })
    const subscribed = vi.fn(() => vi.fn())
    const railTeam: HostObservable<readonly RailPersona[]> = { getSnapshot: () => [], subscribe: subscribed }
    const sectors: HostObservable<SectorByPersonaId> = { getSnapshot: () => ({}), subscribe: subscribed }
    const off = createConversationsObservable({ live, railTeam, sectors, generalName: () => 'geral' }).subscribe(() => {})
    expect(subscribed).toHaveBeenCalledTimes(2)
    off()
  })
})

describe('createRosterChangeSubscriber', () => {
  function fakeLive(initial: object) {
    let snap = initial
    const listeners = new Set<() => void>()
    const live = {
      observable: {
        getSnapshot: () => snap,
        subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
      },
    } as unknown as PersonaLiveStore
    return { live, set: (next: object) => { snap = next; for (const listener of [...listeners]) listener() }, count: () => listeners.size }
  }

  it('avisa quando o tenant aparece e quando o elenco muda; mensagem nova no live não avisa', () => {
    const { live, set } = fakeLive({ tenant: null, team: null })
    const onChange = vi.fn()
    createRosterChangeSubscriber(live)(onChange)
    set({ tenant: { workspaceId: 'ws' }, team: { personas: [{ id: 'a' }] } })
    expect(onChange).toHaveBeenCalledTimes(1)
    set({ tenant: { workspaceId: 'ws' }, team: { personas: [{ id: 'a' }] }, messages: [{ id: 'm1' }] })
    expect(onChange).toHaveBeenCalledTimes(1)
    set({ tenant: { workspaceId: 'ws' }, team: { personas: [{ id: 'a' }, { id: 'b' }] } })
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('soltar a assinatura solta o live', () => {
    const { live, count } = fakeLive({ tenant: null, team: null })
    const off = createRosterChangeSubscriber(live)(() => {})
    expect(count()).toBe(1)
    off()
    expect(count()).toBe(0)
  })
})
