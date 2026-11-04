import { expect, it } from 'vitest'
import {
  BRAIN_CONFIRM_MS,
  BRAIN_PAGE_KINDS,
  BRAIN_PROPERTY_KEYS,
  acceptLibrarianProposal,
  applyBrainPropose,
  applyHygiene,
  applyLibrarianActions,
  assertBrainPage,
  backlinks,
  brainPageToMarkdown,
  exportBrainVault,
  leftoverDestFiles,
  planBrainVaultExport,
  shouldImportVaultFile,
  brainPropose,
  brainRead,
  brainSearch,
  brainSnapshot,
  compileBrainContext,
  curateBrain,
  hygieneBrain,
  hygieneChangedOnly,
  indexBrainByKind,
  librarianHolders,
  markdownToBrainPage,
  nextBrainVersion,
  resolveLibrarian,
  startHereLinks,
  vaultRecordToBrainPage,
  visibilityFromAudience,
} from '../src/index.ts'
import type { Actor, BrainPage, VaultRecord } from '../src/index.ts'

const now = Date.parse('2026-11-03T15:00:00.000Z')

const owner: Actor = {
  kind: 'user',
  id: 'miguel',
  workspaceId: 'ws',
  workspaceRole: 'owner',
  projectIds: ['launch'],
}

const personaA: Actor = {
  kind: 'persona',
  id: 'atlas',
  workspaceId: 'ws',
  workspaceRole: 'member',
  projectIds: ['launch'],
  systemRoles: ['coordination', 'librarian'],
}

const personaB: Actor = {
  kind: 'persona',
  id: 'bento',
  workspaceId: 'ws',
  workspaceRole: 'member',
  projectIds: ['ops'],
  systemRoles: [],
}

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

it('lists the eleven fixed page kinds and typed property keys', () => {
  expect(BRAIN_PAGE_KINDS).toEqual([
    'company', 'person', 'client', 'project', 'process',
    'rule', 'decision', 'permission', 'tool', 'glossary', 'learning',
  ])
  expect(BRAIN_PROPERTY_KEYS.permission).toContain('personaId')
  expect(BRAIN_PROPERTY_KEYS.person).toEqual(['role', 'company', 'workContact'])
  expect(BRAIN_PROPERTY_KEYS.rule).toEqual(['required'])
})

it('derives visibility from audience: DM stays private to participants', () => {
  expect(visibilityFromAudience({ stream: 'dm', participantIds: ['miguel', 'atlas'] }))
    .toEqual({ kind: 'members', memberIds: ['miguel', 'atlas'] })
  expect(visibilityFromAudience({ stream: 'channel', participantIds: ['miguel'] }))
    .toEqual({ kind: 'workspace' })
  expect(visibilityFromAudience({
    stream: 'task',
    participantIds: [],
    projectId: 'launch',
  })).toEqual({ kind: 'project', projectId: 'launch' })
})

it('versions a page without deleting the previous revision', () => {
  const first = page()
  const bumped = nextBrainVersion(first, { body: 'Pão, café e bolo.' }, 'miguel', now + 1)
  expect(bumped.page.revision).toBe(2)
  expect(bumped.page.body).toBe('Pão, café e bolo.')
  expect(bumped.version.revision).toBe(2)
  expect(first.body).toBe('Pão e café em São Paulo.')
  expect(first.revision).toBe(1)
})

it('computes backlinks and a derived Comece aqui index', () => {
  const company = page({ id: 'c1', kind: 'company' })
  const rule = page({ id: 'r1', kind: 'rule', title: 'Nunca inventar preço', required: true, links: ['c1'] })
  const project = page({ id: 'j1', kind: 'project', title: 'Site' })
  expect(backlinks([company, rule, project], 'c1').map(row => row.id)).toEqual(['r1'])
  expect(startHereLinks([company, rule, project])).toEqual(['c1', 'r1', 'j1'])
  expect(indexBrainByKind([company, rule]).rule).toHaveLength(1)
})

it('resolves librarian to the named holder, else coordination; role is not unique', () => {
  expect(resolveLibrarian([
    { id: 'atlas', systemRoles: ['coordination'] },
    { id: 'iris', systemRoles: ['librarian'] },
  ])).toBe('iris')
  expect(resolveLibrarian([{ id: 'atlas', systemRoles: ['coordination'] }])).toBe('atlas')
  expect(librarianHolders([
    { id: 'iris', workspaceId: 'ws', systemRoles: ['librarian'] },
    { id: 'nova', workspaceId: 'ws', systemRoles: ['librarian'] },
  ], 'ws')).toHaveLength(2)
})

