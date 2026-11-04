// @vitest-environment jsdom
// SW-7 (SIMPLE-WORKSPACE-SPEC §2): "Trabalhando num rascunho" na faixa da equipe e na linha "Agora" do cartão.
// O dado vem do host (PersonaNowView.draftFiles, só com state==='working' e >= 1 arquivo mudado); o cliente nunca o inventa.
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PersonaNowView } from '@deepseek-ai/dsh-persona-host/types'
import { mapPersonaNowRow } from '../src/client/remote/map-host-ui.ts'
import { createPersonaCardBridge } from '../src/client/remote/persona-card-bridge.ts'
import type { PersonaLiveSnapshot, PersonaLiveStore } from '../src/client/remote/persona-live-store.ts'
import type { TeamView } from '../src/client/remote/persona-remote-types.ts'
import { personaCardFacts, type PersonaCardInfo } from '../src/client/profile/PersonaInfoCard.tsx'
import { TeamChannelStrip } from '../src/client/team/TeamChannelStrip.tsx'
import type { ChannelPersonaMember } from '../src/client/team/persona-work-state.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { pt as profilePt } from '../src/client/locale/profile/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
afterEach(() => { cleanup() })

const shellT = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(shellPt, key, params)) as never

const TEAM = {
  members: [],
  personas: [
    { id: 'p-bento', name: 'Bento', title: 'Engenharia', workspaceId: 'ws', projectId: 'pp', description: '', avatarKind: 'gallery', avatarRef: 'bento', systemRoles: [], canRecruit: false },
  ],
} as unknown as TeamView

const nowRow = (patch: Partial<PersonaNowView> = {}): PersonaNowView => ({
  personaId: 'p-bento',
  name: 'Bento',
  title: 'Engenharia',
  state: 'working',
  currentTask: 'Atualizar o cardápio',
  currentTaskId: 't1',
  queueCount: 0,
  idleMinutes: 0,
  deliveriesToday: 0,
  proposalsAcceptedToday: 0,
  ...patch,
})

describe('mapeamento do host', () => {
  it('trabalhando com arquivos mudados no rascunho: o membro leva a contagem', () => {
    expect(mapPersonaNowRow(nowRow({ draftFiles: 3 }), TEAM).member.draftFiles).toBe(3)
    expect(mapPersonaNowRow(nowRow({ draftFiles: 2.9 }), TEAM).member.draftFiles).toBe(2)
  })

  it('sem rascunho de verdade não há estado de rascunho: ausente, 0, negativo, NaN e parado', () => {
    expect(mapPersonaNowRow(nowRow(), TEAM).member.draftFiles).toBeUndefined()
    expect(mapPersonaNowRow(nowRow({ draftFiles: 0 }), TEAM).member.draftFiles).toBeUndefined()
    expect(mapPersonaNowRow(nowRow({ draftFiles: -2 }), TEAM).member.draftFiles).toBeUndefined()
    expect(mapPersonaNowRow(nowRow({ draftFiles: Number.NaN }), TEAM).member.draftFiles).toBeUndefined()
    expect(mapPersonaNowRow(nowRow({ state: 'resting', draftFiles: 3 }), TEAM).member.draftFiles).toBeUndefined()
  })
})

describe('faixa da equipe', () => {
  const member = (patch: Partial<ChannelPersonaMember> = {}): ChannelPersonaMember => ({ id: 'bento', name: 'Bento', role: 'Engenharia', state: 'working', ...patch })

  it('num rascunho: a 2ª linha é "Num rascunho" e o leitor de tela ouve "Trabalhando num rascunho"', () => {
    const { container } = render(<TeamChannelStrip t={shellT} members={[member({ draftFiles: 3 })]} />)
    expect(screen.getByText('Num rascunho')).toBeTruthy()
    expect(screen.getByText('Trabalhando num rascunho')).toBeTruthy()
    expect(screen.queryByText('Trabalhando')).toBeNull()
    expect(container.querySelector('[data-draft]')).not.toBeNull()
    expect(container.querySelector('[data-state="draft"]')).not.toBeNull() // ponto brand: o estado não é só cor (tem o texto)
  })

  it('tarefa sem arquivos (resposta, pesquisa) continua só "Trabalhando"', () => {
    const { container } = render(<TeamChannelStrip t={shellT} members={[member()]} />)
    expect(screen.getByText('Trabalhando')).toBeTruthy()
    expect(screen.queryByText('Num rascunho')).toBeNull()
    expect(container.querySelector('[data-draft]')).toBeNull()
  })

  it('rascunho de quem não está trabalhando não aparece (o dado só vale com state working)', () => {
    render(<TeamChannelStrip t={shellT} members={[member({ state: 'resting', draftFiles: 3 })]} />)
    expect(screen.queryByText('Num rascunho')).toBeNull()
  })
})

