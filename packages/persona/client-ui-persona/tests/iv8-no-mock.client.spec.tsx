// @vitest-environment jsdom
// IV-8: the real screens never show sample data. Skills with nothing taught and an organogram with nobody organized say so
// and offer one way forward; a host that cannot answer is an error with "Tentar de novo", not a made-up team.
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindObservableForTest } from './bind-observable-for-test.client.ts'
import { createLiveTenantObservable } from '../src/client/data/live-tenant-bridge.ts'
import { fetchOrgChart, fetchTeamHealth, fetchTwoDayTest } from '../src/client/governance/governance-remote.ts'
import { mockTeamHealth } from '../src/client/governance/mock-governance.ts'
import { pt as governancePt } from '../src/client/locale/governance/locales.ts'
import { pt as skillsPt } from '../src/client/locale/skills/locales.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { ConnectedOrgChartPanel } from '../src/client/remote/ConnectedOrgChartPanel.tsx'
import { ConnectedTeamHealthPanel } from '../src/client/remote/ConnectedTeamHealthPanel.tsx'
import type { PersonaLiveSnapshot, PersonaLiveStore } from '../src/client/remote/persona-live-store.ts'
import { createShellStore } from '../src/client/shell/create-shell-store.ts'
import { SkillsPanel } from '../src/client/skills/SkillsPanel.tsx'
import { MOCK_SKILLS } from '../src/client/skills/mock-data.ts'
import { PERSONA_LIVE_GESTOR_FIELDS, personaLiveStoreGestorStub, personaLiveStoreLifecycleStub } from './persona-live-fixtures.client.ts'
import { personaLiveStoreWave2Stub } from './persona-live-store-stub.client.ts'
installPreviewTheme()

afterEach(() => { cleanup() })

const SAMPLE_SKILL_NAMES = MOCK_SKILLS.map(skill => skill.name)
/** Names that exist only in the sample organogram (mock-governance.ts): none may reach a real screen. */
const MOCK_ORG_NAMES = ['Milo', 'Lodi', 'Zara', 'Iara', 'Sven'] as const

describe('IV-8 · Skills: no sample skills, an empty state that teaches', () => {
  it('with nothing handed in it shows no sample skill and no generic empty state', () => {
    render(<PreviewFrame brandLabel="Persona"><SkillsPanel /></PreviewFrame>)
    for (const name of SAMPLE_SKILL_NAMES) expect(screen.queryByText(name)).toBeNull()
    expect(screen.getByText(skillsPt['empty.title'])).toBeTruthy()
  })

  it('names the persona, explains a skill in one sentence and offers "Ensinar a {persona}"', () => {
    const onTeach = vi.fn()
    render(<PreviewFrame brandLabel="Persona"><SkillsPanel skills={[]} personaName="Nina" personaCharacter="nina" onTeach={onTeach} /></PreviewFrame>)
    expect(screen.getByRole('heading', { name: 'Nina ainda não tem skills' })).toBeTruthy()
    expect(screen.getByText('Uma skill é algo que Nina aprende a fazer sozinha. Mostre uma vez na tela e ela aprende.')).toBeTruthy()
    const teach = screen.getByRole('button', { name: 'Ensinar a Nina' })
    fireEvent.click(teach)
    expect(onTeach).toHaveBeenCalledTimes(1)
    for (const name of SAMPLE_SKILL_NAMES) expect(screen.queryByText(name)).toBeNull()
  })

  it('has no teach button when there is no way to teach (no dead control)', () => {
    render(<PreviewFrame brandLabel="Persona"><SkillsPanel skills={[]} personaName="Nina" /></PreviewFrame>)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Nina ainda não tem skills' })).toBeTruthy()
  })

  it('with real skills it still lists them', () => {
    render(<PreviewFrame brandLabel="Persona"><SkillsPanel skills={[{ id: 'k1', name: 'Fechar o caixa', version: 1, status: 'active', sharedWithTeam: false }]} personaName="Nina" /></PreviewFrame>)
    expect(screen.getByText('Fechar o caixa')).toBeTruthy()
    expect(screen.queryByText('Nina ainda não tem skills')).toBeNull()
  })
})

