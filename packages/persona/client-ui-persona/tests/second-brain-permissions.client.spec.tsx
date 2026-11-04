// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BrainGrantView } from '@deepseek-ai/dsh-persona-host/types'
import { SecondBrainPermissionsView } from '../src/client/second-brain/SecondBrainPermissionsView.tsx'
import { pt } from '../src/client/locale/second-brain/locales.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()

afterEach(() => { cleanup() })

const GRANTS: readonly BrainGrantView[] = [
  {
    id: 'g-active',
    pageId: 'p1',
    personaId: 'atlas',
    action: 'enviar',
    target: 'Clientes',
    validity: '7d',
    useCount: 1,
  },
  {
    id: 'g-revoked',
    pageId: 'p2',
    personaId: 'luna',
    action: 'ler',
    target: 'Cofre',
    validity: 'until-revoke',
    useCount: 0,
    revokedAt: '2026-11-01T00:00:00.000Z',
  },
]

describe('SecondBrainPermissionsView (SB-5)', () => {
  it('filters grants and revokes an active row', () => {
    const onRevoke = vi.fn()
    render(
      <PreviewFrame brandLabel="Persona">
        <SecondBrainPermissionsView
          dict={pt}
          grants={GRANTS}
          personaNames={{ atlas: 'Atlas', luna: 'Luna' }}
          onBack={() => {}}
          onRevokeGrant={onRevoke}
        />
      </PreviewFrame>,
    )
    expect(screen.getByRole('tab', { name: pt['permissions.filter.active'], selected: true })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: pt['permissions.revoke'] }))
    fireEvent.click(screen.getByRole('button', { name: pt['permissions.confirmRevoke'] }))
    expect(onRevoke).toHaveBeenCalledWith('g-active')
    fireEvent.click(screen.getByRole('tab', { name: pt['permissions.filter.revoked'] }))
    expect(screen.getByText('Luna')).toBeTruthy()
  })
})
