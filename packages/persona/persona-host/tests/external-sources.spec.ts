import { expect } from 'vitest'
import {
  SOURCE_REQUEST_CAP,
  VAULT_CALDAV,
  VAULT_DISCORD,
  VAULT_IMAP,
  VAULT_SLACK,
  VAULT_TELEGRAM,
} from '@deepseek-ai/dsh-persona-runners'
import type { SecretVault } from '../src/external-sources.ts'
import PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()
const TOKEN = 'secret-token-never-log'
const ICS = [
  'BEGIN:VCALENDAR',
  'BEGIN:VEVENT',
  'UID:evt-1',
  'SUMMARY:Standup',
  'DTSTART:20261103T150000Z',
  'DESCRIPTION:daily',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\n')

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({
    id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner',
  })
  h.createPersona({
    workspaceId: 'ws', projectId: 'pp', id: 'coord', name: 'Guia', title: 'Coordenação',
    description: 'Triagem.', personality: 'Calma.', instructions: 'Aceite pedidos claros.',
    avatarKind: 'gallery', avatarRef: 'guia', runnerKind: 'dsh', runnerCli: '',
    runnerModel: 'm', canRecruit: true, createdBy: 'ana',
  })
  h.createChannel({ id: 'geral', workspaceId: 'ws', projectId: 'pp', name: 'geral', topic: '' })
}

function vaultOf(entries: Record<string, string>): SecretVault {
  return {
    get: async (personId, provider) => entries[`${personId}:${provider}`],
  }
}

function fakeFetch(): { fetch: typeof fetch; calls: string[] } {
  const calls: string[] = []
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push(`${init?.method ?? 'GET'} ${url}`)
    if (url.includes('/getUpdates')) {
      return new Response(JSON.stringify({
        ok: true,
        result: [{
          update_id: 1,
          message: {
            message_id: 8,
            date: 1_700_000_100,
            text: 'preciso de um README',
            chat: { id: 11, type: 'private' },
            from: { id: 5, is_bot: false },
          },
        }],
      }), { status: 200 })
    }
    if (url.includes('/sendMessage') || url.includes('/chat.postMessage')) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }
    if (url.includes('/conversations.history')) {
      return new Response(JSON.stringify({
        messages: [{ user: 'U1', text: 'standup', ts: '1.0' }],
      }), { status: 200 })
    }
    if (url.includes('/channels/') && (init?.method ?? 'GET') === 'GET') {
      return new Response(JSON.stringify([{
        id: 'm1', content: 'ping', channel_id: 'D1', author: { id: 'u1' },
      }]), { status: 200 })
    }
    if (url.includes('/channels/') && init?.method === 'POST') {
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }
    if (url.includes('cal.ics')) {
      return new Response(ICS, { status: 200, headers: { 'content-type': 'text/calendar' } })
    }
    return new Response('', { status: 404 })
  }) as typeof fetch
  return { fetch: fetchImpl, calls }
}

function wire(h: PersonaHost, fetchImpl: typeof fetch, tokens: Record<string, string> = {
  [`ana:${VAULT_TELEGRAM}`]: TOKEN,
  [`ana:${VAULT_SLACK}`]: TOKEN,
  [`ana:${VAULT_DISCORD}`]: TOKEN,
  [`ana:${VAULT_CALDAV}`]: TOKEN,
  [`ana:${VAULT_IMAP}`]: TOKEN,
}): void {
  h.external.secrets = vaultOf(tokens)
  h.external.fetchImpl = fetchImpl
  h.external.endpoints = {
    telegram: 'https://tg.test',
    slack: 'https://slack.test',
    slackChannel: 'C1',
    discord: 'https://discord.test',
    discordChannel: 'D1',
    calendar: 'https://cal.test/cal.ics',
  }
  h.external.emailList = async () => [{
    id: 'm2', from: 'bob@ex.test', to: 'nina@ex.test', subject: 'Bug', text: 'quebra o hero',
  }]
  h.external.emailSend = async () => true
}

