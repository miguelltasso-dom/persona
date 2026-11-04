import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect } from 'vitest'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()
const scope = { workspaceId: 'ws', projectId: 'pp' } as const

it('distinct ids with the same title coexist and preserve their separate bodies and audiences', () => {
  const h = seed()
  const first = h.putBrainPage({ ...scope, id: 'public-a', kind: 'learning', title: 'Mesmo título', body: 'Conteúdo público.',
    editorKind: 'person', editorId: 'ana', visibility: 'workspace' })
  const second = h.putBrainPage({ ...scope, id: 'private-b', kind: 'learning', title: 'Mesmo título', body: 'Conteúdo privado.',
    editorKind: 'person', editorId: 'ana', visibility: 'members', memberIds: ['ana'] })
  expect(first.id).toBe('public-a')
  expect(second.id).toBe('private-b')
  expect(second.slug).not.toBe(first.slug)
  expect(h.getBrainPage({ ...scope, pageId: first.id })).toMatchObject({ body: 'Conteúdo público.', audience: 'workspace' })
  expect(h.getBrainPage({ ...scope, pageId: second.id })).toMatchObject({ body: 'Conteúdo privado.', audience: 'private', restricted: false })
  h.putBrainPage({ ...scope, id: second.id, kind: 'learning', title: second.title, body: 'Edição ainda privada.',
    editorKind: 'person', editorId: 'ana' })
  expect(h.brain.brain.get(second.id)?.visibility).toEqual({ kind: 'members', memberIds: ['ana'] })
  expect(h.getBrainPage({ ...scope, pageId: first.id }).body).toBe('Conteúdo público.')
})

it('the owner index never includes a persona-only title or body', () => {
  const h = seed()
  h.putBrainPage({ ...scope, id: 'persona-only', kind: 'learning', title: 'Segredo persona SBGES', body: 'Memória só da persona.',
    editorKind: 'person', editorId: 'ana', visibility: 'persona', personaId: 'atendimento' })
  const home = h.getBrainHome(scope)
  expect(h.getBrainPage({ ...scope, pageId: home.startHereId }).body).not.toContain('Segredo persona SBGES')
  expect(JSON.stringify(home)).not.toContain('Segredo persona SBGES')
  expect(h.listBrainPages(scope).some(page => page.id === 'persona-only')).toBe(false)
  expect(() => h.getBrainPage({ ...scope, pageId: 'persona-only' })).toThrow('forbidden')
})

it('two-way imports an edited exported note before writing and preserves the private audience', () => {
  const h = seed()
  const page = h.putBrainPage({ ...scope, id: 'private-edited', kind: 'learning', title: 'Acordo privado', body: 'Texto inicial.',
    editorKind: 'person', editorId: 'ana', visibility: 'members', memberIds: ['ana'] })
  const folderPath = mkdtempSync(join(tmpdir(), 'persona-brain-two-way-'))
  h.exportBrainVault({ ...scope, folderPath })
  const file = join(folderPath, 'learning', `${page.slug}.md`)
  writeFileSync(file, readFileSync(file, 'utf8').replace('Texto inicial.', 'Texto alterado fora do app.'), 'utf8')
  h.importBrainVault({ ...scope, folderPath })
  expect(h.getBrainPage({ ...scope, pageId: page.id }).body).toContain('Texto alterado fora do app.')
  expect(h.brain.brain.get(page.id)?.visibility).toEqual({ kind: 'members', memberIds: ['ana'] })
  expect(h.listBrainVersions({ ...scope, pageId: page.id })).toHaveLength(2)
  h.importBrainVault({ ...scope, folderPath })
  expect(h.listBrainVersions({ ...scope, pageId: page.id })).toHaveLength(2)
})

