// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConnectionsView } from '../src/client/connections/ConnectionsView.tsx'
import { MOCK_CONNECTIONS } from '../src/client/connections/mock-data.ts'
import type { ConnectionsAccountsUi } from '../src/client/data/adapters/connection-accounts.ts'
import { pt as connectionsPt } from '../src/client/locale/connections/locales.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()

afterEach(() => { cleanup() })

describe('ConnectionsView (W2-7 copy)', () => {
  it('shows honest terms notice when accounts are listed', () => {
    render(
      <PreviewFrame brandLabel="Persona">
        <ConnectionsView dict={connectionsPt} entries={MOCK_CONNECTIONS} />
      </PreviewFrame>,
    )
    expect(screen.getByText(connectionsPt['wave2.termsNotice'])).toBeTruthy()
  })

  it('lists multiple seats per provider and add-account hint (W2-7 UI)', () => {
    const accountsUi: ConnectionsAccountsUi = {
      legacySingleSeat: false,
      swapPolicy: 'fixed',
      swapPolicyScope: 'workspace',
      groups: [{
        provider: 'claude',
        providerName: 'Claude Code',
        accounts: [
          {
            id: 'claude-work',
            name: 'Claude Code',
            accountLabel: 'Trabalho',
            status: 'ready',
            detail: '',
            kind: 'claude',
          },
          {
            id: 'claude-home',
            name: 'Claude Code',
            accountLabel: 'Pessoal',
            status: 'ready',
            detail: '',
            kind: 'claude',
          },
        ],
      }],
    }
    const onAdd = vi.fn()
    render(
      <PreviewFrame brandLabel="Persona">
        <ConnectionsView
          dict={connectionsPt}
          entries={[]}
          accountsUi={accountsUi}
          onAddAccount={onAdd}
        />
      </PreviewFrame>,
    )
    expect(screen.getByText('Trabalho')).toBeTruthy()
    expect(screen.getByText('Pessoal')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', {
      name: connectionsPt['account.addButton'].replace('{provider}', 'Claude Code'),
    }))
    // The button opens the step-by-step dialog; nothing is saved until the person names the account.
    expect(onAdd).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.getByText(
      connectionsPt['account.addIsolatedHint'].replace('{provider}', 'Claude Code'),
    )).toBeTruthy()
  })
})