it('reads the telegram token from the company Cofre and never logs it', async () => {
  const h = host()
  seed(h)
  h.vault.createRecord({
    id: 'v-tg', workspaceId: 'ws', projectId: 'pp', kind: 'memory',
    body: TOKEN, authorId: 'ana', factKey: VAULT_TELEGRAM,
    visibility: { kind: 'workspace' },
  })
  const { fetch, calls } = fakeFetch()
  h.external.fetchImpl = fetch
  h.external.endpoints = { telegram: 'https://tg.test' }
  const first = await h.pollExternal({ workspaceId: 'ws', projectId: 'pp', personId: 'ana' })
  expect(first.results).toEqual(['stored'])
  expect(calls.some(row => row.includes('getUpdates'))).toBe(true)
  expect(JSON.stringify(first)).not.toContain(TOKEN)
})

it('polls fake sources into the engine and skips a missing token', async () => {
  const h = host()
  seed(h)
  const { fetch, calls } = fakeFetch()
  wire(h, fetch)
  const first = await h.pollExternal({ workspaceId: 'ws', projectId: 'pp', personId: 'ana' })
  expect(first.results).toEqual(['stored', 'stored', 'stored', 'stored', 'stored'])
  expect(JSON.stringify(first)).not.toContain(TOKEN)
  const again = await h.pollExternal({ workspaceId: 'ws', projectId: 'pp', personId: 'ana' })
  expect(again.results).toEqual(['duplicate', 'duplicate', 'duplicate', 'duplicate', 'duplicate'])
  expect(calls.some(row => row.includes('getUpdates'))).toBe(true)

  const empty = fakeFetch()
  h.external.secrets = vaultOf({})
  h.external.fetchImpl = empty.fetch
  const skipped = await h.pollExternal({ workspaceId: 'ws', projectId: 'pp', personId: 'ana' })
  expect(skipped.results).toEqual([])
  expect(empty.calls).toEqual([])
})

it('replies on the origin channel and refuses without a token', async () => {
  const h = host()
  seed(h)
  const { fetch, calls } = fakeFetch()
  wire(h, fetch)
  await h.pollExternal({ workspaceId: 'ws', projectId: 'pp', personId: 'ana' })
  const telegram = await h.replyExternal({
    workspaceId: 'ws', projectId: 'pp', personId: 'ana',
    source: 'telegram', text: 'ok', chat: '11',
  })
  expect(telegram.ok).toBe(true)
  expect(calls.some(row => row.includes('sendMessage'))).toBe(true)
  const email = await h.replyExternal({
    workspaceId: 'ws', projectId: 'pp', personId: 'ana',
    source: 'email', text: 'visto', to: 'bob@ex.test', subject: 'Bug',
  })
  expect(email.ok).toBe(true)
  h.external.secrets = vaultOf({})
  const missing = await h.replyExternal({
    workspaceId: 'ws', projectId: 'pp', personId: 'ana',
    source: 'telegram', text: 'ok', chat: '11',
  })
  expect(missing.ok).toBe(false)
  expect(JSON.stringify({ telegram, email, missing })).not.toContain(TOKEN)
})

it('caps a concurrent poll storm so extra fetches never start', async () => {
  const h = host()
  seed(h)
  let live = 0
  let peak = 0
  let started = 0
  const hung: Array<() => void> = []
  const fetchImpl = (async () => {
    started += 1
    live += 1
    peak = Math.max(peak, live)
    await new Promise<void>((resolve) => {
      hung.push(() => {
        live -= 1
        resolve()
      })
    })
    return {
      ok: true,
      json: async () => ({ result: [] }),
    } as Response
  }) as typeof fetch
  h.external.secrets = vaultOf({ [`ana:${VAULT_TELEGRAM}`]: TOKEN })
  h.external.fetchImpl = fetchImpl
  h.external.endpoints = { telegram: 'https://tg.test' }
  const storm = Array.from({ length: 20 }, () => h.pollExternal({
    workspaceId: 'ws', projectId: 'pp', personId: 'ana',
  }))
  await new Promise(resolve => setTimeout(resolve, 20))
  expect(started).toBe(SOURCE_REQUEST_CAP)
  expect(peak).toBe(SOURCE_REQUEST_CAP)
  for (const release of hung) release()
  await Promise.all(storm)
  expect(started).toBe(SOURCE_REQUEST_CAP)
})
