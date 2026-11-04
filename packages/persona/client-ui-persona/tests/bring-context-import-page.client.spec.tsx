// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PersonaRemoteClient } from '../src/client/data/lumen-inject.ts'
import { BringContextImportPage } from '../src/client/importers/BringContextImportPage.tsx'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, 'personaDesktop')
})

const PROPOSAL = {
  id: 'p1',
  kind: 'memory',
  section: 'Clientes',
  body: 'A Padaria Aurora paga todo dia 5.',
  provenance: 'clientes.md',
  uncertain: false,
  sensitive: false,
  blocked: false,
  status: 'ready',
  path: 'clientes.md',
  sensitiveWhy: '',
  duplicateOf: '',
  conflictQuestion: '',
  hash: 'h1',
}
const VIEW = { source: 'vault', ignored: [], proposals: [PROPOSAL] }

function fakePersona(overrides: Record<string, unknown> = {}): PersonaRemoteClient {
  return {
    previewBringContextVaultFolder: vi.fn(async () => ({ ok: true as const, value: VIEW })),
    previewBringContextPaste: vi.fn(async () => ({ ok: true as const, value: { ...VIEW, source: 'paste' } })),
    applyContextProposals: vi.fn(async () => ({ ok: true as const, value: { written: 1 } })),
    ...overrides,
  } as unknown as PersonaRemoteClient
}

function installPicker(path: string): void {
  Object.defineProperty(window, 'personaDesktop', {
    configurable: true,
    value: { pickDirectory: vi.fn(async () => path) },
  })
}

describe('BringContextImportPage (Gauge BYC app findings)', () => {
  it('reads the chosen folder ONCE: a re-render (new scope object, same ids) never restarts it ("Lendo 0 notas…" forever)', async () => {
    installPicker('C:/notas')
    const persona = fakePersona()
    const preview = (persona as unknown as { previewBringContextVaultFolder: ReturnType<typeof vi.fn> }).previewBringContextVaultFolder
    const view = (scope: { workspaceId: string; projectId: string }) => (
      <PreviewFrame brandLabel="Persona">
        <BringContextImportPage persona={persona} scope={scope} actorId="owner" />
      </PreviewFrame>
    )
    const { rerender } = render(view({ workspaceId: 'ws', projectId: 'proj' }))
    fireEvent.click(screen.getByRole('button', { name: 'Escolher pasta' }))
    await waitFor(() => { expect(screen.queryByText(/Lendo/u)).toBeNull() })
    // A parent that rebuilds the scope object on every render.
    for (let index = 0; index < 4; index += 1) rerender(view({ workspaceId: 'ws', projectId: 'proj' }))
    await new Promise(resolve => setTimeout(resolve, 80))
    expect(preview).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/1 notas?/u)).toBeTruthy()
  })

  it('after "Gravar N no Cofre" the screen says what happened and offers "Ver no Cofre"', async () => {
    const onOpenVault = vi.fn()
    const persona = fakePersona()
    render(
      <PreviewFrame brandLabel="Persona">
        <BringContextImportPage persona={persona} scope={{ workspaceId: 'ws', projectId: 'proj' }} actorId="owner" onOpenVault={onOpenVault} />
      </PreviewFrame>,
    )
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'A Padaria Aurora paga todo dia 5.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar resposta' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Organizar' }))
    fireEvent.click(await screen.findByRole('button', { name: /^Gravar \d+ no Cofre$/u }))
    await waitFor(() => { expect(document.querySelector('[data-persona-byc-saved]')).not.toBeNull() })
    expect(document.querySelector('[data-persona-byc-saved]')?.textContent).toMatch(/1 item no Cofre ✓/u)
    fireEvent.click(screen.getByRole('button', { name: 'Ver no Cofre' }))
    expect(onOpenVault).toHaveBeenCalledTimes(1)
  })

  it('rules arrive UNDECIDED: nothing binds the team without an explicit accept, and "Gravar" does not write them (BYC-4d)', async () => {
    const rule = { ...PROPOSAL, id: 'p2', kind: 'constraint', section: 'Regras', body: 'Nunca enviar proposta sem revisão do jurídico.' }
    const applyContextProposals = vi.fn(async () => ({ ok: true as const, value: { written: 1 } }))
    const persona = fakePersona({
      previewBringContextPaste: vi.fn(async () => ({ ok: true as const, value: { source: 'paste', ignored: [], proposals: [PROPOSAL, rule] } })),
      applyContextProposals,
    })
    render(
      <PreviewFrame brandLabel="Persona">
        <BringContextImportPage persona={persona} scope={{ workspaceId: 'ws', projectId: 'proj' }} actorId="owner" />
      </PreviewFrame>,
    )
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Regra: nunca enviar proposta sem revisão do jurídico.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar resposta' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Organizar' }))
    const save = await screen.findByRole('button', { name: /^Gravar \d+ no Cofre$/u })
    // Only the fact is accepted; the rule waits, says so, and the save bar says how many are missing.
    expect(save.textContent).toBe('Gravar 1 no Cofre')
    expect(screen.getByText('Falta 1 regra para você escolher')).toBeTruthy()
    expect(screen.getByText('Regras sem escolha não entram')).toBeTruthy()
    const row = screen.getByText('Nunca enviar proposta sem revisão do jurídico.').closest('li') as HTMLElement
    expect(within(row).getByRole('button', { name: 'Aceitar' }).getAttribute('aria-pressed')).toBe('false')
    expect(within(row).getByRole('button', { name: 'Descartar' }).getAttribute('aria-pressed')).toBe('false')
    // Saving now writes the rule as a discard, said out loud to the host (never left to a default).
    fireEvent.click(save)
    await waitFor(() => { expect(applyContextProposals).toHaveBeenCalled() })
    const sent = (applyContextProposals.mock.calls[0] as unknown as [{ items: { id: string; action: string }[] }])[0].items
    expect(sent.find(item => item.id === 'p2')?.action).toBe('discard')
    expect(sent.find(item => item.id === 'p1')?.action).toBe('accept')
  })

  it('"Aceitar todas as regras (n)" is the explicit accept, and then the review says how many become mandatory', async () => {
    const rule = { ...PROPOSAL, id: 'p2', kind: 'constraint', section: 'Regras', body: 'Nunca enviar proposta sem revisão do jurídico.' }
    const persona = fakePersona({
      previewBringContextPaste: vi.fn(async () => ({ ok: true as const, value: { source: 'paste', ignored: [], proposals: [PROPOSAL, rule] } })),
    })
    render(
      <PreviewFrame brandLabel="Persona">
        <BringContextImportPage persona={persona} scope={{ workspaceId: 'ws', projectId: 'proj' }} actorId="owner" />
      </PreviewFrame>,
    )
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Regra: nunca enviar proposta sem revisão do jurídico.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar resposta' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Organizar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Aceitar todas as regras (1)' }))
    expect(screen.getByText('1 regra será obrigatória para a equipe ao gravar')).toBeTruthy()
    expect(screen.queryByText(/Falta 1 regra|Faltam/u)).toBeNull()
    expect(screen.getByRole('button', { name: /^Gravar 2 no Cofre$/u })).toBeTruthy()
    // The button went away with the last pending rule.
    expect(screen.queryByRole('button', { name: /Aceitar todas as regras/u })).toBeNull()
  })
})
