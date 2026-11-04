import { describe, expect, it } from 'vitest'
import { brainKindBrandIcon, brainPageTitle, brainSourceDisplay, brainSourceLabel, countPagesByKind, feedEditorDisplay, grantActionLabel, grantIsActive, grantTargetLabel, pageExcerpt, pageLead, pageToChangeItem, topBrainPages } from '../src/client/second-brain/brain-ui-adapters.ts'
import { pt } from '../src/client/locale/second-brain/locales.ts'
import type { BrainGrantView, BrainPageView } from '@deepseek-ai/dsh-persona-host/types'

const page = (partial: Partial<BrainPageView> & Pick<BrainPageView, 'id' | 'kind' | 'title'>): BrainPageView => ({
  body: partial.body ?? 'Corpo',
  slug: partial.slug ?? partial.id,
  revision: 1,
  links: [],
  sources: [],
  editorHint: '',
  updatedAt: partial.updatedAt ?? '2026-11-04T12:00:00.000Z',
  restricted: false,
  ...partial,
})

describe('brain-ui-adapters', () => {
  it('maps brain kinds to Brush brand icons', () => {
    expect(brainKindBrandIcon('company')).toBe('empresa')
    expect(brainKindBrandIcon('learning')).toBe('aprendizado')
  })

  it('counts pages by kind', () => {
    const counts = countPagesByKind([
      page({ id: 'a', kind: 'rule', title: 'A' }),
      page({ id: 'b', kind: 'rule', title: 'B' }),
      page({ id: 'c', kind: 'decision', title: 'C' }),
    ])
    expect(counts.rule).toBe(2)
    expect(counts.decision).toBe(1)
  })

  it('topBrainPages sorts by updatedAt', () => {
    const top = topBrainPages([
      page({ id: 'old', kind: 'company', title: 'Old', updatedAt: '2026-01-01T00:00:00.000Z' }),
      page({ id: 'new', kind: 'company', title: 'New', updatedAt: '2026-11-04T00:00:00.000Z' }),
    ], 1)
    expect(top[0]?.id).toBe('new')
  })

  it('grantIsActive respects expiry', () => {
    const grant: BrainGrantView = {
      id: 'g1',
      pageId: 'p1',
      personaId: 'sol',
      action: 'send',
      target: 'clients',
      validity: '7d',
      expiresAt: '2020-01-01T00:00:00.000Z',
      useCount: 0,
    }
    expect(grantIsActive(grant, Date.now())).toBe(false)
  })

  it('pageExcerpt trims long lines', () => {
    expect(pageExcerpt('hello\nworld', 8)).toBe('hello')
  })

  it('feedEditorDisplay: person:system is the persona holding the librarian role, never a fixed Atlas', () => {
    const system = page({ id: 'x', kind: 'company', title: 'T', editorHint: 'person:system' })
    // No librarian in this team: a neutral label and no borrowed portrait.
    const none = feedEditorDisplay(pt, system)
    expect(none.who).toBe('O bibliotecário')
    expect(none.whoAvatar).toBeUndefined()
    // With one, her name (and her portrait when she has one).
    const named = feedEditorDisplay(pt, system, {}, { system: 'Atlas' })
    expect(named.who).toBe('Atlas')
    expect(named.whoAvatar).toBeTruthy()
    expect(feedEditorDisplay(pt, system, {}, { system: 'Coordenação' }).who).toBe('Coordenação')
  })

  it('brainSourceLabel localizes derived-index', () => {
    expect(brainSourceLabel(pt, 'derived-index')).toBe(pt['feed.sourceDerivedIndex'])
    expect(brainSourceLabel(pt, 'vault:notas.md')).toBe('vault:notas.md')
  })

  it('pageToChangeItem localizes derived-index source', () => {
    const item = pageToChangeItem(pt, page({
      id: 'x',
      kind: 'rule',
      title: 'Regra',
      editorHint: 'person:system',
      sources: ['derived-index'],
    }))
    expect(item.source).toBe(pt['feed.sourceDerivedIndex'])
    expect(item.who).toBe('O bibliotecário')
  })
})

describe('readable Second Brain text (SB-5, Muse sweep)', () => {
  const grantPage = page({ id: 'g', kind: 'permission', title: 'reply-whatsapp · clientes-aprovados', editorHint: 'person:owner', sources: ['grant:owner'] })

  it('a member id is never shown: "Você" for the viewer, "Alguém da equipe" for the rest', () => {
    expect(feedEditorDisplay(pt, grantPage, {}, { owner: 'Você' }).who).toBe('Você')
    expect(feedEditorDisplay(pt, grantPage, {}, {}).who).toBe('Alguém da equipe')
    expect(feedEditorDisplay(pt, page({ id: 'x', kind: 'rule', title: 'T', editorHint: 'grant:abc' })).who).not.toMatch(/grant:/u)
  })

  it('a permission page reads as a sentence, not as two slugs', () => {
    expect(brainPageTitle(pt, grantPage)).toBe('Responder no WhatsApp: clientes aprovados')
    expect(grantActionLabel(pt, 'send-invoice')).toBe('Send invoice')
    expect(grantTargetLabel(pt, 'clientes-aprovados')).toBe('clientes aprovados')
    // Only permission pages are re-titled; a page called "a-b" by a person stays as written.
    expect(brainPageTitle(pt, page({ id: 'r', kind: 'rule', title: 'reply-whatsapp · x' }))).toBe('reply-whatsapp · x')
  })

  it('the feed row drops a source that is only an id, and says "atualizado sozinho" for the automatic index', () => {
    expect(brainSourceDisplay(pt, 'grant:owner')).toBeUndefined()
    expect(brainSourceDisplay(pt, 'person:owner')).toBeUndefined()
    expect(brainSourceDisplay(pt, 'derived-index')).toBe('atualizado sozinho')
    expect(brainSourceDisplay(pt, 'vault:notas.md')).toBe('vault:notas.md')
    const item = pageToChangeItem(pt, grantPage, {}, undefined, { owner: 'Você' })
    expect(item.who).toBe('Você')
    expect(item.pageTitle).toBe('Responder no WhatsApp: clientes aprovados')
    expect(item.source).toBeUndefined()
  })

  it('pageLead is the start of the page without its own title, bullets or [[links]]', () => {
    expect(pageLead('# Comece aqui\n\nAtualizado sozinho a partir das páginas.\n\n- [[Cardápio]] (empresa)\n- [[Preços|Tabela]]')).toBe('Atualizado sozinho a partir das páginas.\nCardápio (empresa)')
    expect(pageLead('# So um título')).toBe('')
    expect(pageLead('a'.repeat(300), 1, 20)).toHaveLength(20)
  })
})
