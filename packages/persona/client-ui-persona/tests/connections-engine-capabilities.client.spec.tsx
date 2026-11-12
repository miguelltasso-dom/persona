// @vitest-environment jsdom
// Muse §5.2 #12 (Conexões): selo honesto de capacidade por motor (D-103a), com UiIcon e sem ✓/⚠ como texto.
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ConnectionsView } from '../src/client/connections/ConnectionsView.tsx'
import type { ConnectionAccountUiRow, ConnectionProviderGroupUi, ConnectionsAccountsUi } from '../src/client/data/adapters/connection-accounts.ts'

afterEach(() => { cleanup() })

// The account row carries any engine id as text; the GROUP's provider is the view's closed union.
type Kind = ConnectionProviderGroupUi['provider']

function accountOf(kind: Kind, providerName: string): ConnectionAccountUiRow {
  return { id: `${kind}:pessoal`, name: providerName, kind, detail: '', accountLabel: 'Pessoal', status: 'ready' }
}

function uiWith(groups: readonly (readonly [Kind, string])[]): ConnectionsAccountsUi {
  return {
    groups: groups.map(([kind, providerName]) => ({ provider: kind, providerName, accounts: [accountOf(kind, providerName)] })),
    swapPolicy: 'next_on_limit',
    swapPolicyScope: 'workspace',
    legacySingleSeat: false,
  }
}

const READ_ONLY_NOTE = 'Nos conectores, este motor só lê. Enviar, publicar, pagar ou apagar não rodam por aqui.'

describe('selo honesto de capacidade por motor (D-103a)', () => {
  it('Claude mostra "Completo" com ícone, dentro do cabeçalho do próprio cartão', () => {
    render(<ConnectionsView accountsUi={uiWith([['claude', 'Claude']])} />)
    const head = screen.getByRole('heading', { name: 'Claude' }).parentElement
    expect(head).not.toBeNull()
    const chip = within(head as HTMLElement).getByText('Completo')
    expect(chip.querySelector('svg')).not.toBeNull()
    expect(screen.queryByText('Só leitura')).toBeNull()
    expect(screen.queryByText(READ_ONLY_NOTE)).toBeNull()
  })

  it('Codex, Cursor e OpenCode mostram "Só leitura" com o aviso visível em cada cartão', () => {
    render(<ConnectionsView accountsUi={uiWith([['codex', 'Codex'], ['cursor', 'Cursor'], ['opencode', 'OpenCode']])} />)
    expect(screen.getAllByText('Só leitura')).toHaveLength(3)
    expect(screen.getAllByText(READ_ONLY_NOTE)).toHaveLength(3)
    expect(screen.queryByText('Completo')).toBeNull()
  })

  it('o DeepSeek não ganha selo: o D-103a não cobre esse motor', () => {
    render(<ConnectionsView accountsUi={uiWith([['dsh', 'DeepSeek']])} />)
    expect(screen.queryByText('Completo')).toBeNull()
    expect(screen.queryByText('Só leitura')).toBeNull()
  })

  it('o selo usa ícone, nunca ✓ ou ⚠ como texto', () => {
    render(<ConnectionsView accountsUi={uiWith([['claude', 'Claude'], ['codex', 'Codex']])} />)
    const chips = [screen.getByText('Completo'), screen.getByText('Só leitura')]
    for (const chip of chips) {
      expect(chip.textContent).not.toMatch(/[✓⚠]/u)
      expect(chip.querySelector('svg')).not.toBeNull()
    }
  })
})
