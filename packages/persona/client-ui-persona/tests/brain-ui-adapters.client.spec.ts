import { describe, expect, it } from 'vitest'
import { brainKindBrandIcon, brainSourceLabel, countPagesByKind, feedEditorDisplay, grantIsActive, pageExcerpt, pageToChangeItem, topBrainPages } from '../src/client/second-brain/brain-ui-adapters.ts'
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

  it('feedEditorDisplay maps person:system to Atlas librarian copy', () => {
    const display = feedEditorDisplay(pt, page({
      id: 'x',
      kind: 'company',
      title: 'T',
      editorHint: 'person:system',
    }))
    expect(display.who).toBe(pt['feed.whoLibrarian'])
    expect(display.whoAvatar).toBeTruthy()
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
    expect(item.who).toBe(pt['feed.whoLibrarian'])
  })
})