const EMPTY_LIVE: PersonaLiveSnapshot = {
  ready: true,
  tenant: { workspaceId: 'ws-iv8', projectId: 'proj', memberId: 'owner', channelId: 'geral' },
  team: { personas: [], members: [{ id: 'owner', workspaceId: 'ws-iv8', displayName: 'Você', handle: 'owner', role: 'owner' }] },
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
  ...PERSONA_LIVE_GESTOR_FIELDS,
}

function harness(initial: PersonaLiveSnapshot) {
  const snapStore = createSnapshotStore(initial)
  const live: PersonaLiveStore = {
    observable: snapStore,
    ...personaLiveStoreWave2Stub,
    ...personaLiveStoreGestorStub,
    ...personaLiveStoreLifecycleStub,
    bootstrap: async () => {},
    runDevHarnessSeedIfEnabled: async () => {},
    refresh: async () => {},
    postChannelMessage: async () => {},
    uploadChannelAttachment: async () => ({ id: 'a', name: 'f' }),
    uploadDmAttachment: async () => ({ id: 'b', name: 'f' }),
    selectDm: async () => {},
    openPersonaDm: async () => {},
    openFirstAvailableDm: async () => {},
    loadTurnContext: async () => {},
    postDmMessage: async () => {},
    toggleMessageReaction: async () => {},
    commitOnboardingRoster: async () => {},
    completeOnboarding: async () => {},
    setPersonaAutonomyLevel: async () => {},
  }
  const tenantObs = createLiveTenantObservable(live)
  const { store: shellStore } = createShellStore()
  const cardRev = createSnapshotStore({ n: 0 })
  return {
    useLive: bindObservableForTest(snapStore),
    useTenant: bindObservableForTest(tenantObs),
    useShell: bindObservableForTest(shellStore),
    usePersonaCardRevision: bindObservableForTest(cardRev),
  }
}

describe('IV-8 · Quem cuida de quem: no sample organogram', () => {
  it('a team with nobody in it says "Ninguém foi organizado ainda" and "Montar a equipe" opens the setup', async () => {
    const openTeamSetup = vi.fn()
    const hooks = harness(EMPTY_LIVE)
    render(
      <PreviewFrame brandLabel="Persona">
        <ConnectedOrgChartPanel
          persona={{} as never}
          useTenant={hooks.useTenant}
          useLive={hooks.useLive}
          useShell={hooks.useShell}
          usePersonaCardRevision={hooks.usePersonaCardRevision}
          openPersonaProfile={() => {}}
          openTeamSetup={openTeamSetup}
        />
      </PreviewFrame>,
    )
    expect(await screen.findByText('Ninguém foi organizado ainda')).toBeTruthy()
    expect(screen.getByText('Diga quem cuida de cada persona e quem assume quando alguém está fora.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Montar a equipe' }))
    expect(openTeamSetup).toHaveBeenCalledTimes(1)
    for (const name of MOCK_ORG_NAMES) expect(screen.queryByText(name)).toBeNull()
  })

  it('a host that cannot answer is an error with retry, never a sample team', async () => {
    const hooks = harness({ ...EMPTY_LIVE, team: null })
    render(
      <PreviewFrame brandLabel="Persona">
        <ConnectedOrgChartPanel
          persona={{} as never}
          useTenant={hooks.useTenant}
          useLive={hooks.useLive}
          useShell={hooks.useShell}
          usePersonaCardRevision={hooks.usePersonaCardRevision}
          openPersonaProfile={() => {}}
        />
      </PreviewFrame>,
    )
    await waitFor(() => { expect(screen.queryByText(governancePt['loading'])).toBeNull() })
    for (const name of MOCK_ORG_NAMES) expect(screen.queryByText(name)).toBeNull()
  })

  it('fetchOrgChart rejects instead of falling back to a sample organogram', async () => {
    await expect(fetchOrgChart({} as never, 'ws', 'person')).rejects.toThrow('org-chart-unavailable')
    const failing = { getOrgChart: async () => { throw new Error('host down') } } as never
    await expect(fetchOrgChart(failing, 'ws', 'person')).rejects.toThrow('host down')
  })
})

