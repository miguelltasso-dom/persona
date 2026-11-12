// @vitest-environment jsdom
// Cena 18 e cena 20 (Muse): Conexões em Configurações leva, embaixo do painel de contas, o cartão "Equipe à distância"
// com o painel de equipe remota que já existe (ConnectedRemoteTeamPanel). Membros só vira aba com a flag remoteTeamTab.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsConnectionsTab } from '../src/client/shell/SettingsConnectionsTab.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

vi.mock('../src/client/data/lumen-remote-panels.tsx', async () => {
  const { createElement } = await import('react')
  return { RemoteConnectionsPanel: () => createElement('p', null, 'Painel de contas') }
})
vi.mock('../src/client/data/use-remote-project-scope.ts', () => ({
  useRemoteProjectScope: () => ({ scope: null, gate: { status: 'ready' }, retryBootstrap: () => undefined }),
}))
vi.mock('../src/client/remote-team/ConnectedRemoteTeamPanel.tsx', async () => {
  const { createElement } = await import('react')
  return { ConnectedRemoteTeamPanel: () => createElement('p', null, 'Painel da equipe remota') }
})

installPreviewTheme()
afterEach(() => cleanup())

describe('Configurações › Conexões', () => {
  it('mostra o painel de contas e, embaixo, o cartão "Equipe à distância" com o painel de equipe remota', () => {
    // Os painéis estão mockados: as props só precisam existir para o wrapper repassá-las.
    render(<SettingsConnectionsTab persona={{} as never} useTenant={(() => undefined) as never} useShell={(() => undefined) as never} />)
    expect(screen.getByText('Painel de contas')).toBeTruthy()
    expect(screen.getByText('Painel da equipe remota')).toBeTruthy()
  })
})
