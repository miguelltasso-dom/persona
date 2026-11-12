// @vitest-environment jsdom
// DESIGN-01 onda 3 · #16: a aba "Páginas" da Memória da empresa (painel `knowledge`). h1 = nome da aba; busca, chips de tipo, lista, "+ Nova página";
// os documentos enviados moram na mesma tela (antes, o "Cofre"); "Cofre" deixa de ser nome de tela.
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BrainPageView } from '@deepseek-ai/dsh-persona-host/types'
import { RemotePagesPanel } from '../src/client/data/lumen-remote-panels.tsx'
import type { PersonaRemoteClient } from '../src/client/data/lumen-inject.ts'
import type { PersonaTenantSnapshot } from '../src/client/data/persona-tenant.ts'
import { KnowledgeVault } from '../src/client/knowledge/KnowledgeVault.tsx'
import { SecondBrainPagesView } from '../src/client/second-brain/SecondBrainPagesView.tsx'
import { pt as brainPt, en as brainEn } from '../src/client/locale/second-brain/locales.ts'
import { pt as knowledgePt, en as knowledgeEn } from '../src/client/locale/knowledge/locales.ts'
import { bindObservableForTest } from './bind-observable-for-test.client.ts'
import { createShellStore } from '../src/client/shell/create-shell-store.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
afterEach(() => { cleanup() })

function page(partial: Partial<BrainPageView> & Pick<BrainPageView, 'id' | 'title'>): BrainPageView {
  return { kind: 'company', body: 'Corpo', slug: partial.id, revision: 1, links: [], sources: [], editorHint: 'persona:atlas', updatedAt: '2026-11-04T12:00:00.000Z', restricted: false, ...partial }
}
const PAGES = [
  page({ id: 'c1', kind: 'client', title: 'Padaria Lua', body: 'Cliente de bolos de festa' }),
  page({ id: 'c2', kind: 'client', title: 'Mercado Sol', body: 'Compra pães toda manhã' }),
  page({ id: 'p1', kind: 'process', title: 'Como atender no balcão', body: 'Passo a passo' }),
]

function pagesView(extra: Partial<Parameters<typeof SecondBrainPagesView>[0]> = {}) {
  return render(<PreviewFrame brandLabel="Persona"><SecondBrainPagesView dict={brainPt} pages={PAGES} onOpenPage={vi.fn()} {...extra} /></PreviewFrame>)
}