const LIVE_WITH_TEAM: PersonaLiveSnapshot = {
  ...EMPTY_LIVE,
  team: {
    personas: [{
      id: 'p-atlas', workspaceId: 'ws-iv8', projectId: 'proj', name: 'Atlas', title: 'Coordenação', description: '',
      avatarKind: 'gallery', avatarRef: 'atlas', systemRoles: ['team_manager'], canRecruit: true,
    }],
    members: [{ id: 'owner', workspaceId: 'ws-iv8', displayName: 'Você', handle: 'owner', role: 'owner' }],
  },
}

// A team that already worked (one card past "A fazer"): on its FIRST day the health screen is the calm "still getting to know" note (Lumen) and draws no timeline.
const LIVE_WORKED: PersonaLiveSnapshot = {
  ...LIVE_WITH_TEAM,
  kanbanCards: [{
    id: 'k-1', title: 'Tarefa em andamento', projectId: 'proj', projectName: 'Projeto', teamId: 'team', teamName: 'Equipe',
    column: 'in_progress', waitingEvent: false, blocked: false, reviewApproved: false,
  }],
}

describe('IV-8b · Saúde da equipe e Teste dos 2 dias: no sample health', () => {
  it('the fetchers reject instead of drawing a sample', async () => {
    await expect(fetchTeamHealth({} as never, 'ws')).rejects.toThrow('team-health-unavailable')
    await expect(fetchTwoDayTest({} as never, 'ws')).rejects.toThrow('two-day-unavailable')
    const down = { getTeamHealth: async () => { throw new Error('host down') }, runTwoDayTest: async () => { throw new Error('host down') } } as never
    await expect(fetchTeamHealth(down, 'ws')).rejects.toThrow('host down')
    await expect(fetchTwoDayTest(down, 'ws')).rejects.toThrow('host down')
  })

  it('a host that cannot answer is the error with "Tentar de novo", never a sample score', async () => {
    const hooks = harness(LIVE_WITH_TEAM)
    const persona = { getTeamHealth: async () => { throw new Error('host down') }, runTwoDayTest: async () => { throw new Error('host down') } } as never
    render(
      <PreviewFrame brandLabel="Persona">
        <ConnectedTeamHealthPanel persona={persona} useTenant={hooks.useTenant} useLive={hooks.useLive} useShell={hooks.useShell} />
      </PreviewFrame>,
    )
    expect(await screen.findByText(governancePt['error.title'])).toBeTruthy()
    expect(screen.getByRole('button', { name: governancePt['error.retry'] })).toBeTruthy()
    expect(screen.queryByText(mockTeamHealth('ws').findings[0]!.title)).toBeNull()
    expect(screen.queryByText(governancePt['loading'])).toBeNull()
  })

  function renderHealth(live: PersonaLiveSnapshot, health: ReturnType<typeof mockTeamHealth>): void {
    const hooks = harness(live)
    const persona = {
      getTeamHealth: async () => ({ ok: true as const, value: health }),
      runTwoDayTest: async () => { throw new Error('host down') },
    } as never
    render(
      <PreviewFrame brandLabel="Persona">
        <ConnectedTeamHealthPanel persona={persona} useTenant={hooks.useTenant} useLive={hooks.useLive} useShell={hooks.useShell} />
      </PreviewFrame>,
    )
  }

  it('a Teste dos 2 dias the host cannot run is drawn from the REAL roster, never from a sample', async () => {
    const health = { ...mockTeamHealth('ws-iv8'), gestorAudit: [] }
    renderHealth(LIVE_WORKED, health)
    expect(await screen.findByText(health.findings[0]!.title)).toBeTruthy()
    // Atlas is on the real team: the test shows her row; the made-up names of the sample test do not appear.
    await waitFor(() => { expect(screen.getAllByText(/Atlas/u).length).toBeGreaterThan(0) })
    expect(screen.queryByText(governancePt['error.title'])).toBeNull()
  })

  it('with neither the host nor a roster to draw it from, the test says so with its own "Tentar de novo"', async () => {
    const health = { ...mockTeamHealth('ws-iv8'), gestorAudit: [] }
    renderHealth({ ...LIVE_WITH_TEAM, team: null }, health)
    expect(await screen.findByText(health.findings[0]!.title)).toBeTruthy()
    await waitFor(() => { expect(screen.getByText(governancePt['error.title'])).toBeTruthy() })
    expect(screen.getByRole('button', { name: governancePt['error.retry'] })).toBeTruthy()
  })
})
