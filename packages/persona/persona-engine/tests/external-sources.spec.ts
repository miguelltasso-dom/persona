import { expect, it } from 'vitest'
import {
  CALENDAR_SOURCE,
  DISCORD_SOURCE,
  EMAIL_SOURCE,
  Engine,
  MemoryRepositories,
  SLACK_SOURCE,
  TELEGRAM_SOURCE,
  allExternalSourceScope,
  externalSourceScope,
  originReply,
  receiveExternal,
  receiveExternalBatch,
  type Assessor,
  type EngineOptions,
  type Executor,
  type OutboundMessage,
  type Policy,
  type Trigger,
} from '../src/index.ts'

const NOW = '2026-11-03T15:00:00.000Z'

function telegram(id: string, text: string, human = true): Trigger {
  return {
    id: `tg:${id}`,
    source: TELEGRAM_SOURCE,
    threads: [{ source: TELEGRAM_SOURCE, id: '99' }],
    actor: { source: TELEGRAM_SOURCE, id: '7' },
    human,
    addressed: 'direct',
    at: NOW,
    text,
    channel: {
      source: TELEGRAM_SOURCE,
      thread: '99',
      address: { chat: '99', message: id },
    },
    meta: { username: 'ana' },
  }
}

function email(id: string, text: string): Trigger {
  return {
    id: `mail:${id}`,
    source: EMAIL_SOURCE,
    threads: [{ source: EMAIL_SOURCE, id: 'vaga' }],
    actor: { source: EMAIL_SOURCE, id: 'ana@acme' },
    human: true,
    addressed: 'direct',
    at: NOW,
    text,
    channel: {
      source: EMAIL_SOURCE,
      thread: 'vaga',
      address: { from: 'ana@acme', to: 'equipe@acme', message: id },
    },
    meta: { subject: 'vaga' },
  }
}

function engine(): Engine {
  const repo = new MemoryRepositories()
  const assessor: Assessor = { request: () => {}, release: () => {} }
  const outbox: OutboundMessage[] = []
  const queued: EngineOptions['outbox'] = {
    send: (message) => { if (!outbox.some(item => item.id === message.id)) outbox.push(message) },
    status: id => outbox.some(item => item.id === id) ? 'pending' : undefined,
    withdraw: () => {},
  }
  const policy: Policy = {
    version: 'v1', paused: false, evalTimeoutMs: 60_000,
    gate: trigger => trigger.human
      ? { admissible: true, strength: 'explicit', basis: { via: 'listed' } }
      : { admissible: false, reason: 'not-human' },
    revalidate: () => true,
    admitsInferred: () => true,
  }
  const executor: Executor = { start: () => {}, deliver: () => {}, stop: () => {} }
  return new Engine({
    repo, assessor, executor, outbox: queued, policy: () => policy,
    scope: allExternalSourceScope(),
  })
}

function slack(id: string, text: string, human = true): Trigger {
  return {
    id: `slack:C1:${id}`,
    source: SLACK_SOURCE,
    threads: [{ source: SLACK_SOURCE, id: id }],
    actor: { source: SLACK_SOURCE, id: 'U7' },
    human,
    addressed: 'mention',
    at: NOW,
    text,
    channel: { source: SLACK_SOURCE, thread: id, address: { channel: 'C1', ts: id } },
    meta: {},
  }
}

function discord(id: string, text: string, human = true): Trigger {
  return {
    id: `discord:D1:${id}`,
    source: DISCORD_SOURCE,
    threads: [{ source: DISCORD_SOURCE, id: 'D1' }],
    actor: { source: DISCORD_SOURCE, id: '9' },
    human,
    addressed: 'mention',
    at: NOW,
    text,
    channel: { source: DISCORD_SOURCE, thread: 'D1', address: { channel: 'D1', message: id } },
    meta: { username: 'ana' },
  }
}

