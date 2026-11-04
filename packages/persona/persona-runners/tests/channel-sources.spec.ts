import { createServer, type IncomingMessage, type Server } from 'node:http'
import { describe, expect, it } from 'vitest'
import {
  CALENDAR_SOURCE,
  DISCORD_SOURCE,
  SLACK_SOURCE,
  VAULT_CALDAV,
  VAULT_DISCORD,
  VAULT_SLACK,
  calendarEventToTrigger,
  discordMessageToTrigger,
  parseIcsEvents,
  pollCalDav,
  pollDiscord,
  pollSlack,
  replyDiscord,
  replySlack,
  slackEventToTrigger,
} from '../src/index.ts'

function listen(handler: (req: IncomingMessage, body: string) => { status: number; body: string; type?: string }): Promise<{
  url: string
  close: () => Promise<void>
}> {
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
    })
    req.on('end', () => {
      const out = handler(req, Buffer.concat(chunks).toString('utf8'))
      res.statusCode = out.status
      res.setHeader('content-type', out.type ?? 'application/json')
      res.end(out.body)
    })
  })
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        reject(new Error('no port'))
        return
      }
      resolve({
        url: `http://127.0.0.1:${String(address.port)}`,
        close: () => new Promise((done, fail) => {
          server.close(error => error === undefined ? done() : fail(error))
        }),
      })
    })
  })
}

describe('Slack / Discord / calendar sources', () => {
  it('maps Slack and Discord onto Triggers and replies on the origin channel', async () => {
    expect(slackEventToTrigger({
      type: 'message', channel: 'C1', user: 'U9', text: 'oi', ts: '1.1',
    })).toMatchObject({
      source: SLACK_SOURCE,
      threads: [{ source: SLACK_SOURCE, id: '1.1' }],
      text: 'oi',
      channel: { source: SLACK_SOURCE, address: { channel: 'C1' } },
    })
    expect(discordMessageToTrigger({
      id: 'm1', channel_id: 'D1', content: 'help', author: { id: 'u2', bot: false },
    })).toMatchObject({
      source: DISCORD_SOURCE,
      threads: [{ source: DISCORD_SOURCE, id: 'D1' }],
      text: 'help',
    })
    const slack = await listen((req) => {
      if (req.url?.includes('conversations.history') === true) {
        return { status: 200, body: JSON.stringify({ messages: [{ user: 'U1', text: 'standup', ts: '9.9' }] }) }
      }
      return { status: 200, body: JSON.stringify({ ok: true }) }
    })
    const discord = await listen((req) => {
      if (req.method === 'GET') {
        return {
          status: 200,
          body: JSON.stringify([{ id: 'x', channel_id: 'D1', content: 'ping', author: { id: 'u', bot: false } }]),
        }
      }
      return { status: 200, body: JSON.stringify({ id: 'y' }) }
    })
    try {
      const slackTriggers = await pollSlack({
        token: 'xoxb-fake', channel: 'C1', fetch, baseUrl: slack.url,
      })
      expect(slackTriggers[0]?.text).toBe('standup')
      expect(JSON.stringify(slackTriggers)).not.toContain('xoxb-fake')
      expect((await replySlack({
        token: 'xoxb-fake', channel: 'C1', text: 'ok', fetch, baseUrl: slack.url,
      })).ok).toBe(true)
      const discordTriggers = await pollDiscord({
        token: 'bot-fake', channel: 'D1', fetch, baseUrl: discord.url,
      })
      expect(discordTriggers[0]?.text).toBe('ping')
      expect(JSON.stringify(discordTriggers)).not.toContain('bot-fake')
      expect((await replyDiscord({
        token: 'bot-fake', channel: 'D1', text: 'visto', fetch, baseUrl: discord.url,
      })).ok).toBe(true)
    } finally {
      await slack.close()
      await discord.close()
    }
    expect(VAULT_SLACK).toBe('slack')
    expect(VAULT_DISCORD).toBe('discord')
    expect(VAULT_CALDAV).toBe('caldav')
  })

  it('parses ICS and polls a fake CalDAV document', async () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:evt-1',
      'SUMMARY:Standup',
      'DTSTART:20261103T150000Z',
      'DESCRIPTION:daily',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\n')
    expect(parseIcsEvents(ics)).toEqual([
      { uid: 'evt-1', summary: 'Standup', dtstart: '20261103T150000Z', description: 'daily' },
    ])
    expect(calendarEventToTrigger(parseIcsEvents(ics)[0]!)).toMatchObject({
      source: CALENDAR_SOURCE,
      threads: [{ source: CALENDAR_SOURCE, id: 'Standup' }],
      meta: { dtstart: '20261103T150000Z' },
    })
    const dav = await listen(() => ({ status: 200, body: ics, type: 'text/calendar' }))
    try {
      const triggers = await pollCalDav({ url: `${dav.url}/cal.ics`, fetch, token: 'cal-fake' })
      expect(triggers).toHaveLength(1)
      expect(triggers[0]?.meta.dtstart).toBe('20261103T150000Z')
      expect(JSON.stringify(triggers)).not.toContain('cal-fake')
    } finally {
      await dav.close()
    }
  })
})
