import { afterEach, expect, it } from 'vitest'
import { createMemoryCipher, createPersonaVault, CofreSecrets } from '@deepseek-ai/dsh-persona-vault'
import { ProductRepos, ScreenRepos, VaultRepos, openTempStore, type TempStore } from '@deepseek-ai/dsh-persona-store'
import { CofreEntries } from '../src/cofre-entries.ts'
import { CofreImport } from '../src/cofre-import.ts'

const temps: TempStore[] = []
afterEach(async () => {
  await Promise.all(temps.splice(0).map(temp => temp.dispose()))
})

async function cofre(): Promise<{ import: CofreImport; entries: CofreEntries; secrets: CofreSecrets }> {
  const handle = await openTempStore()
  temps.push(handle)
  const product = new ProductRepos(handle.store)
  product.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  const secrets = new CofreSecrets(createPersonaVault(createMemoryCipher()))
  const entries = new CofreEntries({
    screens: new ScreenRepos(handle.store),
    vault: new VaultRepos(handle.store),
    secrets,
    workspaceOf: () => 'ws',
    now: () => '2026-11-03T15:00:00.000Z',
  })
  return { import: new CofreImport({ entries }), entries, secrets }
}

const CHROME = [
  'name,url,username,password,note',
  'Portal da Receita,https://www.receita.gov.br/login,ana@padaria,senha-1,',
  'Já no Cofre,https://existe.com,ana,senha-2,',
  'Sem senha,https://sem.com,ana,,',
].join('\r\n')

it('previews the Chrome export: what enters, what is already in the Cofre and what was ignored', async () => {
  const { import: importer, entries } = await cofre()
  await entries.saveLogin({ projectId: 'pp', authorId: 'ana', site: 'https://existe.com', username: 'ana', password: 'antiga' })
  const preview = importer.preview('pp', CHROME)
  expect(preview.format).toBe('chrome')
  expect(preview.entries.map(entry => entry.title)).toEqual(['Portal da Receita'])
  expect(preview.duplicates.map(entry => entry.reason)).toEqual(['no-cofre'])
  expect(preview.ignored).toEqual([{ line: 4, reason: 'A linha não tem senha.' }])
  expect(JSON.stringify(preview)).not.toContain('senha-1')
  expect(JSON.stringify(preview)).not.toContain('senha-2')
})

it('commits only the new rows and seals their passwords', async () => {
  const { import: importer, entries, secrets } = await cofre()
  await entries.saveLogin({ projectId: 'pp', authorId: 'ana', site: 'https://existe.com', username: 'ana', password: 'antiga' })
  const result = await importer.commit('pp', 'ana', CHROME)
  expect(result).toEqual({ imported: 1, duplicates: 1, ignored: 1 })
  const saved = entries.list('pp').find(entry => entry.title === 'Portal da Receita')
  expect(saved?.kind).toBe('login')
  expect(await secrets.read('pp', saved?.id ?? '')).toBe('senha-1')
})

it('reads the Bitwarden export, ignores non-login rows and keeps quoted commas', async () => {
  const { import: importer, entries, secrets } = await cofre()
  const csv = [
    'folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp',
    'Trabalho,,login,"Banco, agência 1",,,"0",https://banco.com.br,ana,senha-banco,',
    'Trabalho,,note,Lembrete,,,0,,,',
  ].join('\n')
  const preview = importer.preview('pp', csv)
  expect(preview.format).toBe('bitwarden')
  expect(preview.entries).toEqual([{ line: 2, title: 'Banco, agência 1', site: 'https://banco.com.br', username: 'ana' }])
  expect(preview.ignored).toEqual([{ line: 3, reason: 'A linha não é um login (nota, cartão ou identidade).' }])
  await importer.commit('pp', 'ana', csv)
  const saved = entries.list('pp')[0]
  expect(saved?.title).toBe('Banco, agência 1')
  expect(await secrets.read('pp', saved?.id ?? '')).toBe('senha-banco')
})

it('marks a row repeated inside the file and a file it does not recognise', async () => {
  const { import: importer } = await cofre()
  const repeated = [
    'name,url,username,password',
    'Um,https://a.com,ana,1',
    'Dois,https://www.a.com,ana,2',
  ].join('\n')
  expect(importer.preview('pp', repeated).duplicates).toEqual([
    { line: 3, title: 'Dois', site: 'https://www.a.com', username: 'ana', reason: 'no-arquivo' },
  ])
  const unknown = importer.preview('pp', 'a,b,c\n1,2,3')
  expect(unknown.format).toBe('desconhecido')
  expect(unknown.entries).toEqual([])
  expect(unknown.ignored[0]?.reason).toBe('O arquivo não parece ser do Chrome nem do Bitwarden.')
  expect(await importer.commit('pp', 'ana', 'a,b,c\n1,2,3')).toEqual({ imported: 0, duplicates: 0, ignored: 1 })
})
