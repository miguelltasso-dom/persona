// @vitest-environment jsdom
// DESIGN-01 onda 3 · #15, a ligação com o host: "Subir os 4 para “Decide o rotineiro”" aplica a correção em cada linha, relê a saúde UMA vez e o
// velocímetro sobe até a nota que o host RECALCULOU. Enquanto relê, a tela fica com os dados de antes (nada de esqueleto no lugar do medidor).
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindObservableForTest } from './bind-observable-for-test.client.ts'
import { createLiveTenantObservable } from '../src/client/data/live-tenant-bridge.ts'
import type { PersonaLiveSnapshot, PersonaLiveStore } from '../src/client/remote/persona-live-store.ts'
import { PERSONA_LIVE_GESTOR_FIELDS, personaLiveStoreGestorStub, personaLiveStoreLifecycleStub } from './persona-live-fixtures.client.ts'
import { personaLiveStoreWave2Stub } from './persona-live-store-stub.client.ts'
import { ConnectedTeamHealthPanel } from '../src/client/remote/ConnectedTeamHealthPanel.tsx'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { createShellStore } from '../src/client/shell/create-shell-store.ts'

installPreviewTheme()
afterEach(() => { cleanup() })

const NAMES = ['Sol', 'Nina', 'Bento', 'Atlas'] as const
const persona = (name: string) => ({
  id: `p-${name.toLowerCase()}`, workspaceId: 'ws-gov', projectId: 'proj', name, title: 'Função', description: '', avatarKind: 'gallery' as const, avatarRef: name.toLowerCase(), systemRoles: ['watchdog'] as const, canRecruit: false, // a watchdog row derived from the live team is all-green, so the host's rows are the ones on screen
})

const LIVE: PersonaLiveSnapshot = {
  ready: true,
  tenant: { workspaceId: 'ws-gov', projectId: 'proj', memberId: 'owner', channelId: 'geral' },
  team: { personas: NAMES.map(persona), members: [{ id: 'owner', workspaceId: 'ws-gov', displayName: 'Você', handle: 'owner', role: 'owner' }] } as never,
  nowRows: [], stripMembers: [], awayEvents: [], attentionTitles: [], messages: [], passThroughFollowers: [], dms: [], selectedDmId: null, dmMessages: [], projects: [],
  kanbanCards: [{ id: 'c1', title: 'Algo andando', projectId: 'proj', projectName: 'P', teamId: 't', teamName: 'T', column: 'in_progress', waitingEvent: false, blocked: false, reviewApproved: false }] as never,
  dmUnreadByPersonaId: {}, suggestedTask: null, turnContext: null, error: null,
  ...PERSONA_LIVE_GESTOR_FIELDS,
}

function harness() {
  const snapStore = createSnapshotStore(LIVE)
  const live: PersonaLiveStore = {
    observable: snapStore, ...personaLiveStoreWave2Stub, ...personaLiveStoreGestorStub, ...personaLiveStoreLifecycleStub,
    bootstrap: async () => {}, runDevHarnessSeedIfEnabled: async () => {}, refresh: async () => {}, postChannelMessage: async () => {},
    uploadChannelAttachment: async () => ({ id: 'a', name: 'f' }), uploadDmAttachment: async () => ({ id: 'b', name: 'f' }), selectDm: async () => {},
    openPersonaDm: async () => {}, openFirstAvailableDm: async () => {}, loadTurnContext: async () => {}, postDmMessage: async () => {},
    toggleMessageReaction: async () => {}, commitOnboardingRoster: async () => {}, completeOnboarding: async () => {}, setPersonaAutonomyLevel: async () => {},
  }
  const { store: shellStore } = createShellStore()
  return { useLive: bindObservableForTest(snapStore), useTenant: bindObservableForTest(createLiveTenantObservable(live)), useShell: bindObservableForTest(shellStore) }
}

const REASON = 'Espera sua aprovação — ninguém substitui você.'
const waitingRows = NAMES.map(name => ({ id: `initiative:p-${name.toLowerCase()}`, label: `Função (${name})`, slots: ['runs', 'runs', 'waits', 'waits'] as const, reason: REASON, fixKind: 'raise_autonomy' as const, fixTargetId: `initiative:p-${name.toLowerCase()}` }))
const runningRows = waitingRows.map(({ reason: _r, fixKind: _f, fixTargetId: _t, ...row }) => ({ ...row, slots: ['runs', 'runs', 'runs', 'runs'] as const }))