it('two-way cannot update a private note belonging to another reader through a matching exported slug', () => {
  const h = seed()
  h.createMember({ id: 'bia', workspaceId: 'ws', projectId: 'pp', displayName: 'Bia', handle: 'bia', role: 'member' })
  h.createProject({ id: 'shared', workspaceId: 'ws', name: 'Projeto', description: '' })
  const shared = { workspaceId: 'ws', projectId: 'shared' }
  const page = h.putBrainPage({ ...shared, id: 'private-other', kind: 'learning', title: 'Segredo da Ana', body: 'Somente Ana.',
    editorKind: 'person', editorId: 'ana', visibility: 'members', memberIds: ['ana'] })
  const folderPath = mkdtempSync(join(tmpdir(), 'persona-brain-foreign-import-'))
  h.exportBrainVault({ ...shared, folderPath })
  const file = join(folderPath, 'learning', `${page.slug}.md`)
  const external = readFileSync(file, 'utf8').replace('Somente Ana.', 'Tentativa de substituir.')
  writeFileSync(file, external, 'utf8')
  h.sessionMemberId = 'bia'
  h.importBrainVault({ ...shared, folderPath })
  expect(h.brain.brain.get(page.id)?.body).toBe('Somente Ana.')
  expect(h.brain.brain.get(page.id)?.visibility).toEqual({ kind: 'members', memberIds: ['ana'] })
  expect(readFileSync(file, 'utf8')).toBe(external)
})

function seed() {
  const h = host()
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({
    id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner',
  })
  h.createMember({
    id: 'cia', workspaceId: 'ws', projectId: 'pp', displayName: 'Cia', handle: 'cia', role: 'guest',
  })
  h.sessionMemberId = 'ana'
  return h
}

it('puts markdown as source, indexes FTS/type/links, and keeps every version', () => {
  const h = seed()
  const first = h.putBrainPage({
    ...scope, id: 'p-tom', kind: 'company', title: 'Tom de voz',
    body: 'Fale calmo. Ver [[Clientes]] e [[regras]].',
    editorKind: 'person', editorId: 'ana',
  })
  expect(first.slug).toBe('tom-de-voz')
  expect([...first.links].sort()).toEqual(['clientes', 'regras'])
  expect(first.revision).toBe(1)
  expect(h.searchBrainPages({ ...scope, query: 'calmo' })[0]?.id).toBe('p-tom')
  expect(h.listBrainPages({ ...scope, kind: 'company' }).map(item => item.id)).toContain('p-tom')
  const second = h.putBrainPage({
    ...scope, id: 'p-tom', kind: 'company', title: 'Tom de voz',
    body: 'Fale calmo e direto.',
    editorKind: 'persona', editorId: 'nina',
  })
  expect(second.revision).toBe(2)
  expect(second.editorHint).toBe('persona:nina')
  const versions = h.listBrainVersions({ ...scope, pageId: 'p-tom' })
  expect(versions.map(item => item.revision)).toEqual([2, 1])
  expect(versions[1]?.editorKind).toBe('person')
  expect(h.getBrainPage({ ...scope, pageId: 'p-tom' }).body).toBe('Fale calmo e direto.')
  const restored = h.restoreBrainPage({ ...scope, pageId: 'p-tom', revision: 1 })
  expect(restored.revision).toBe(3)
  expect(restored.body).toContain('[[Clientes]]')
  expect(h.listBrainVersions({ ...scope, pageId: 'p-tom' }).map(item => item.revision)).toEqual([3, 2, 1])
})

it('lists what changed today, builds Comece aqui, and hides persona-only pages', () => {
  const h = seed()
  h.putBrainPage({
    ...scope, id: 'p-cli', kind: 'client', title: 'Padaria Lua',
    body: 'Cliente ativo.', editorKind: 'person', editorId: 'ana',
  })
  h.putBrainPage({
    ...scope, id: 'p-priv', kind: 'learning', title: 'Segredo da nina',
    body: 'fato privado da nina', editorKind: 'person', editorId: 'ana',
    visibility: 'persona', personaId: 'nina',
  })
  expect(h.listBrainChangedToday(scope).map(item => item.id)).toContain('p-cli')
  expect(h.listBrainChangedToday(scope).map(item => item.id)).not.toContain('p-priv')
  expect(h.listBrainPages(scope).map(item => item.id)).not.toContain('p-priv')
  expect(() => h.getBrainPage({ ...scope, pageId: 'p-priv' })).toThrow(/forbidden/)
  const home = h.getBrainHome(scope)
  expect(home.startHereId).toBeDefined()
  expect(home.changedToday.map(item => item.id)).toContain('p-cli')
  expect(h.getBrainPage({ ...scope, pageId: home.startHereId }).body).toMatch(/Padaria Lua/)
  expect(h.getBrainHome(scope).startHereId).toBe(home.startHereId)
})

