import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import {
  BrainRepos,
  ProductRepos,
  extractLinks,
  grantAllows,
  openTempStore,
  type TempStore,
} from '../src/index.ts'

const temps: TempStore[] = []
let tick = 0
const now = (): string => {
  tick += 1
  return `2026-11-04T00:${String(tick).padStart(2, '0')}:00.000Z`
}

afterEach(async () => {
  tick = 0
  await Promise.all(temps.splice(0).map(temp => temp.dispose()))
})

async function setup(): Promise<BrainRepos> {
  const handle = await openTempStore()
  temps.push(handle)
  const product = new ProductRepos(handle.store, now)
  product.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  return new BrainRepos(handle.store, now)
}

it('keeps markdown as source, derives links and FTS, and never drops versions', async () => {
  const brain = await setup()
  const first = brain.putPage({
    id: 'p-tom', workspaceId: 'ws', projectId: 'pp', kind: 'company',
    title: 'Tom de voz', body: 'Fale calmo. Ver [[Clientes]] e [[regras]].',
    editorKind: 'person', editorId: 'ana',
  })
  expect(first.slug).toBe('tom-de-voz')
  expect([...first.links].sort()).toEqual(['clientes', 'regras'])
  expect(extractLinks('veja [[Clientes|a lista]]')).toEqual(['clientes'])
  const hit = brain.search('pp', 'calmo')[0]
  expect(hit?.id).toBe('p-tom')
  expect(hit?.kind).toBe('company')
  brain.putPage({
    id: 'p-tom', workspaceId: 'ws', projectId: 'pp', kind: 'company',
    title: 'Tom de voz', body: 'Fale calmo e direto.',
    editorKind: 'persona', editorId: 'nina',
  })
  expect(brain.get('p-tom')?.revision).toBe(2)
  expect(brain.listVersions('p-tom').map(item => item.revision)).toEqual([2, 1])
  expect(brain.listVersions('p-tom')[1]?.body).toContain('Clientes')
  expect(brain.listVersions('p-tom')[0]?.editorKind).toBe('persona')
  expect(brain.get('p-tom')?.body).toBe('Fale calmo e direto.')
})

it('indexes by type, lists what changed today, and builds Comece aqui', async () => {
  const brain = await setup()
  brain.putPage({
    id: 'p-cli', workspaceId: 'ws', projectId: 'pp', kind: 'client',
    title: 'Padaria Lua', body: 'Cliente ativo.',
    editorKind: 'person', editorId: 'ana',
  })
  expect(brain.list('pp', 'client').map(item => item.id)).toEqual(['p-cli'])
  expect(brain.listChangedSince('pp', '2026-11-04T00:00:00.000Z').map(item => item.id)).toContain('p-cli')
  const start = brain.ensureStartHere('ws', 'pp')
  expect(start.slug).toBe('comece-aqui')
  expect(start.body).toMatch(/Padaria Lua/)
  expect(brain.ensureStartHere('ws', 'pp').revision).toBe(start.revision)
})

it('stores a grant, refuses a wider use, and revokes immediately', async () => {
  const brain = await setup()
  const grant = brain.grant({
    id: 'g1', workspaceId: 'ws', projectId: 'pp', grantorId: 'ana',
    personaId: 'nina', action: 'reply-whatsapp', target: 'clientes-aprovados',
    validity: 'until-revoke',
  })
  expect(brain.get(grant.pageId)?.kind).toBe('permission')
  expect(grantAllows(grant, 'nina', 'reply-whatsapp', 'clientes-aprovados', now())).toBe(true)
  expect(grantAllows(grant, 'nina', 'reply-whatsapp', 'todos', now())).toBe(false)
  expect(grantAllows(grant, 'sol', 'reply-whatsapp', 'clientes-aprovados', now())).toBe(false)
  expect(brain.recordUse('g1', 'nina', 'reply-whatsapp', 'todos')).toBeUndefined()
  expect(brain.revoke('g1').revokedAt).toBeDefined()
  expect(grantAllows(brain.getGrant('g1')!, 'nina', 'reply-whatsapp', 'clientes-aprovados', now())).toBe(false)
})

it('exports readable markdown and reimports without duplicates', async () => {
  const brain = await setup()
  brain.putPage({
    id: 'p-regra', workspaceId: 'ws', projectId: 'pp', kind: 'rule',
    title: 'Nunca senha', body: 'Nunca pedir senha.',
    editorKind: 'person', editorId: 'ana',
  })
  const dir = mkdtempSync(join(tmpdir(), 'persona-brain-'))
  expect(brain.exportFolder('pp', dir).files).toBeGreaterThan(0)
  const md = readFileSync(join(dir, 'rule', 'nunca-senha.md'), 'utf8')
  expect(md).toMatch(/Nunca pedir senha/)
  expect(md).toMatch(/^---/u)
  const again = brain.importFolder('ws', 'pp', dir, 'ana')
  expect(again.created).toBe(0)
  expect(again.skipped).toBeGreaterThan(0)
  mkdirSync(join(dir, 'learning'), { recursive: true })
  writeFileSync(join(dir, 'learning', 'nova.md'), '---\nkind: learning\ntitle: Extra\nslug: extra\n---\nFato novo.\n', 'utf8')
  const added = brain.importFolder('ws', 'pp', dir, 'ana')
  expect(added.created).toBe(1)
  expect(brain.bySlug('pp', 'extra')?.body).toMatch(/Fato novo/)
})
