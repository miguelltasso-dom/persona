// @vitest-environment jsdom
// Carbon P1-08 (UI, resíduo do P1-11): the host KEEPS the sealed secret when an edit arrives without one (`SaveCofreLoginRequest.password` absent + `id`), but the connected Cofre
// never passed `keepSecretOnEdit` to the screen and its own handler threw "Digite a senha para guardar." — so fixing a site or a title forced the person to retype every password.
// Vermelho primeiro: through the real `ConnectedCofre`, with the host's Remote as a fake that records what it receives.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConnectedCofre } from '../src/client/cofre/ConnectedCofre.tsx'
import type { HostCofreEntry } from '../src/client/cofre/cofre-wire.ts'
import { pt as cofreDict } from '../src/client/locale/cofre/locales.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

vi.mock('../src/client/data/use-remote-project-scope.ts', () => ({
  useRemoteProjectScope: () => ({ scope: { workspaceId: 'ws', projectId: 'pp' }, gate: 'ready', retryBootstrap: () => undefined }),
}))

installPreviewTheme()
afterEach(cleanup)

const noop = (() => undefined) as never
const entry = (over: Partial<HostCofreEntry> & Pick<HostCofreEntry, 'id' | 'kind' | 'title'>): HostCofreEntry =>
  ({ projectId: 'pp', fields: {}, hasSecret: true, createdAt: '2026-11-12T00:00:00Z', updatedAt: '2026-11-12T00:00:00Z', authorId: 'ana', ...over })

const ENTRIES: readonly HostCofreEntry[] = [
  entry({ id: 'cofre-login-ml', kind: 'login', title: 'Mercado Livre', fields: { site: 'mercadolivre.com.br', username: 'loja@padarialua.com.br' } }),
  entry({ id: 'cofre-key-mp', kind: 'key', title: 'Mercado Pago', fields: { service: 'Mercado Pago' } }),
]

function remote() {
  return {
    listCofreEntries: vi.fn(async () => ({ ok: true, value: ENTRIES })),
    listCofreCodes: vi.fn(async () => ({ ok: true, value: [] })),
    saveCofreLogin: vi.fn(async () => ({ ok: true, value: ENTRIES[0] })),
    saveCofreKey: vi.fn(async () => ({ ok: true, value: ENTRIES[1] })),
  }
}
const renderCofre = (persona: ReturnType<typeof remote>): void => {
  render(<ConnectedCofre persona={persona as never} useTenant={noop} useShell={noop} dicts={{ cofre: cofreDict }} />)
}

describe('editing a Cofre entry without retyping its secret (the host keeps the sealed one)', () => {
  it('login: fixing the title with the password left blank reaches the host WITHOUT a password, and no "Digite a senha" error is shown', async () => {
    const persona = remote()
    renderCofre(persona)
    fireEvent.click(await screen.findByRole('button', { name: 'Editar Mercado Livre' }))
    const panel = screen.getByRole('complementary', { name: 'Editar login' })
    expect(within(panel).getByText('Deixe em branco para manter a senha guardada.')).toBeTruthy()
    fireEvent.change(within(panel).getByLabelText('Nome (opcional)'), { target: { value: 'Mercado Livre da loja' } })
    fireEvent.submit((within(panel).getByLabelText('Senha') as HTMLInputElement).closest('form') as HTMLFormElement)
    await waitFor(() => { expect(persona.saveCofreLogin).toHaveBeenCalledTimes(1) })
    const sent = persona.saveCofreLogin.mock.calls[0] as unknown as [Record<string, unknown>]
    expect(sent[0]).toMatchObject({ workspaceId: 'ws', projectId: 'pp', id: 'cofre-login-ml', site: 'mercadolivre.com.br', username: 'loja@padarialua.com.br', title: 'Mercado Livre da loja' })
    expect('password' in sent[0]).toBe(false)
    expect(screen.queryByText(cofreDict['error.typePassword'])).toBeNull()
  })

  it('key: the same for a Chave (the secret stays sealed, the service name is what changes)', async () => {
    const persona = remote()
    renderCofre(persona)
    fireEvent.click(await screen.findByRole('button', { name: 'Editar Mercado Pago' }))
    const panel = screen.getByRole('complementary', { name: 'Editar chave' })
    fireEvent.submit(within(panel).getByLabelText('Chave').closest('form') as HTMLFormElement)
    await waitFor(() => { expect(persona.saveCofreKey).toHaveBeenCalledTimes(1) })
    const sent = persona.saveCofreKey.mock.calls[0] as unknown as [Record<string, unknown>]
    expect(sent[0]).toMatchObject({ id: 'cofre-key-mp', service: 'Mercado Pago' })
    expect('secret' in sent[0]).toBe(false)
  })

  it('a NEW login still needs its password: nothing is sent without one', async () => {
    const persona = remote()
    renderCofre(persona)
    fireEvent.click(await screen.findByRole('button', { name: 'Adicionar' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Login' }))
    const panel = screen.getByRole('complementary', { name: 'Novo login' })
    fireEvent.change(within(panel).getByLabelText('Site'), { target: { value: 'padaria.com.br' } })
    fireEvent.change(within(panel).getByLabelText('Usuário'), { target: { value: 'ana' } })
    fireEvent.submit((within(panel).getByLabelText('Senha') as HTMLInputElement).closest('form') as HTMLFormElement)
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(persona.saveCofreLogin).not.toHaveBeenCalled()
  })
})
