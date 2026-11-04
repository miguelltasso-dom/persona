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

it('keeps a DM fact private even when a public page already has the same title', () => {
  const existing = page({ title: 'Horário', kind: 'learning', body: 'Informação pública.' })
  const input = { facts: [{ title: 'Horário', kind: 'learning' as const, body: 'Reunião privada às seis.', required: false, linkTo: [] }],
    pages: [existing], source: { kind: 'conversation' as const, id: 'dm-1' },
    visibility: { kind: 'members' as const, memberIds: ['ana', 'bia'] }, workspaceId: 'ws', authorId: 'guia', now, policy: 'auto' as const }
  const result = curateAfterWork(input)
  expect(result.actions[0]).toMatchObject({ kind: 'create', page: { visibility: input.visibility } })
  expect(result.pages.find(row => row.id === existing.id)).toEqual(existing)
  const privatePage = result.pages.find(row => row.id !== existing.id)
  expect(privatePage?.body).toBe('Reunião privada às seis.')
  expect(curateAfterWork({ ...input, pages: result.pages, visibility: { kind: 'members', memberIds: ['bia', 'ana'] } }).actions).toEqual([])
  const otherDm = curateAfterWork({ ...input, pages: result.pages, source: { kind: 'conversation', id: 'dm-2' },
    visibility: { kind: 'members', memberIds: ['ana', 'dan'] } })
  expect(otherDm.actions[0]).toMatchObject({ kind: 'create', page: { visibility: { kind: 'members', memberIds: ['ana', 'dan'] } } })
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

it('keeps public and private copies separate during hygiene and deduplicates only the same audience', () => {
  const publicPage = page({ id: 'public' })
  const dm = page({ id: 'dm', visibility: { kind: 'members', memberIds: ['ana', 'bia'] } })
  const sameDm = page({ id: 'same-dm', revision: 2, visibility: { kind: 'members', memberIds: ['bia', 'ana'] } })
  const otherDm = page({ id: 'other-dm', visibility: { kind: 'members', memberIds: ['ana', 'dan'] } })
  const foreign = page({ id: 'foreign', workspaceId: 'other-workspace' })
  const result = runBrainHygiene([publicPage, dm, sameDm, otherDm, foreign], now)
  expect(result.pages.filter(row => row.status === 'active').map(row => row.id)).toEqual(['public', 'same-dm', 'other-dm', 'foreign'])
  expect(result.pages.find(row => row.id === 'dm')).toMatchObject({ status: 'replaced', replacedBy: 'same-dm', body: dm.body })
})

it('dedupes without an LLM and keeps the dropped page in history', () => {
  const a = page({ id: 'a', body: 'Pão e café em São Paulo todos os dias.' })
  const b = page({ id: 'b', body: 'Pão e café em São Paulo todos os dias.', revision: 2 })
  const { pages } = runBrainHygiene([a, b], now)
  expect(pages.find(row => row.id === 'a')?.status).toBe('replaced')
  expect(pages.find(row => row.id === 'b')?.status).toBe('active')
  expect(pages.find(row => row.id === 'a')?.body).toBe(a.body)
  const idle = runBrainHygiene([a, b], now, [])
  expect(idle.pages.find(row => row.id === 'a')?.status).toBe('active')
  expect(idle.reminders).toEqual([])
})