describe('Páginas · a lista', () => {
  it('h1 "Páginas"; todas as páginas; nenhum texto diz "Cofre" nem "Segundo cérebro"', () => {
    pagesView()
    expect(screen.getByRole('heading', { level: 1, name: 'Páginas' })).toBeTruthy()
    for (const title of ['Padaria Lua', 'Mercado Sol', 'Como atender no balcão']) expect(screen.getByText(title)).toBeTruthy()
    for (const dict of [brainPt, brainEn, knowledgePt, knowledgeEn]) {
      for (const [key, value] of Object.entries(dict)) expect(value, key).not.toMatch(/cofre|vault|segundo cérebro|second brain/iu)
    }
  })

  it('a busca acha pelo título e pelo texto', () => {
    pagesView()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'pães' } })
    expect(screen.queryByText('Padaria Lua')).toBeNull()
    expect(screen.getByText('Mercado Sol')).toBeTruthy()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'balcão' } })
    expect(screen.getByText('Como atender no balcão')).toBeTruthy()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz' } })
    expect(screen.getByText(/Nenhuma página encontrada/u)).toBeTruthy()
  })

  it('os chips de tipo filtram (só os tipos que têm páginas, com a contagem) e "Todas" volta', () => {
    pagesView()
    const chips = screen.getByRole('group', { name: 'Filtrar por tipo' })
    expect(within(chips).queryByRole('button', { name: /Pessoas?\b/u })).toBeNull()
    fireEvent.click(within(chips).getByRole('button', { name: /Clientes?\s*2/u }))
    expect(screen.queryByText('Como atender no balcão')).toBeNull()
    expect(screen.getByText('Mercado Sol')).toBeTruthy()
    expect(within(chips).getByRole('button', { name: /Clientes?\s*2/u }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(within(chips).getByRole('button', { name: /Todas/u }))
    expect(screen.getByText('Como atender no balcão')).toBeTruthy()
  })

  it('abrir uma página chama onOpenPage; "+ Nova página" só existe quando dá para criar', () => {
    const onOpenPage = vi.fn()
    const onWritePage = vi.fn()
    const { unmount } = pagesView({ onOpenPage, onWritePage })
    fireEvent.click(screen.getByRole('button', { name: /Padaria Lua/u }))
    expect(onOpenPage).toHaveBeenCalledWith('c1')
    fireEvent.click(screen.getByRole('button', { name: 'Nova página' }))
    expect(onWritePage).toHaveBeenCalledTimes(1)
    unmount()
    pagesView()
    expect(screen.queryByRole('button', { name: 'Nova página' })).toBeNull()
  })

  it('sem página nenhuma: um estado vazio honesto, sem botão que não faz nada', () => {
    pagesView({ pages: [] })
    expect(screen.getByText(/Nenhuma página ainda/u)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Nova página' })).toBeNull()
  })

  it('os documentos entram embaixo da lista, na mesma tela', () => {
    pagesView({ children: <p data-docs="">arquivos enviados</p> })
    expect(document.querySelector('[data-docs]')).toBeTruthy()
  })
})

describe('Documentos (o antigo Cofre), embutidos', () => {
  it('embutido não repete título de tela: sem cabeçalho "Cofre"; mostra as abas e o envio', () => {
    render(
      <PreviewFrame brandLabel="Persona">
        <KnowledgeVault
          embedded
          records={[{ id: 'r1', type: 'brief', title: 'Padaria da Ana', excerpt: 'Padaria da Ana, Centro', version: 1, updatedAt: '', author: '—', visibility: 'team' }]}
          documents={[{ id: 'd1', name: 'contrato.pdf', version: 1, updatedAt: '', visibility: 'team' } as never]}
          onUploadDocument={async () => undefined}
        />
      </PreviewFrame>,
    )
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
    expect(document.body.textContent).not.toMatch(/cofre/iu)
    expect(screen.getByRole('tab', { name: 'Registros' })).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Documentos' }))
    expect(screen.getByText('contrato.pdf')).toBeTruthy()
    expect(screen.getByText('Enviar documento')).toBeTruthy()
  })
})

function tenantHarness(): ReturnType<typeof bindObservableForTest<PersonaTenantSnapshot>> {
  const store = createSnapshotStore<PersonaTenantSnapshot>({ status: 'ready', scope: { workspaceId: 'ws', projectId: 'proj', actorId: 'owner' } })
  return bindObservableForTest({ getSnapshot: () => store.getSnapshot(), subscribe: listener => store.subscribe(listener) })
}
function shellHarness(): ReturnType<typeof bindObservableForTest<ReturnType<ReturnType<typeof createShellStore>['store']['getSnapshot']>>> {
  const { store } = createShellStore()
  return bindObservableForTest(store)
}

describe('RemotePagesPanel (painel `knowledge`)', () => {
  it('páginas reais do host + os documentos do mesmo projeto, na mesma tela', async () => {
    const persona = {
      getBrainHome: vi.fn(async () => ({ ok: true as const, value: { startHereId: '', changedToday: [], activeGrants: [], contradictions: [], leftover: [] } })),
      listPersonas: vi.fn(async () => ({ ok: true as const, value: [] })),
      listBrainPages: vi.fn(async () => ({ ok: true as const, value: PAGES })),
      listBrainPermissions: vi.fn(async () => ({ ok: true as const, value: [] })),
      listVaultRecords: vi.fn(async () => ({ ok: true as const, value: [] })),
      listVaultDocuments: vi.fn(async () => ({ ok: true as const, value: [{ id: 'd1', title: 'contrato.pdf', filename: 'contrato.pdf', revision: 1, chunks: 3, visibility: 'workspace' }] })),
      ingestVaultDocument: vi.fn(async () => ({ ok: true as const, value: {} })),
      createVaultRecord: vi.fn(),
    } as unknown as PersonaRemoteClient
    render(<PreviewFrame brandLabel="Persona"><RemotePagesPanel persona={persona} useTenant={tenantHarness()} useShell={shellHarness()} /></PreviewFrame>)
    await waitFor(() => { expect(screen.getByText('Padaria Lua')).toBeTruthy() })
    expect(screen.getByRole('heading', { level: 1, name: 'Páginas' })).toBeTruthy()
    // the documents of the same project are on the same screen
    fireEvent.click(await screen.findByRole('tab', { name: 'Documentos' }))
    await waitFor(() => { expect(screen.getByText('contrato.pdf')).toBeTruthy() })
    expect(persona.listVaultDocuments).toHaveBeenCalledWith({ workspaceId: 'ws', projectId: 'proj' })
  })
})
