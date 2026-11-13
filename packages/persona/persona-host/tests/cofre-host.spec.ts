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

it('P0-09: only the workspace OWNER writes secrets to the Cofre: a member is refused before anything is read or sealed', async () => {
  const h = host()
  seed(h)
  h.createMember({ id: 'bia', ...scope, displayName: 'Bia', handle: 'bia', role: 'member' })
  h.sessionMemberId = 'bia'
  const attempts: ReadonlyArray<[string, () => unknown]> = [
    ['saveCofreLogin', () => h.saveCofreLogin({ ...scope, site: 'x.com', username: 'u', password: 'p' })],
    ['saveCofreKey', () => h.saveCofreKey({ ...scope, service: 'x', secret: 's' })],
    ['commitCofreImport', () => h.commitCofreImport({ ...scope, csv: 'name,url,username,password\nPortal,https://p.com,ana,segredo' })],
    ['removeCofreEntry', () => h.removeCofreEntry({ ...scope, id: 'cofre-key-x' })],
  ]
  for (const [name, attempt] of attempts) {
    await expect(Promise.resolve().then(attempt), name).rejects.toThrow('forbidden')
  }
})

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

it('cofreStatus says whether the machine can seal, and a connector slot answers presence without a secret', async () => {
  const h = host()
  seed(h)
  expect(h.cofreStatus(scope)).toEqual({ sealable: false })
  expect(h.connectorSecretState({ ...scope, provider: 'imap' })).toEqual({ hasSecret: false })
  h.mailTarget = async mailHost => mailHost // MH-1: the host of an IMAP secret is resolved before anything is sealed ('x' is no public mail server); here the point is the missing sealed store
  await expect(h.saveConnectorSecret({ ...scope, provider: 'imap', secret: '{"host":"x"}' })).rejects.toMatchObject({ code: 'vault_unavailable' })
})

it('editing a Login without the password keeps the sealed value; a new one still demands it', async () => {
  const h = host()
  seed(h)
  await expect(h.saveCofreLogin({ ...scope, site: 'x.com', username: 'ana' }))
    .rejects.toThrow('Informe a senha do login.')
  // P0-09: an id from the screen must name an entry the Cofre created; one that does not exist is refused (it never creates one).
  await expect(h.saveCofreLogin({ ...scope, site: 'x.com', username: 'ana', id: 'cofre-login-1' }))
    .rejects.toThrow('Esse item não existe mais no Cofre.')
})

it('P0-02: the six digits the owner types are masked in everything the host answers from that moment (typed or with separators), and the Cofre never echoes them', async () => {
  const h = host()
  seed(h)
  const request = h.cofre.codes.open({ projectId: 'pp', personaId: 'p1', reason: 'O banco mandou um código.', site: 'Banco' })
  expect(h.browser.mask.live(Date.now())).toBe(false)
  await h.fillCofreCode({ ...scope, id: request.id, code: '482 913' }).catch((error: unknown) => { void error }) // this host has no sealed store: the digits were still typed by the owner
  expect(h.browser.mask.live(Date.now())).toBe(true)
  const echoed = h.browser.mask.redact('chegou 482 913 e também 482913 e 482-913', Date.now())
  expect(echoed).not.toContain('482913')
  expect(echoed).not.toContain('482 913')
  expect(JSON.stringify(h.listCofreCodes(scope))).not.toContain('482913')
})

it('the code request carries the site the persona named', async () => {
  const h = host()
  seed(h)
  h.cofre.codes.open({ projectId: 'pp', personaId: 'p1', reason: 'O site mandou um código.', site: 'Mercado Livre' })
  expect(h.listCofreCodes(scope).map(request => request.site)).toEqual(['Mercado Livre'])
})