it('grants exact-scope permission, records use, and revokes immediately', () => {
  const h = seed()
  const grant = h.grantBrainPermission({
    ...scope, id: 'g1', personaId: 'nina',
    action: 'reply-whatsapp', target: 'clientes-aprovados', validity: 'until-revoke',
  })
  expect(h.getBrainPage({ ...scope, pageId: grant.pageId }).kind).toBe('permission')
  expect(h.listBrainPermissions(scope).map(item => item.id)).toEqual(['g1'])
  expect(h.getBrainHome(scope).activeGrants.map(item => item.id)).toContain('g1')
  const used = h.useBrainPermission({
    ...scope, grantId: 'g1', personaId: 'nina',
    action: 'reply-whatsapp', target: 'clientes-aprovados',
  })
  expect(used.useCount).toBe(1)
  expect(() => h.useBrainPermission({
    ...scope, grantId: 'g1', personaId: 'nina',
    action: 'reply-whatsapp', target: 'todos',
  })).toThrow(/forbidden/)
  expect(() => h.useBrainPermission({
    ...scope, grantId: 'g1', personaId: 'sol',
    action: 'reply-whatsapp', target: 'clientes-aprovados',
  })).toThrow(/forbidden/)
  expect(h.revokeBrainPermission({ ...scope, grantId: 'g1' }).revokedAt).toBeDefined()
  expect(() => h.useBrainPermission({
    ...scope, grantId: 'g1', personaId: 'nina',
    action: 'reply-whatsapp', target: 'clientes-aprovados',
  })).toThrow(/forbidden/)
  expect(h.getBrainPage({ ...scope, pageId: grant.pageId }).kind).toBe('permission')
  h.sessionMemberId = 'cia'
  expect(() => h.grantBrainPermission({
    ...scope, id: 'g2', personaId: 'nina',
    action: 'reply-whatsapp', target: 'clientes-aprovados', validity: 'once',
  })).toThrow(/forbidden/)
})

it('exports readable markdown one-way and reimports without duplicates', () => {
  const h = seed()
  h.putBrainPage({
    ...scope, id: 'p-regra', kind: 'rule', title: 'Nunca senha',
    body: 'Nunca pedir senha.', editorKind: 'person', editorId: 'ana',
  })
  const dir = mkdtempSync(join(tmpdir(), 'persona-brain-host-'))
  const exported = h.exportBrainVault({ ...scope, folderPath: dir })
  expect(exported.direction).toBe('export')
  expect(exported.files).toBeGreaterThan(0)
  expect(exported.created).toBe(0)
  const md = readFileSync(join(dir, 'rule', 'nunca-senha.md'), 'utf8')
  expect(md).toMatch(/Nunca pedir senha/)
  expect(md).toMatch(/^---/u)
  const again = h.importBrainVault({ ...scope, folderPath: dir })
  expect(again.direction).toBe('import')
  expect(again.skipped).toBeGreaterThan(0)
  mkdirSync(join(dir, 'learning'), { recursive: true })
  writeFileSync(join(dir, 'learning', 'nova.md'), '---\nkind: learning\ntitle: Extra\nslug: extra\n---\nFato novo.\n', 'utf8')
  writeFileSync(join(dir, 'diario.md'), 'Nota solta do Obsidian.\n', 'utf8')
  const added = h.importBrainVault({ ...scope, folderPath: dir })
  expect(added.created).toBe(1)
  expect(added.leftover.some(path => path.endsWith('diario.md'))).toBe(true)
  expect(h.getBrainHome(scope).leftover.some(path => path.endsWith('diario.md'))).toBe(true)
  expect(h.listBrainPages({ ...scope, kind: 'learning' }).some(item => item.body.includes('Fato novo'))).toBe(true)
  expect(h.brain.lastForeignPreview?.proposals.some(row => row.body.includes('Nota solta'))).toBe(true)
})
