import { expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

/**
 * Cofre v2 (item 15) through the host: the company Ficha needs no encryption and reaches the team as the `brief` record; a Login
 * needs the sealed store and fails loud, with the vault's own actionable message, when the host runs without it.
 */
const { host } = bindHostFile('2026-11-03T15:00:00.000Z')
const scope = { workspaceId: 'ws', projectId: 'pp' }

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...scope, displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.sessionMemberId = 'ana'
}

it('the company Ficha reaches the team as the Cofre brief without any encryption', () => {
  const h = host()
  seed(h)
  const ficha = h.cofre.entries.saveCompany({
    projectId: 'pp',
    authorId: 'ana',
    legalName: 'Padaria Lua Ltda',
    document: '12.345.678/0001-90',
    email: 'contato@padarialua.com.br',
  })
  expect(ficha.kind).toBe('company')
  const brief = h.vault.findActiveFact('pp', 'company.card')
  expect(brief?.kind).toBe('brief')
  expect(brief?.body).toContain('Razão social: Padaria Lua Ltda')
  expect(h.cofre.entries.list('pp')).toHaveLength(1)
})

it('a Login fails loud when the host has no sealed store, and writes nothing', async () => {
  const h = host()
  seed(h)
  await expect(h.cofre.entries.saveLogin({ projectId: 'pp', authorId: 'ana', site: 'x.com', username: 'ana', password: 'p' }))
    .rejects.toMatchObject({ code: 'vault_unavailable' })
  expect(h.cofre.entries.list('pp')).toEqual([])
})

it('the Cofre remotes save the Ficha, list it, preview an import and remove it', async () => {
  const h = host()
  seed(h)
  const saved = h.saveCofreCompany({ ...scope, legalName: 'Padaria Lua Ltda', document: '12.345.678/0001-90' })
  expect(saved.kind).toBe('company')
  expect(h.listCofreEntries(scope).map(entry => entry.title)).toEqual(['Padaria Lua Ltda'])
  const preview = h.previewCofreImport({ ...scope, csv: 'name,url,username,password\nPortal,https://p.com,ana,segredo' })
  expect(preview.entries).toHaveLength(1)
  expect(JSON.stringify(preview)).not.toContain('segredo')
  await h.removeCofreEntry({ ...scope, id: saved.id })
  expect(h.listCofreEntries(scope)).toEqual([])
  expect(h.vault.findActiveFact('pp', 'company.card')).toBeUndefined()
})

it('a Login remote refuses without the sealed store; the code list still answers', async () => {
  const h = host()
  seed(h)
  await expect(h.saveCofreLogin({ ...scope, site: 'x.com', username: 'ana', password: 'p' }))
    .rejects.toMatchObject({ code: 'vault_unavailable' })
  expect(h.listCofreEntries(scope)).toEqual([])
  expect(h.listCofreCodes(scope)).toEqual([])
})