describe('cartão da persona — linha "Agora"', () => {
  const info = (patch: Partial<PersonaCardInfo> = {}): PersonaCardInfo => ({
    personaId: 'p-bento',
    name: 'Bento',
    role: 'Engenharia',
    systemRoles: [],
    nowKind: 'working',
    nowText: 'Trabalhando na tarefa',
    presence: 'online',
    ...patch,
  })
  const nowText = (value: PersonaCardInfo): string | undefined => personaCardFacts(profilePt as never, value).now?.text

  it('plural e singular, com a promessa de que a pasta não muda', () => {
    expect(nowText(info({ draftFiles: 3 }))).toBe('Bento está mudando 3 arquivos num rascunho. Nada muda na sua pasta até você aplicar.')
    expect(nowText(info({ draftFiles: 1 }))).toBe('Bento está mudando 1 arquivo num rascunho. Nada muda na sua pasta até você aplicar.')
  })

  it('sem rascunho (ou sem estar trabalhando) fica a frase do host', () => {
    expect(nowText(info())).toBe('Trabalhando na tarefa')
    expect(nowText(info({ draftFiles: 0 }))).toBe('Trabalhando na tarefa')
    expect(nowText(info({ nowKind: 'idle', draftFiles: 3 }))).toBe('Trabalhando na tarefa')
  })
})

describe('ponte do cartão com o live', () => {
  function liveWith(files: number | undefined) {
    const snapshot = {
      tenant: { workspaceId: 'ws', projectId: 'pp', channelId: 'geral', memberId: 'm1' },
      team: TEAM,
      stripMembers: [{ id: 'bento', name: 'Bento', role: 'Engenharia', state: 'working', ...(files === undefined ? {} : { draftFiles: files }) }],
    } as unknown as PersonaLiveSnapshot
    const store = createSnapshotStore(snapshot)
    const live = { observable: { getSnapshot: () => store.getSnapshot(), subscribe: (l: () => void) => store.subscribe(l) }, refresh: vi.fn() } as unknown as PersonaLiveStore
    return { live, set: (next: number | undefined) => { store.set({ ...store.getSnapshot(), stripMembers: [{ id: 'bento', name: 'Bento', role: 'Engenharia', state: 'working', ...(next === undefined ? {} : { draftFiles: next }) }] } as unknown as PersonaLiveSnapshot) } }
  }
  const client = {
    getPersonaCard: async () => ({
      ok: true,
      value: {
        personaId: 'p-bento', handle: 'bento', name: 'Bento', title: 'Engenharia', systemRoles: [], nowKind: 'idle', nowText: 'Disponível',
        presence: { online: true, lastActiveAt: '2026-11-04T12:00:00.000Z' }, engine: { runnerLabel: 'Claude', modelLabel: 'Sonnet' },
      },
    }),
  } as never

  it('o cartão já carregado ganha o rascunho quando o live o informa, e avisa a tela (revisão sobe)', async () => {
    const { live, set } = liveWith(undefined)
    const bridge = createPersonaCardBridge(client, live)
    bridge.prefetch('p-bento')
    await vi.waitFor(() => { expect(bridge.cardInfo('p-bento')).toBeDefined() })
    expect(bridge.cardInfo('p-bento')?.draftFiles).toBeUndefined()
    const before = bridge.revision.getSnapshot().n
    await act(async () => { set(4) })
    const card = bridge.cardInfo('p-bento')
    expect(card?.draftFiles).toBe(4)
    expect(card?.nowKind).toBe('working')
    expect(bridge.revision.getSnapshot().n).toBeGreaterThan(before)
  })
})
