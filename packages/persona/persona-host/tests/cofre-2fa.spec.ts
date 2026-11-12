import { afterEach, expect, it } from 'vitest'
import { createMemoryCipher, createPersonaVault, CofreSecrets } from '@deepseek-ai/dsh-persona-vault'
import { ScreenRepos, openTempStore, type TempStore } from '@deepseek-ai/dsh-persona-store'
import { CofreCodes } from '../src/cofre-2fa.ts'

const temps: TempStore[] = []
afterEach(async () => {
  await Promise.all(temps.splice(0).map(temp => temp.dispose()))
})

async function codes(): Promise<{ codes: CofreCodes; secrets: CofreSecrets; clock: { at: number } }> {
  const handle = await openTempStore()
  temps.push(handle)
  const clock = { at: Date.parse('2026-11-03T15:00:00.000Z') }
  const secrets = new CofreSecrets(createPersonaVault(createMemoryCipher()))
  const book = new CofreCodes({
    screens: new ScreenRepos(handle.store),
    secrets,
    now: () => new Date(clock.at).toISOString(),
    newId: () => 'c1',
  })
  return { codes: book, secrets, clock }
}

it('opens a request that waits for the owner and never carries the digits', async () => {
  const { codes: book } = await codes()
  const request = book.open({ projectId: 'pp', personaId: 'p1', reason: 'O site mandou um código por WhatsApp.', ticketId: 't1' })
  expect(request.state).toBe('pending')
  expect(request.expiresAt).toBe('2026-11-03T15:10:00.000Z')
  expect(Object.keys(request).sort()).toEqual(['createdAt', 'expiresAt', 'id', 'personaId', 'projectId', 'reason', 'state', 'ticketId'])
  expect(JSON.stringify(book.list('pp'))).not.toContain('123456')
})

it('seals the six digits the owner fills and hands them over exactly once', async () => {
  const { codes: book, secrets } = await codes()
  const request = book.open({ projectId: 'pp', personaId: 'p1', reason: 'Código do banco.' })
  const filled = await book.fill('pp', request.id, '123456')
  expect(filled.state).toBe('filled')
  expect(await secrets.read('pp', `code:${request.id}`)).toBe('123456')
  expect(await book.take('pp', request.id)).toBe('123456')
  expect(await book.take('pp', request.id)).toBeUndefined()
  expect(book.get('pp', request.id)?.state).toBe('taken')
  expect(await secrets.read('pp', `code:${request.id}`)).toBeUndefined()
})

it('refuses a code that is not six digits and a request filled twice', async () => {
  const { codes: book } = await codes()
  const request = book.open({ projectId: 'pp', personaId: 'p1', reason: 'Código do banco.' })
  await expect(book.fill('pp', request.id, '12345')).rejects.toThrow('O código tem 6 números')
  await expect(book.fill('pp', request.id, 'abcdef')).rejects.toThrow('O código tem 6 números')
  await book.fill('pp', request.id, '123456')
  await expect(book.fill('pp', request.id, '654321')).rejects.toThrow('Este código já foi preenchido')
})

it('expires a request that nobody filled and refuses a cancelled one', async () => {
  const { codes: book, clock } = await codes()
  const request = book.open({ projectId: 'pp', personaId: 'p1', reason: 'Código do banco.' })
  clock.at += 11 * 60_000
  expect(book.get('pp', request.id)?.state).toBe('expired')
  await expect(book.fill('pp', request.id, '123456')).rejects.toThrow('expirou')
  const other = book.open({ projectId: 'pp', personaId: 'p1', reason: 'Outro código.' })
  book.cancel('pp', other.id)
  await expect(book.fill('pp', other.id, '123456')).rejects.toThrow('cancelado')
})
