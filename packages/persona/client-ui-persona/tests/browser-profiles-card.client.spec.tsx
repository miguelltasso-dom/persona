// @vitest-environment jsdom
// Colheita item 17 · o cartão Navegador em Conexões: vazio, Chrome ausente, quem dirige, Assumir controle/Devolver,
// liberar e tirar persona; e a tradução da view do host (ids → nomes).
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BrowserProfilesCard, type BrowserProfilesCardProps } from '../src/client/browser/BrowserProfilesCard.tsx'
import { browserRows } from '../src/client/browser/browser-wire.ts'
import { pt as browserPt } from '../src/client/locale/browser/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
afterEach(cleanup)

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(browserPt, key, params)) as BrowserProfilesCardProps['t']

const BIA = { id: 'p-bia', name: 'Bia' }
const TEO = { id: 'p-teo', name: 'Téo' }

function card(extra: Partial<BrowserProfilesCardProps> = {}): BrowserProfilesCardProps {
  return {
    state: 'ready',
    chromeMissing: false,
    profiles: [],
    personas: [BIA, TEO],
    onCreate: vi.fn(async () => undefined),
    onRename: vi.fn(async () => undefined),
    onGrant: vi.fn(async () => undefined),
    onRevoke: vi.fn(async () => undefined),
    onTake: vi.fn(async () => undefined),
    onRelease: vi.fn(async () => undefined),
    onClose: vi.fn(async () => undefined),
    t,
    ...extra,
  }
}

describe('BrowserProfilesCard', () => {
  it('says Chrome is missing instead of promising a browser', () => {
    render(<BrowserProfilesCard {...card({ chromeMissing: true })} />)
    expect(screen.getByRole('status').textContent).toMatch(/Google Chrome não está instalado/u)
  })

  it('creates a profile from the empty state', async () => {
    const props = card({ state: 'empty' })
    render(<BrowserProfilesCard {...props} />)
    expect(screen.getByText('Nenhum perfil ainda')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Nome do perfil'), { target: { value: 'Loja' } })
    fireEvent.submit(screen.getByLabelText('Nome do perfil').closest('form') as HTMLFormElement)
    await waitFor(() => { expect(props.onCreate).toHaveBeenCalledWith('Loja') })
  })

  it('refuses a profile without a name in words', () => {
    render(<BrowserProfilesCard {...card()} />)
    fireEvent.submit(screen.getByLabelText('Nome do perfil').closest('form') as HTMLFormElement)
    expect(screen.getByRole('alert').textContent).toMatch(/precisa de um nome/u)
  })

  it('shows who drives and takes the control from a persona', async () => {
    const props = card({
      profiles: [{
        id: 'p-1',
        name: 'Loja',
        holder: { kind: 'persona', name: 'Bia' },
        running: true,
        personas: [BIA],
        defaultFor: ['Bia'],
      }],
    })
    render(<BrowserProfilesCard {...props} />)
    expect(screen.getByText('Em uso por Bia')).toBeTruthy()
    expect(screen.getByText('Aberto')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Assumir controle' }))
    await waitFor(() => { expect(props.onTake).toHaveBeenCalledWith('p-1') })
  })

  it('gives the control back when the person holds it', async () => {
    const props = card({
      profiles: [{
        id: 'p-1',
        name: 'Loja',
        holder: { kind: 'person', name: '' },
        running: true,
        personas: [],
        defaultFor: [],
      }],
    })
    render(<BrowserProfilesCard {...props} />)
    expect(screen.getByText('Você está no controle')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Devolver' }))
    await waitFor(() => { expect(props.onRelease).toHaveBeenCalledWith('p-1') })
  })

  it('says which persona cannot use the browser at all', () => {
    render(<BrowserProfilesCard {...card({
      profiles: [{ id: 'p-1', name: 'Loja', running: false, personas: [{ id: 'p-teo', name: 'Téo', canBrowse: false }], defaultFor: [] }],
    })} />)
    expect(screen.getByText(/sem navegador/u)).toBeTruthy()
  })

  it('grants and revokes a persona', async () => {
    const props = card({ profiles: [{ id: 'p-1', name: 'Loja', running: false, personas: [BIA], defaultFor: [] }] })
    render(<BrowserProfilesCard {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Liberar para Téo' }))
    await waitFor(() => { expect(props.onGrant).toHaveBeenCalledWith('p-1', 'p-teo') })
    fireEvent.click(screen.getByRole('button', { name: 'Tirar Bia' }))
    await waitFor(() => { expect(props.onRevoke).toHaveBeenCalledWith('p-1', 'p-bia') })
  })

  it('shows the host error in words and keeps the card usable', async () => {
    const props = card({
      profiles: [{ id: 'p-1', name: 'Loja', running: false, personas: [], defaultFor: [] }],
      onTake: vi.fn(async () => { throw new Error('outra pessoa ou persona está usando este perfil agora') }),
    })
    render(<BrowserProfilesCard {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Assumir controle' }))
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toMatch(/usando este perfil/u) })
    expect(screen.getByRole('button', { name: 'Assumir controle' })).toBeTruthy()
  })
})

describe('browserRows', () => {
  it('turns the host ids into the names the card shows', () => {
    const rows = browserRows({
      profiles: [{
        id: 'p-1',
        name: 'Loja',
        holder: { kind: 'persona', id: 'p-bia' },
        running: true,
        personas: ['p-bia', 'p-sumida'],
        defaultsFor: ['p-bia'],
      }],
      chrome: { path: 'C:\\Chrome\\chrome.exe' },
      withoutBrowser: ['p-sumida'],
    }, [BIA, TEO])
    expect(rows).toEqual([{
      id: 'p-1',
      name: 'Loja',
      holder: { kind: 'persona', name: 'Bia' },
      running: true,
      personas: [{ id: 'p-bia', name: 'Bia', canBrowse: true }, { id: 'p-sumida', name: 'p-sumida', canBrowse: false }],
      defaultFor: ['Bia'],
    }])
  })
})
