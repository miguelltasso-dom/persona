// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PersonaInfoCard, type PersonaCardInfo } from '../src/client/profile/PersonaInfoCard.tsx'
import { createPersonaCardBridge } from '../src/client/remote/persona-card-bridge.ts'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { PersonaLiveSnapshot, PersonaLiveStore } from '../src/client/remote/persona-live-store.ts'

afterEach(() => { cleanup() })

const NINA: PersonaCardInfo = {
  personaId: 'nina',
  name: 'Nina',
  handle: '@nina',
  role: 'Pesquisa',
  characterId: 'nina',
  systemRoles: [],
  nowKind: 'idle',
  presence: 'online',
}

describe('"O que {persona} pode fazer" no cartão (UX-PHASE §10)', () => {
  it('sem dado de autonomia/capacidades a seção nem aparece (nada de "Ferramentas: Só conversa" inventado)', () => {
    render(<PersonaInfoCard info={NINA} />)
    expect(screen.queryByRole('region', { name: 'O que pode fazer' })).toBeNull()
  })

  it('mostra a autonomia em palavras da pessoa e "Ajustar" abre o editor', () => {
    const onEdit = vi.fn()
    render(<PersonaInfoCard info={{ ...NINA, autonomyLevel: 'on-request' }} onEdit={onEdit} />)
    const section = screen.getByRole('region', { name: 'O que pode fazer' })
    expect(within(section).getByText('Autonomia')).toBeTruthy()
    expect(within(section).getByText('Sempre pergunta')).toBeTruthy()
    fireEvent.click(within(section).getByRole('button', { name: 'Ajustar' }))
    expect(onEdit).toHaveBeenCalledTimes(1)
  })

  it('cada nível tem seu texto; sem editor disponível não há link "Ajustar" morto', () => {
    const { rerender } = render(<PersonaInfoCard info={{ ...NINA, autonomyLevel: 'act-within-limits' }} />)
    expect(screen.getByText('Decide o rotineiro')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Ajustar' })).toBeNull()
    rerender(<PersonaInfoCard info={{ ...NINA, autonomyLevel: 'propose' }} />)
    expect(screen.getByText('Sugere e espera')).toBeTruthy()
  })

  it('ferramentas, alcance e permissões vêm de capabilities (até 4 chips + "+n"; 0 permissões some)', () => {
    const onOpenPermissions = vi.fn()
    render(
      <PersonaInfoCard
        info={{
          ...NINA,
          autonomyLevel: 'propose',
          capabilities: {
            tools: ['Ler arquivos', 'Rodar comandos', 'Navegar', 'Enviar e-mail', 'Agenda', 'Planilhas'],
            scope: 'Projeto Site',
            permissionsCount: 3,
            onOpenPermissions,
          },
        }}
      />,
    )
    const section = screen.getByRole('region', { name: 'O que pode fazer' })
    expect(within(section).getByText('Ler arquivos')).toBeTruthy()
    expect(within(section).getByText('+2')).toBeTruthy()
    expect(within(section).getByText('Projeto Site')).toBeTruthy()
    fireEvent.click(within(section).getByRole('button', { name: '3 ativas' }))
    expect(onOpenPermissions).toHaveBeenCalledTimes(1)
  })
})

describe('persona card bridge: autonomia do host', () => {
  function bridge(getAutonomy: unknown) {
    const snapshot: PersonaLiveSnapshot = {
      ready: true,
      tenant: { workspaceId: 'ws', projectId: 'pp', memberId: 'm1', channelId: 'geral' },
      team: null,
      nowRows: [],
      stripMembers: [],
      awayEvents: [],
      attentionTitles: [],
      messages: [],
      passThroughFollowers: [],
      dms: [],
      selectedDmId: null,
      dmMessages: [],
      projects: [],
      kanbanCards: [],
      dmUnreadByPersonaId: {},
      suggestedTask: null,
      turnContext: null,
      error: null,
      gestorPlansById: {},
      gestorPlanAdjustingIds: {},
      channelComposerHints: { responderAutonomy: 'propose', quotaBlocked: false },
      arrivingHostPersonaIds: [],
      channelSubjects: [],
    }
    const observable = createSnapshotStore(snapshot)
    const live = { observable, refresh: () => Promise.resolve() } as unknown as PersonaLiveStore
    const client = {
      getPersonaCard: () => Promise.resolve({
        ok: true,
        value: {
          personaId: 'nina', handle: '@nina', name: 'Nina', title: 'Pesquisa', systemRoles: [],
          nowKind: 'idle', nowText: '', presence: { online: true, lastActiveAt: '' },
          engine: { runnerLabel: 'claude', modelLabel: 'sonnet' },
        },
      }),
      ...(getAutonomy === undefined ? {} : { getAutonomy }),
    }
    return createPersonaCardBridge(client as never, live)
  }

  it('traz o nível do getAutonomy para o cartão (asked/propose/act → palavras da UI)', async () => {
    const b = bridge(() => Promise.resolve({ ok: true, value: { mode: 'act' } }))
    b.prefetch('nina')
    await vi.waitFor(() => { expect(b.cardInfo('nina')?.autonomyLevel).toBe('act-within-limits') })
  })

  it('host sem getAutonomy (ou com erro): o cartão carrega igual, só sem a linha', async () => {
    const without = bridge(undefined)
    without.prefetch('nina')
    await vi.waitFor(() => { expect(without.cardInfo('nina')).toBeDefined() })
    expect(without.cardInfo('nina')?.autonomyLevel).toBeUndefined()

    const failing = bridge(() => Promise.reject(new Error('forbidden')))
    failing.prefetch('nina')
    await vi.waitFor(() => { expect(failing.cardInfo('nina')).toBeDefined() })
    expect(failing.cardInfo('nina')?.autonomyLevel).toBeUndefined()
  })
})
