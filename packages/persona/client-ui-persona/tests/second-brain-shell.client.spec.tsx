// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BrainHomeView, BrainPageView, BrainVersionView } from '@deepseek-ai/dsh-persona-host/types'
import type { PersonaRemoteClient } from '../src/client/data/lumen-inject.ts'
import { SecondBrainShell } from '../src/client/second-brain/SecondBrainShell.tsx'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()

afterEach(() => { cleanup() })

function page(partial: Partial<BrainPageView> & Pick<BrainPageView, 'id' | 'title' | 'kind'>): BrainPageView {
  return {
    slug: partial.id,
    body: 'Corpo da página.',
    revision: 1,
    links: [],
    sources: [],
    editorHint: 'person:owner',
    updatedAt: '2026-11-04T12:00:00.000Z',
    restricted: false,
    ...partial,
  }
}

const RULE = page({ id: 'rule', slug: 'regras-da-casa', title: 'Regras da casa', kind: 'rule', revision: 2 })
const CLIENT = page({ id: 'client', slug: 'padaria-lua', title: 'Padaria Lua', kind: 'client', body: 'Ver [[Regras da casa]]', links: ['regras-da-casa'] })
const HOME: BrainHomeView = { startHereId: 'start', changedToday: [RULE, CLIENT], activeGrants: [], contradictions: [], leftover: [] }
const VERSIONS: BrainVersionView[] = [
  { revision: 2, title: 'Regras da casa', editorKind: 'person', editorId: 'owner', createdAt: '2026-11-04T12:00:00.000Z' },
  { revision: 1, title: 'Regras da casa', editorKind: 'persona', editorId: 'nina', createdAt: '2026-11-03T12:00:00.000Z' },
]

function fakePersona(overrides: Record<string, unknown> = {}): PersonaRemoteClient {
  const ok = <T,>(value: T) => ({ ok: true as const, value })
  const byId: Record<string, BrainPageView> = { rule: RULE, client: CLIENT }
  return {
    getBrainPage: vi.fn(async (req: { pageId: string }) => ok(byId[req.pageId] ?? RULE)),
    listBrainVersions: vi.fn(async () => ok(VERSIONS)),
    putBrainPage: vi.fn(async (req: { id: string; kind: BrainPageView['kind']; title: string }) => {
      const created = page({ id: req.id, kind: req.kind, title: req.title, body: '' })
      byId[req.id] = created
      return ok(created)
    }),
    restoreBrainPage: vi.fn(async () => ok(RULE)),
    ...overrides,
  } as unknown as PersonaRemoteClient
}

function shell(persona: PersonaRemoteClient) {
  return render(
    <PreviewFrame brandLabel="Persona">
      <SecondBrainShell
        persona={persona}
        scope={{ workspaceId: 'ws', projectId: 'proj' }}
        actorId="owner"
        home={HOME}
        pages={[RULE, CLIENT]}
        grants={[]}
        personaNames={{ nina: 'Nina' }}
        memberNames={{ owner: 'Você' }}
        surfaceState="ready"
      />
    </PreviewFrame>,
  )
}

async function openFromFeed(title: string): Promise<void> {
  const feed = screen.getByRole('list', { name: /mudou hoje/iu })
  fireEvent.click(within(feed).getByRole('button', { name: title }))
  await screen.findByRole('heading', { level: 1, name: title })
}

describe('SecondBrainShell (Gauge SB-7 app findings)', () => {
  it('"Citada em" lists the pages that link TO this one, not the ones this page links to', async () => {
    shell(fakePersona())
    // Regras da casa is cited by Padaria Lua.
    await openFromFeed('Regras da casa')
    const cited = screen.getByRole('region', { name: 'Citada em' })
    expect(within(cited).getByText('Padaria Lua')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /início/iu }))
    // Padaria Lua cites it, but nobody cites Padaria Lua.
    await openFromFeed('Padaria Lua')
    const none = screen.getByRole('region', { name: 'Citada em' })
    expect(within(none).queryByText('Regras da casa')).toBeNull()
    expect(within(none).getByText('Nenhum link ainda.')).toBeTruthy()
  })

  it('the history shows names, never ids, and offers "Restaurar" on older versions only', async () => {
    const persona = fakePersona()
    shell(persona)
    await openFromFeed('Regras da casa')
    const history = screen.getByRole('region', { name: 'Histórico' })
    expect(within(history).getByText('Você')).toBeTruthy()
    expect(within(history).getByText('Nina')).toBeTruthy()
    expect(history.textContent).not.toMatch(/owner|nina\b/u)
    const restores = within(history).getAllByRole('button', { name: 'Restaurar' })
    expect(restores).toHaveLength(1)
    fireEvent.click(restores[0]!)
    await waitFor(() => { expect(persona.restoreBrainPage).toHaveBeenCalledWith({ workspaceId: 'ws', projectId: 'proj', pageId: 'rule', revision: 1 }) })
  })

  it('"Nova página" is always there: a title and a type, then the new page opens', async () => {
    const persona = fakePersona()
    shell(persona)
    fireEvent.click(screen.getByRole('button', { name: 'Nova página' }))
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Como atendemos' } })
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'process' } })
    fireEvent.click(screen.getByRole('button', { name: 'Criar página' }))
    await screen.findByRole('heading', { level: 1, name: 'Como atendemos' })
    expect(persona.putBrainPage).toHaveBeenCalledWith(expect.objectContaining({ title: 'Como atendemos', kind: 'process', editorId: 'owner' }))
  })
})
