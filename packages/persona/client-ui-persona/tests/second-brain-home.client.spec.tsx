// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BrainHomeView, BrainPageView } from '@deepseek-ai/dsh-persona-host/types'
import { SecondBrainHome } from '../src/client/second-brain/SecondBrainHome.tsx'
import { pt } from '../src/client/locale/second-brain/locales.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()

afterEach(() => { cleanup() })

function brainPage(partial: Partial<BrainPageView> & Pick<BrainPageView, 'id' | 'title'>): BrainPageView {
  return {
    kind: 'company',
    body: 'Corpo',
    slug: partial.id,
    revision: 1,
    links: [],
    sources: [],
    editorHint: 'persona:atlas',
    updatedAt: '2026-11-04T12:00:00.000Z',
    restricted: false,
    ...partial,
  }
}

const HOME: BrainHomeView = {
  startHereId: 'start',
  changedToday: [brainPage({ id: 'p1', title: 'Missão da empresa' })],
  activeGrants: [{
    id: 'g1',
    pageId: 'p1',
    personaId: 'atlas',
    action: 'editar',
    target: 'Missão',
    validity: '7d',
    useCount: 2,
  }],
  contradictions: [],
  leftover: [],
}

describe('SecondBrainHome (SB-5)', () => {
  it('"Comece aqui" shows the start of the page (two lines) and an Abrir button, not the title again', () => {
    const onOpenPage = vi.fn()
    render(
      <PreviewFrame brandLabel="Persona">
        <SecondBrainHome
          dict={pt}
          home={{ startHereId: 'start', changedToday: [], activeGrants: [], contradictions: [], leftover: [] }}
          pages={[brainPage({ id: 'start', title: 'Comece aqui', body: '# Comece aqui\n\nAtualizado sozinho a partir das páginas.\n\n- [[Cardápio]]' })]}
          onOpenPage={onOpenPage}
        />
      </PreviewFrame>,
    )
    expect(screen.getByText(/Atualizado sozinho a partir das páginas./u)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Comece aqui' }))
    expect(onOpenPage).toHaveBeenCalledWith('start')
  })

  it('the feed and permissions never show an id: names and plain words (Muse SB-5)', () => {
    render(
      <PreviewFrame brandLabel="Persona">
        <SecondBrainHome
          dict={pt}
          home={{
            startHereId: 'start',
            changedToday: [brainPage({ id: 'g', kind: 'permission', title: 'reply-whatsapp · clientes-aprovados', editorHint: 'person:owner', sources: ['grant:owner'] })],
            activeGrants: [{ id: 'g1', pageId: 'g', personaId: 'atlas', action: 'reply-whatsapp', target: 'clientes-aprovados', validity: 'until-revoke', useCount: 0 }],
            contradictions: [],
            leftover: [],
          }}
          // The same page is also in "Mais usadas" and in the search: no slug anywhere on the screen.
          pages={[brainPage({ id: 'g', kind: 'permission', title: 'reply-whatsapp · clientes-aprovados', editorHint: 'person:owner', sources: ['grant:owner'] })]}
          personaNames={{ atlas: 'Atlas' }}
          memberNames={{ owner: 'Você' }}
          onRevokeGrant={() => {}}
        />
      </PreviewFrame>,
    )
    const text = document.body.textContent ?? ''
    expect(text).not.toMatch(/person:|grant:|reply-whatsapp|clientes-aprovados/u)
    expect(text).toContain('Você')
    expect(text).toContain('Responder no WhatsApp')
    // The persona on the permission wears her animal (Nina), not an initial.
    const permission = screen.getByRole('button', { name: pt['permissions.revoke'] }).closest('li') as HTMLElement
    expect(permission.querySelector('img')).not.toBeNull()
  })

  it('renders home sections and revokes a grant', () => {
    const onRevoke = vi.fn()
    render(
      <PreviewFrame brandLabel="Persona">
        <SecondBrainHome
          dict={pt}
          home={HOME}
          pages={[brainPage({ id: 'p1', title: 'Missão da empresa' }), brainPage({ id: 'p2', title: 'Processo de vendas', kind: 'process' })]}
          personaNames={{ atlas: 'Atlas' }}
          onRevokeGrant={onRevoke}
        />
      </PreviewFrame>,
    )
    expect(screen.getByRole('heading', { name: pt['title'] })).toBeTruthy()
    expect(screen.getByText(pt['sections.changedToday'])).toBeTruthy()
    expect(screen.getByText(pt['sections.permissions'])).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: pt['permissions.revoke'] }))
    fireEvent.click(screen.getByRole('button', { name: pt['permissions.confirmRevoke'] }))
    expect(onRevoke).toHaveBeenCalledWith('g1')
  })

  it('shows sparse hero when the vault is nearly empty', () => {
    render(
      <PreviewFrame brandLabel="Persona">
        <SecondBrainHome
          dict={pt}
          home={{ startHereId: 'start', changedToday: [], activeGrants: [], contradictions: [], leftover: [] }}
          pages={[brainPage({ id: 'start', title: 'Índice da empresa' })]}
          onBringContext={vi.fn()}
        />
      </PreviewFrame>,
    )
    expect(screen.getByText(pt['empty.title'])).toBeTruthy()
    expect(screen.getByRole('button', { name: pt['empty.action.byc'] })).toBeTruthy()
  })

  it('filters pages from the search field', () => {
    render(
      <PreviewFrame brandLabel="Persona">
        <SecondBrainHome
          dict={pt}
          home={HOME}
          pages={[
            brainPage({ id: 'p1', title: 'Missão da empresa' }),
            brainPage({ id: 'p2', title: 'Processo de vendas', kind: 'process' }),
          ]}
        />
      </PreviewFrame>,
    )
    fireEvent.change(screen.getByPlaceholderText(pt['search.placeholder']), { target: { value: 'vendas' } })
    const results = screen.getByRole('region', { name: pt['search.results'].replace('{count}', '1') })
    expect(within(results).getByRole('button', { name: 'Processo de vendas' })).toBeTruthy()
  })

  it('SB-7: a permission that already ran out is not listed as active, and not counted', () => {
    const now = Date.parse('2026-11-04T12:00:00.000Z')
    const home: BrainHomeView = {
      ...HOME,
      activeGrants: [
        { id: 'g-live', pageId: 'p1', personaId: 'atlas', action: 'editar', target: 'Missão', validity: '7d', expiresAt: '2026-11-09T12:00:00.000Z', useCount: 0 },
        { id: 'g-gone', pageId: 'p1', personaId: 'atlas', action: 'editar', target: 'Cardápio antigo', validity: '7d', expiresAt: '2026-11-01T12:00:00.000Z', useCount: 0 },
        { id: 'g-forever', pageId: 'p1', personaId: 'atlas', action: 'ler', target: 'Preços', validity: 'until-revoke', useCount: 3 },
      ],
    }
    render(
      <PreviewFrame brandLabel="Persona">
        <SecondBrainHome dict={pt} home={home} pages={[brainPage({ id: 'p1', title: 'Missão da empresa' })]} personaNames={{ atlas: 'Atlas' }} nowMs={now} />
      </PreviewFrame>,
    )
    expect(screen.queryByText(/Cardápio antigo/u)).toBeNull()
    expect(screen.getAllByText(/Preços/u).length).toBeGreaterThan(0) // forever grant stays
    expect(screen.getAllByText(/Missão/u).length).toBeGreaterThan(0) // 7-day grant still inside its week
  })
})
