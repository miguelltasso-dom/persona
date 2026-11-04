import { expect, it } from 'vitest'
import { curateAfterWork, runBrainHygiene } from '../src/index.ts'
import type { BrainPage } from '@deepseek-ai/dsh-persona-core'

const now = Date.parse('2026-11-03T15:00:00.000Z')

function page(overrides: Partial<BrainPage> = {}): BrainPage {
  return {
    id: 'p1',
    workspaceId: 'ws',
    kind: 'company',
    title: 'Padaria Lua',
    body: 'Pão e café em São Paulo.',
    properties: {},
    sources: [{ kind: 'task', id: 't1' }],
    visibility: { kind: 'workspace' },
    revision: 1,
    confirmedAt: now,
    links: [],
    required: false,
    status: 'active',
    authorId: 'atlas',
    createdAt: now,
    lastUsedAt: now,
    replacedBy: '',
    ...overrides,
  }
}

it('extracts a durable fact after a finished task and keeps the source', () => {
  const { actions, pages } = curateAfterWork({
    facts: [{
      title: 'Horário',
      kind: 'learning',
      body: 'Abrimos às 6h.',
      required: false,
      linkTo: [],
    }],
    pages: [page()],
    source: { kind: 'task', id: 't-close' },
    visibility: { kind: 'workspace' },
    workspaceId: 'ws',
    authorId: 'atlas',
    now,
    policy: 'auto',
  })
  expect(actions[0]).toMatchObject({ kind: 'create', needsAccept: false })
  expect(pages.some(row => row.body === 'Abrimos às 6h.' && row.sources[0]?.id === 't-close')).toBe(true)
})

it('flags a contradiction and never overwrites the existing body', () => {
  const existing = page({
    id: 'd1',
    kind: 'decision',
    title: 'Cor',
    body: 'O site usa lilás.',
    required: true,
  })
  const { actions, pages } = curateAfterWork({
    facts: [{
      title: 'Cor',
      kind: 'decision',
      body: 'O site não usa lilás.',
      required: true,
      linkTo: [],
    }],
    pages: [existing],
    source: { kind: 'conversation', id: 'm9' },
    visibility: { kind: 'workspace' },
    workspaceId: 'ws',
    authorId: 'atlas',
    now,
    policy: 'auto',
  })
  expect(actions[0]).toMatchObject({ kind: 'contradiction', pageId: 'd1' })
  expect(pages.find(row => row.id === 'd1')?.body).toBe('O site usa lilás.')
})

it('dedupes without an LLM and keeps the dropped page in history', () => {
  const a = page({ id: 'a', body: 'Pão e café em São Paulo todos os dias.' })
  const b = page({ id: 'b', body: 'Pão e café em São Paulo todos os dias.', revision: 2 })
  const { pages } = runBrainHygiene([a, b], now)
  expect(pages.find(row => row.id === 'a')?.status).toBe('replaced')
  expect(pages.find(row => row.id === 'b')?.status).toBe('active')
  expect(pages.find(row => row.id === 'a')?.body).toBe(a.body)
})