function calendar(uid: string, text: string): Trigger {
  return {
    id: `cal:${uid}`,
    source: CALENDAR_SOURCE,
    threads: [{ source: CALENDAR_SOURCE, id: 'standup' }],
    actor: { source: CALENDAR_SOURCE, id: 'calendar' },
    human: false,
    at: NOW,
    text,
    channel: { source: CALENDAR_SOURCE, thread: 'standup', address: { uid, dtstart: '20261103T150000Z' } },
    meta: { dtstart: '20261103T150000Z', uid },
  }
}

it('receives a Telegram Trigger and treats a replay as duplicate', () => {
  const e = engine()
  const trigger = telegram('1', 'preciso de um README')
  expect(receiveExternal(e, trigger)).toBe('stored')
  expect(receiveExternal(e, trigger)).toBe('duplicate')
  expect(originReply(trigger)).toEqual({ source: TELEGRAM_SOURCE, chat: '99', message: '1' })
})

it('receives e-mail on the subject thread; reply stays on the origin', () => {
  const e = engine()
  const trigger = email('m1', 'candidato enviou o CV')
  expect(receiveExternal(e, trigger)).toBe('stored')
  expect(receiveExternal(e, trigger)).toBe('duplicate')
  expect(originReply(trigger)).toEqual({
    source: EMAIL_SOURCE, to: 'equipe@acme', subject: 'vaga', message: 'm1',
  })
})

it('batch poll stores each id once; a channel source is refused', () => {
  const e = engine()
  expect(receiveExternalBatch(e, [telegram('2', 'oi'), telegram('2', 'oi')])).toEqual(['stored', 'duplicate'])
  expect(() => receiveExternal(e, {
    ...telegram('3', 'x'),
    source: 'channel',
    threads: [{ source: 'channel', id: 'geral' }],
  })).toThrow('external-source')
})

it('filters a Telegram Trigger when the host did not listen', () => {
  const repo = new MemoryRepositories()
  const assessor: Assessor = { request: () => {}, release: () => {} }
  const policy: Policy = {
    version: 'v1', paused: false, evalTimeoutMs: 60_000,
    gate: () => ({ admissible: true, strength: 'explicit', basis: { via: 'listed' } }),
    revalidate: () => true,
    admitsInferred: () => true,
  }
  const executor: Executor = { start: () => {}, deliver: () => {}, stop: () => {} }
  const e = new Engine({
    repo, assessor, executor,
    outbox: { send: () => {}, status: () => undefined, withdraw: () => {} },
    policy: () => policy,
    scope: externalSourceScope(EMAIL_SOURCE),
  })
  expect(receiveExternal(e, telegram('9', 'fora de escopo'))).toBe('filtered')
})

it('receives Slack and Discord; reply stays on the origin channel', () => {
  const e = engine()
  const sl = slack('1710000000.000100', 'preciso do README')
  const dc = discord('m9', 'candidato enviou o CV')
  expect(receiveExternal(e, sl)).toBe('stored')
  expect(receiveExternal(e, sl)).toBe('duplicate')
  expect(receiveExternal(e, dc)).toBe('stored')
  expect(originReply(sl)).toEqual({ source: SLACK_SOURCE, channel: 'C1', message: '1710000000.000100' })
  expect(originReply(dc)).toEqual({ source: DISCORD_SOURCE, channel: 'D1', message: 'm9' })
})

it('stores a calendar VEVENT; replay is duplicate; reply is uid+dtstart', () => {
  const e = engine()
  const ev = calendar('evt-1', 'standup semanal')
  expect(receiveExternal(e, ev)).toBe('stored')
  expect(receiveExternal(e, ev)).toBe('duplicate')
  expect(originReply(ev)).toEqual({
    source: CALENDAR_SOURCE, uid: 'evt-1', dtstart: '20261103T150000Z',
  })
})

it('keeps a bot message stored for eval; the gate refuses it', () => {
  const e = engine()
  const bot = telegram('bot', 'deploy ok', false)
  expect(receiveExternal(e, bot)).toBe('stored')
  e.evaluateDue()
  expect(e.candidate(bot.id)?.strength).toBeUndefined()
})
