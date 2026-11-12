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

// ── Carbon P1-04 (colheita snapshot 1): the sealed digits never outlive what the owner meant ────────────────────────────────────────────────────

it('P1-04: cancelling a request that was already filled drops the sealed digits (they were never taken)', async () => {
  const { codes: book, secrets } = await codes()
  const request = book.open({ projectId: 'pp', personaId: 'p1', reason: 'Código do banco.' })
  await book.fill('pp', request.id, '123456')
  expect(await secrets.read('pp', `code:${request.id}`)).toBe('123456')
  await book.cancel('pp', request.id)
  expect(book.get('pp', request.id)?.state).toBe('cancelled')
  expect(await secrets.read('pp', `code:${request.id}`)).toBeUndefined()
})

it('P1-04: a filled code that nobody took expires 10 minutes after it was filled, is never handed over, and its digits are dropped', async () => {
  const { codes: book, secrets, clock } = await codes()
  const request = book.open({ projectId: 'pp', personaId: 'p1', reason: 'Código do banco.' })
  clock.at += 9 * 60_000 // the owner takes her time: the request itself was almost expiring
  await book.fill('pp', request.id, '123456')
  clock.at += 9 * 60_000 // 18 minutes after the request opened, 9 after the fill: still usable
  expect(book.get('pp', request.id)?.state).toBe('filled')
  clock.at += 2 * 60_000 // 11 minutes after the fill
  expect(book.get('pp', request.id)?.state).toBe('expired')
  expect(await book.take('pp', request.id)).toBeUndefined()
  expect(await secrets.read('pp', `code:${request.id}`)).toBeUndefined()
})

it('P1-04: the sweep drops the digits of every filled request that expired and of every cancelled one, and touches nothing else', async () => {
  const handle = await openTempStore()
  temps.push(handle)
  const clock = { at: Date.parse('2026-11-03T15:00:00.000Z') }
  const secrets = new CofreSecrets(createPersonaVault(createMemoryCipher()))
  let next = 0
  const book = new CofreCodes({ screens: new ScreenRepos(handle.store), secrets, now: () => new Date(clock.at).toISOString(), newId: () => `c${String(++next)}` })
  const old = book.open({ projectId: 'pp', personaId: 'p1', reason: 'Código velho.' })
  await book.fill('pp', old.id, '111111')
  clock.at += 20 * 60_000
  const fresh = book.open({ projectId: 'pp', personaId: 'p1', reason: 'Código novo.' })
  await book.fill('pp', fresh.id, '222222')
  expect(await book.sweep('pp')).toBe(1)
  expect(await secrets.read('pp', `code:${old.id}`)).toBeUndefined()
  expect(await secrets.read('pp', `code:${fresh.id}`)).toBe('222222')
  expect(await book.sweep('pp')).toBe(0)
})

it('P1-04: the host is told when the owner filled a request (never the digits), so the persona\'s Task can go on', async () => {
  const handle = await openTempStore()
  temps.push(handle)
  const filled: unknown[] = []
  const book = new CofreCodes({
    screens: new ScreenRepos(handle.store), secrets: new CofreSecrets(createPersonaVault(createMemoryCipher())), newId: () => 'c1',
    onFilled: (view) => { filled.push(view) },
  })
  const request = book.open({ projectId: 'pp', personaId: 'p1', ticketId: 't1', reason: 'Código do banco.', site: 'Banco' })
  await book.fill('pp', request.id, '123456')
  expect(filled).toHaveLength(1)
  expect(filled[0]).toMatchObject({ id: request.id, ticketId: 't1', site: 'Banco', state: 'filled' })
  expect(JSON.stringify(filled)).not.toContain('123456')
})

it('P1-04: the persona\'s Task finds its own filled request (and nobody else\'s), reads the digits without spending them, and spends them once typed', async () => {
  const handle = await openTempStore()
  temps.push(handle)
  let next = 0
  const book = new CofreCodes({ screens: new ScreenRepos(handle.store), secrets: new CofreSecrets(createPersonaVault(createMemoryCipher())), newId: () => `c${String(++next)}` })
  const mine = book.open({ projectId: 'pp', personaId: 'p1', ticketId: 't1', reason: 'Código do banco.', site: 'Banco' })
  const other = book.open({ projectId: 'pp', personaId: 'p2', ticketId: 't2', reason: 'Código da loja.', site: 'Loja' })
  expect(book.filledFor('pp', { personaId: 'p1', ticketId: 't1' })).toBeUndefined() // not filled yet
  await book.fill('pp', other.id, '222222')
  expect(book.filledFor('pp', { personaId: 'p1', ticketId: 't1' })).toBeUndefined() // another persona's code is not hers
  await book.fill('pp', mine.id, '111111')
  expect(book.filledFor('pp', { personaId: 'p1', ticketId: 't1' })).toMatchObject({ id: mine.id, site: 'Banco' })
  expect(book.filledFor('pp', { personaId: 'p1', ticketId: 't9' })).toBeUndefined() // another Task
  expect(await book.peek('pp', mine.id)).toBe('111111')
  expect(await book.peek('pp', mine.id)).toBe('111111') // reading is not spending
  expect(await book.take('pp', mine.id)).toBe('111111')
  expect(book.filledFor('pp', { personaId: 'p1', ticketId: 't1' })).toBeUndefined()
  expect(await book.peek('pp', mine.id)).toBeUndefined()
})
