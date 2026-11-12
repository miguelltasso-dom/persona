import { afterEach, expect, it } from 'vitest'
import { createMemoryCipher, createPersonaVault, CofreSecrets } from '@deepseek-ai/dsh-persona-vault'
import { ProductRepos, ScreenRepos, VaultRepos, openTempStore, type TempStore } from '@deepseek-ai/dsh-persona-store'
import { COMPANY_CARD_FACT, COFRE_ENTRY_DOC, CofreEntries } from '../src/cofre-entries.ts'

const temps: TempStore[] = []
afterEach(async () => {
  await Promise.all(temps.splice(0).map(temp => temp.dispose()))
})

async function cofre(): Promise<{ entries: CofreEntries; vault: VaultRepos; screens: ScreenRepos; secrets: CofreSecrets }> {
  const handle = await openTempStore()
  temps.push(handle)
  const product = new ProductRepos(handle.store, () => '2026-11-03T15:00:00.000Z')
  product.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  const screens = new ScreenRepos(handle.store, () => '2026-11-03T15:00:00.000Z')
  const vault = new VaultRepos(handle.store, () => '2026-11-03T15:00:00.000Z')
  const secrets = new CofreSecrets(createPersonaVault(createMemoryCipher()))
  const entries = new CofreEntries({
    screens,
    vault,
    secrets,
    workspaceOf: projectId => (projectId === 'pp' ? 'ws' : undefined),
    now: () => '2026-11-03T15:00:00.000Z',
    newId: () => 'x1',
  })
  return { entries, vault, screens, secrets }
}

it('keeps a Login password sealed and out of the stored document', async () => {
  const { entries, screens, secrets } = await cofre()
  const view = await entries.saveLogin({
    projectId: 'pp', authorId: 'ana', site: 'https://www.portaldaReceita.gov.br/login', username: 'ana@padaria', password: 'senha-secreta',
  })
  expect(view.kind).toBe('login')
  expect(view.title).toBe('portaldareceita.gov.br')
  expect(view.hasSecret).toBe(true)
  expect(await secrets.read('pp', view.id)).toBe('senha-secreta')
  expect(JSON.stringify(screens.get('pp', COFRE_ENTRY_DOC, view.id))).not.toContain('senha-secreta')
  expect(JSON.stringify(entries.list('pp'))).not.toContain('senha-secreta')
})

it('refuses a Login without a password and writes nothing', async () => {
  const { entries } = await cofre()
  await expect(entries.saveLogin({ projectId: 'pp', authorId: 'ana', site: 'x.com', username: 'ana', password: '' }))
    .rejects.toThrow('empty secret')
  expect(entries.list('pp')).toEqual([])
})

it('keeps a Chave secret sealed and reports only its presence', async () => {
  const { entries, secrets } = await cofre()
  const view = await entries.saveKey({ projectId: 'pp', authorId: 'ana', service: 'Stripe', secret: 'sk-live-123' })
  expect(view.title).toBe('Stripe')
  expect(view.hasSecret).toBe(true)
  expect(await secrets.read('pp', view.id)).toBe('sk-live-123')
  expect(entries.get('pp', view.id)?.fields).toEqual({ service: 'Stripe' })
})

it('saves the company Ficha as the brief the team reads, revising one record', async () => {
  const { entries, vault } = await cofre()
  const first = entries.saveCompany({
    projectId: 'pp', authorId: 'ana', legalName: 'Padaria Lua Ltda', document: '12.345.678/0001-90',
    email: 'contato@padarialua.com.br', phone: '(11) 91234-5678', address: 'Rua das Flores, 123',
  })
  expect(first.kind).toBe('company')
  expect(first.hasSecret).toBe(false)
  const brief = vault.findActiveFact('pp', COMPANY_CARD_FACT)
  expect(brief?.kind).toBe('brief')
  expect(brief?.body).toContain('Razão social: Padaria Lua Ltda')
  expect(brief?.body).toContain('CNPJ/CPF: 12.345.678/0001-90')
  entries.saveCompany({
    projectId: 'pp', authorId: 'ana', legalName: 'Padaria Lua Ltda', document: '12345678000190', email: 'novo@padarialua.com.br',
  })
  const revised = vault.findActiveFact('pp', COMPANY_CARD_FACT)
  expect(revised?.id).toBe(brief?.id)
  expect(revised?.revision).toBe(2)
  expect(revised?.body).toContain('E-mail: novo@padarialua.com.br')
  expect(revised?.body).not.toContain('Telefone')
})

it('refuses a Ficha whose document is neither CNPJ nor CPF', async () => {
  const { entries } = await cofre()
  expect(() => entries.saveCompany({ projectId: 'pp', authorId: 'ana', legalName: 'Padaria Lua', document: '123.456.789-0' }))
    .toThrow('O CNPJ tem 14 números e o CPF tem 11')
})

it('removes an entry with its sealed secret and revokes the Ficha brief', async () => {
  const { entries, vault, secrets } = await cofre()
  const login = await entries.saveLogin({ projectId: 'pp', authorId: 'ana', site: 'x.com', username: 'ana', password: 'p' })
  await entries.remove('pp', login.id)
  expect(await secrets.read('pp', login.id)).toBeUndefined()
  expect(entries.list('pp')).toEqual([])
  const company = entries.saveCompany({ projectId: 'pp', authorId: 'ana', legalName: 'Padaria Lua', document: '12345678000190' })
  await entries.remove('pp', company.id)
  expect(vault.findActiveFact('pp', COMPANY_CARD_FACT)).toBeUndefined()
})

it('refuses to save a secret when the vault has no protection', async () => {
  const handle = await openTempStore()
  temps.push(handle)
  const screens = new ScreenRepos(handle.store)
  const entries = new CofreEntries({
    screens,
    vault: new VaultRepos(handle.store),
    secrets: new CofreSecrets(createPersonaVault({
      seal: () => Promise.reject(new Error('sem DPAPI')),
      open: () => Promise.reject(new Error('sem DPAPI')),
    })),
    workspaceOf: () => 'ws',
  })
  await expect(entries.saveLogin({ projectId: 'pp', authorId: 'ana', site: 'x.com', username: 'ana', password: 'p' }))
    .rejects.toThrow('sem DPAPI')
  expect(entries.list('pp')).toEqual([])
})