it('curates a finished task: new fact creates a page with source; contradiction is flagged', () => {
  const existing = page({
    id: 'd1',
    kind: 'decision',
    title: 'Cor',
    body: 'O site usa lilás.',
    required: true,
  })
  const created = curateBrain({
    facts: [{
      title: 'Horário',
      kind: 'learning',
      body: 'Abrimos às 6h.',
      required: false,
      linkTo: ['d1'],
    }],
    pages: [existing],
    source: { kind: 'task', id: 't9' },
    visibility: { kind: 'workspace' },
    workspaceId: 'ws',
    authorId: 'atlas',
    now,
    policy: 'auto',
  })
  expect(created).toEqual([expect.objectContaining({
    kind: 'create',
    needsAccept: false,
    page: expect.objectContaining({
      body: 'Abrimos às 6h.',
      sources: [{ kind: 'task', id: 't9' }],
      links: ['d1'],
    }),
  })])
  const clash = curateBrain({
    facts: [{
      title: 'Cor',
      kind: 'decision',
      body: 'O site não usa lilás.',
      required: true,
      linkTo: [],
    }],
    pages: [existing],
    source: { kind: 'task', id: 't9' },
    visibility: { kind: 'workspace' },
    workspaceId: 'ws',
    authorId: 'atlas',
    now,
    policy: 'auto',
  })
  expect(clash[0]).toMatchObject({ kind: 'contradiction', pageId: 'd1', existing: 'O site usa lilás.' })
  const applied = applyLibrarianActions([existing], clash, 'atlas', now)
  expect(applied.find(row => row.id === 'd1')?.body).toBe('O site usa lilás.')
})

it('keeps required rules and decisions as propose until a human accepts', () => {
  const actions = curateBrain({
    facts: [{
      title: 'Preço',
      kind: 'rule',
      body: 'Nunca inventar preço.',
      required: true,
      linkTo: [],
    }],
    pages: [],
    source: { kind: 'approval', id: 'a1' },
    visibility: { kind: 'workspace' },
    workspaceId: 'ws',
    authorId: 'atlas',
    now,
    policy: 'auto',
  })
  expect(actions).toEqual([expect.objectContaining({ kind: 'propose', pageKind: 'rule' })])
  expect(applyLibrarianActions([], actions, 'atlas', now)).toEqual([])
  const accepted = acceptLibrarianProposal({
    id: 'r-price',
    workspaceId: 'ws',
    title: 'Preço',
    body: 'Nunca inventar preço.',
    pageKind: 'rule',
    visibility: { kind: 'workspace' },
    source: { kind: 'approval', id: 'a1' },
    authorId: 'miguel',
    now,
    required: true,
  })
  expect(accepted.required).toBe(true)
  expect(accepted.kind).toBe('rule')
  assertBrainPage(accepted)
})

it('hygiene dedupes without deleting and reminds after 90 silent days', () => {
  const a = page({ id: 'a', body: 'Pão e café em São Paulo todos os dias.' })
  const b = page({ id: 'b', body: 'Pão e café em São Paulo todos os dias.', revision: 2 })
  const old = page({ id: 'old', confirmedAt: now - BRAIN_CONFIRM_MS - 1 })
  const report = hygieneBrain([a, b, old], now)
  expect(report.duplicates).toEqual([{ keepId: 'b', dropId: 'a' }])
  expect(report.reminders[0]).toMatchObject({ pageId: 'old', silentDays: 90 })
  const applied = applyHygiene([a, b, old], report)
  expect(applied.find(row => row.id === 'a')?.status).toBe('replaced')
  expect(applied.find(row => row.id === 'a')?.replacedBy).toBe('b')
  expect(applied.find(row => row.id === 'b')?.status).toBe('active')
  expect(applied.find(row => row.id === 'a')?.body).toBe(a.body)
  expect(hygieneChangedOnly([a, b, old], [], now).duplicates).toEqual([])
  expect(hygieneChangedOnly([a, b, old], ['a'], now).duplicates).toEqual([{ keepId: 'b', dropId: 'a' }])
  expect(hygieneChangedOnly([a, b, old], ['old'], now).reminders[0]?.pageId).toBe('old')
})

it('brain_search and brain_read hide DM pages from a persona outside the audience', () => {
  const dm = page({
    id: 'dm1',
    title: 'Segredo do Miguel',
    body: 'CPF da contadora fica só no DM.',
    visibility: visibilityFromAudience({ stream: 'dm', participantIds: ['miguel', 'atlas'] }),
  })
  const open = page({ id: 'open', title: 'Cardápio', body: 'Pão na chapa.' })
  expect(brainSearch(personaA, [dm, open], { text: 'pão' }).hits.map(hit => hit.id)).toEqual(['open'])
  expect(brainSearch(personaB, [dm, open], { text: 'segredo' }).hits).toEqual([])
  expect(brainSearch(personaB, [dm, open], { text: 'contadora' }).hits).toEqual([])
  expect(() => { brainRead(personaB, [dm], 'dm1') }).toThrow('ACL_DENIED')
  const read = brainRead(personaA, [dm, open], 'dm1', 2)
  expect(read.page.id).toBe('dm1')
  expect(read.hops[0]?.id).toBe('dm1')
})

it('brain_read walks links and stops at an unreadable neighbor', () => {
  const root = page({ id: 'root', title: 'Empresa', body: 'Padaria', links: ['secret'] })
  const secret = page({
    id: 'secret',
    title: 'Privado',
    body: 'só o dono',
    visibility: { kind: 'members', memberIds: ['miguel'] },
  })
  const hops = brainRead(personaA, [root, secret], 'root', 4).hops
  expect(hops.map(hop => hop.id)).toEqual(['root'])
})

