/**
 * The host acts on what the router decides: every suggestion the empty DM offers, sent on #geral as the person would,
 * becomes a Ticket when it asks for work and stays a conversation (a reply, no Ticket) when it asks a question.
 * The lane of each suggestion is pinned in `persona-engine/tests/wants-work-suggestions.spec.ts`; this proves the
 * host follows it end to end (D-073, Atlas).
 */
import { readFileSync } from 'node:fs'
import { wantsWork } from '@deepseek-ai/dsh-persona-engine'
import { expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()
const CLOCK = '2026-11-04T15:00:00.000Z'

function seed(h: PersonaHost): void {
  h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
  h.createWorkspace({ id: 'ws', name: 'Padaria', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createPersona({
    workspaceId: 'ws', projectId: 'pp', id: 'atlas', name: 'Atlas', title: 'Coordenação',
    description: 'Coordena.', personality: 'Calmo.', instructions: 'Despache.',
    avatarKind: 'gallery', avatarRef: 'atlas', runnerKind: 'dsh', runnerCli: '',
    runnerModel: 'm', canRecruit: false, createdBy: 'ana', systemRoles: ['coordination'],
  })
  h.createPersona({
    workspaceId: 'ws', projectId: 'pp', id: 'bento', name: 'Bento', title: 'Engenharia',
    description: 'Implementa.', personality: 'Direto.', instructions: 'Prove.',
    avatarKind: 'gallery', avatarRef: 'bento', runnerKind: 'dsh', runnerCli: '',
    runnerModel: 'm', canRecruit: true, createdBy: 'ana',
  })
  h.createChannel({ id: 'geral', workspaceId: 'ws', projectId: 'pp', name: 'geral', topic: '' })
}

const CHIPS = (JSON.parse(readFileSync(new URL('../../client-ui-persona/locale-sources/chat.pt.json', import.meta.url), 'utf8')) as Record<string, string>)

it('a work suggestion becomes a Ticket and a question suggestion stays a conversation', async () => {
  const h = host()
  seed(h)
  const keys = Object.keys(CHIPS).filter(key => key.startsWith('dm.suggest.') && key !== 'dm.suggestTitle')
  expect(keys.length).toBeGreaterThanOrEqual(18)
  let tickets = 0
  const seen: { text: string; lane: string }[] = []
  for (const [index, key] of keys.entries()) {
    const text = CHIPS[key]!
    const id = `chip-${String(index)}`
    // One channel per suggestion: a later line in the SAME channel is a follow-up of the live Task, not a new Ticket.
    const channel = `c${String(index)}`
    h.createChannel({ id: channel, workspaceId: 'ws', projectId: 'pp', name: channel, topic: '' })
    h.postMessage({
      id, workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: channel,
      body: text, actorId: 'ana', subjectId: `s-${String(index)}`, occurredAt: CLOCK,
    })
    await h.orchestration.flush('pp')
    const now = h.listTasks({ workspaceId: 'ws', projectId: 'pp' }).length
    const work = wantsWork(text)
    expect(now - tickets, `${key}: ${text}`).toBe(work ? 1 : 0)
    tickets = now
    seen.push({ text, lane: work ? 'ticket' : 'conversa' })
  }
  expect(seen.filter(row => row.lane === 'ticket').length).toBeGreaterThan(8)
  expect(seen.filter(row => row.lane === 'conversa').length).toBeGreaterThan(4)
  // the ones the old rule got wrong
  expect(seen.find(row => row.text.startsWith('Pesquise 3 concorrentes'))?.lane).toBe('ticket')
  expect(seen.find(row => row.text.startsWith('O que você pode fazer por mim'))?.lane).toBe('conversa')
  expect(seen.find(row => row.text.startsWith('Quem está livre'))?.lane).toBe('conversa')
}, 120_000)