const HEALTH_BEFORE = {
  workspaceId: 'ws-gov', level: 'risk' as const, title: 'A equipe para se alguém some', body: 'Tudo depende de Você para aprovar. Se essa pessoa some, a equipe para.', score: 76,
  findings: [{ id: 'single_point_of_failure:h-1', level: 'risk' as const, title: 'Tudo depende de Você para aprovar. Se essa pessoa some, a equipe para.' }], gestorAudit: [],
}
const HEALTH_AFTER = { ...HEALTH_BEFORE, level: 'good' as const, title: 'A equipe se sustenta', body: undefined, score: 96, findings: [] }
const TWO_DAY = (rows: readonly unknown[]) => ({ workspaceId: 'ws-gov', slotLabels: ['Dia 1 · manhã', 'Dia 1 · tarde', 'Dia 2 · manhã', 'Dia 2 · tarde'], rows })

describe('ConnectedTeamHealthPanel · correção em lote (#15)', () => {
  it('aplica a correção em cada linha, relê, e o velocímetro vai até a nota que o host recalculou — sem esqueleto no meio', async () => {
    let fixed = 0
    let releaseHealth: (() => void) | undefined
    const applyGovernanceFix = vi.fn(async (_request: { findingId: string; fixKind: string; workspaceId: string }) => { fixed += 1; return { ok: true as const, value: HEALTH_AFTER } })
    const getTeamHealth = vi.fn(async () => {
      if (fixed === 0) return { ok: true as const, value: HEALTH_BEFORE }
      await new Promise<void>((resolve) => { releaseHealth = resolve })
      return { ok: true as const, value: HEALTH_AFTER }
    })
    const runTwoDayTest = vi.fn(async () => ({ ok: true as const, value: TWO_DAY(fixed === 0 ? waitingRows : runningRows) }))
    const { useLive, useTenant, useShell } = harness()
    render(
      <PreviewFrame brandLabel="Persona">
        <ConnectedTeamHealthPanel persona={{ getTeamHealth, runTwoDayTest, applyGovernanceFix } as never} useTenant={useTenant} useLive={useLive} useShell={useShell} />
      </PreviewFrame>,
    )
    // the sentence is in the second person with the number of colleagues; the broken host wording is gone
    expect(await screen.findByText('Se você ficar 2 dias fora, 4 colegas param esperando a sua aprovação.')).toBeTruthy()
    expect(screen.queryByText(/Se essa pessoa some/u)).toBeNull()
    const gauge = () => document.querySelector('[role="meter"]') as HTMLElement
    expect(gauge().getAttribute('aria-valuenow')).toBe('76')
    // each row has a face (the 4 personas are in the team), never a letter
    expect(document.querySelectorAll('[data-two-day-row] img')).toHaveLength(4)

    fireEvent.click(await screen.findByRole('button', { name: 'Subir os 4 para “Decide o rotineiro”' }))
    await waitFor(() => { expect(applyGovernanceFix).toHaveBeenCalledTimes(4) })
    expect(applyGovernanceFix.mock.calls.map(call => call[0].findingId)).toEqual(waitingRows.map(row => row.id))
    expect(applyGovernanceFix.mock.calls[0]?.[0]).toMatchObject({ fixKind: 'raise_autonomy', workspaceId: 'ws-gov' })
    // while the host recalculates the screen keeps what it had: the meter does not turn into a skeleton
    await waitFor(() => { expect(getTeamHealth).toHaveBeenCalledTimes(2) })
    expect(gauge().getAttribute('aria-valuenow')).toBe('76')
    releaseHealth?.()
    await waitFor(() => { expect(gauge().getAttribute('aria-valuenow')).toBe('96') })
    await waitFor(() => { expect(within(gauge()).getByText('96')).toBeTruthy() }, { timeout: 2000 })
    // the group is gone: nobody waits any more
    await waitFor(() => { expect(document.querySelector('[data-two-day-group]')).toBeNull() })
  })
})