it('brain_propose refuses unreadables; requireds need accept before apply', () => {
  const rule = page({
    id: 'r1',
    kind: 'rule',
    title: 'Preço',
    body: 'Nunca inventar.',
    required: true,
  })
  expect(() => { brainPropose(personaB, { ...rule, visibility: { kind: 'members', memberIds: ['atlas'] } }, { body: 'x' }) })
    .toThrow('ACL_DENIED')
  const proposal = brainPropose(personaA, rule, { body: 'Nunca inventar preço.' })
  expect(proposal.needsAccept).toBe(true)
  expect(() => { applyBrainPropose(personaA, rule, proposal, false, now) }).toThrow('INVALID_BRAIN')
  const applied = applyBrainPropose(owner, rule, proposal, true, now)
  expect(applied.page.body).toBe('Nunca inventar preço.')
  expect(applied.page.revision).toBe(2)
})

it('compileContext lists required brain rules and omits pages the actor cannot read', async () => {
  const rule = page({
    id: 'r1',
    kind: 'rule',
    title: 'Preço',
    body: 'Nunca inventar preço.',
    required: true,
  })
  const hidden = page({
    id: 'hid',
    kind: 'rule',
    title: 'DM',
    body: 'Segredo.',
    required: true,
    visibility: { kind: 'members', memberIds: ['miguel'] },
  })
  const snap = brainSnapshot([rule, hidden], 'launch', 'rev-1', personaA)
  expect(snap.requiredIds).toEqual(['r1'])
  expect(snap.records.map(row => row.id)).toEqual(['r1'])
  const compiled = await compileBrainContext({
    pages: [rule, hidden],
    snapshotRevision: 'rev-1',
    actor: personaA,
    scope: {
      workspaceId: 'ws',
      projectId: 'launch',
      agentId: 'atlas',
      actorId: 'atlas',
      audienceId: 'channel:geral',
      policyRevision: 'p1',
    },
    budgetTokens: 2000,
    countTokens: text => text.length,
    authorize: () => Promise.resolve(true),
  })
  expect(compiled.manifest.requiredIds).toEqual(['r1'])
  expect(compiled.text).toContain('Nunca inventar preço.')
  expect(compiled.text).not.toContain('Segredo.')
})

it('exports markdown with [[links]] and reimports the same id without a new page', () => {
  const source = page({ id: 'c1', links: ['r1'], title: 'Padaria Lua' })
  const md = brainPageToMarkdown(source)
  expect(md).toContain('kind: company')
  expect(md).toContain('[[r1]]')
  const back = markdownToBrainPage(md)
  expect(back.id).toBe('c1')
  expect(back.links).toEqual(['r1'])
  expect(back.body).toContain('Pão e café')
})

it('copies a Cofre record onto a page and leaves the vault row intact', () => {
  const record: VaultRecord = {
    id: 'v1',
    workspaceId: 'ws',
    kind: 'constraint',
    body: 'Nunca inventar preço.',
    status: 'active',
    sourceIds: [],
    authorId: 'miguel',
    visibility: { kind: 'workspace' },
    createdAt: '2026-11-03T13:00:00Z',
    revision: 3,
  }
  const copied = vaultRecordToBrainPage(record, now)
  expect(copied.id).toBe('brain-vault-v1')
  expect(copied.kind).toBe('rule')
  expect(copied.required).toBe(true)
  expect(copied.sources).toEqual([{ kind: 'vault', id: 'v1' }])
  expect(record.id).toBe('v1')
})

it('exports an Obsidian pack one-way and skips a file whose hash already exists', () => {
  const pack = exportBrainVault([
    page({ id: 'c1', kind: 'company', title: 'Padaria Lua', links: ['r1'] }),
    page({ id: 'gone', status: 'replaced', title: 'Velho' }),
  ])
  expect(pack.mode).toBe('one_way')
  expect(pack.files.some(file => file.path === 'Comece aqui.md')).toBe(true)
  expect(pack.files.some(file => file.path === 'company/c1.md')).toBe(true)
  expect(pack.files.some(file => file.path === 'company/gone.md')).toBe(false)
  const hashes = new Set(pack.files.map(file => file.hash))
  expect(shouldImportVaultFile(hashes, pack.files[0]!)).toBe(false)
  expect(shouldImportVaultFile(hashes, { hash: 'new-file' })).toBe(true)
  expect(leftoverDestFiles(['keep.md', 'empresa.md', '../x.md'], ['empresa.md'])).toEqual(['keep.md'])
  const planned = planBrainVaultExport([
    page({ id: 'c1', kind: 'company', title: 'Padaria Lua', links: ['r1'] }),
  ], ['keep.md', 'company/c1.md'])
  expect(planned.pack.mode).toBe('one_way')
  expect(planned.leftover).toEqual(['keep.md'])
})
