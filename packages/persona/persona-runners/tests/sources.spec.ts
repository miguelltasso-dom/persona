import { createServer, type IncomingMessage, type Server } from 'node:http'
import { describe, expect, it } from 'vitest'
import {
  EMAIL_SOURCE,
  TELEGRAM_SOURCE,
  VAULT_IMAP,
  VAULT_SMTP,
  VAULT_TELEGRAM,
  emailMessageToTrigger,
  pollEmail,
  pollTelegram,
  replyEmail,
  replyTelegram,
  telegramUpdateToTrigger,
} from '../src/index.ts'

function listen(handler: (req: IncomingMessage, body: string) => { status: number; json: unknown }): Promise<{
  url: string
  close: () => Promise<void>
  seen: Array<{ url: string; auth?: string; body: string }>
}> {
  const seen: Array<{ url: string; auth?: string; body: string }> = []
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
    })
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8')
      const auth = req.headers.authorization
      seen.push({ url: req.url ?? '', ...(typeof auth === 'string' ? { auth } : {}), body })
      const out = handler(req, body)
      res.statusCode = out.status
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(out.json))
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
        seen,
        close: () => new Promise((done, fail) => {
          server.close(error => error === undefined ? done() : fail(error))
        }),
      })
    })
  })
}

describe('Telegram / email sources', () => {
  it('maps a Telegram update onto a Trigger on the chat thread', () => {
    const trigger = telegramUpdateToTrigger({
      update_id: 7,
      message: {
        message_id: 3,
        date: 1_700_000_000,
        text: 'oi nina',
        chat: { id: 42, type: 'private' },
        from: { id: 9, is_bot: false, username: 'ana' },
      },
    })
    expect(trigger).toMatchObject({
      id: 'tg:7:3',
      source: TELEGRAM_SOURCE,
      threads: [{ source: TELEGRAM_SOURCE, id: '42' }],
      actor: { source: TELEGRAM_SOURCE, id: '9' },
      human: true,
      addressed: 'direct',
      text: 'oi nina',
      channel: { source: TELEGRAM_SOURCE, thread: '42', address: { chat: '42', message: '3' } },
    })
  })

  it('polls a fake Telegram API and replies on the origin chat', async () => {
    const fake = await listen((req) => {
      if (req.url?.startsWith('/getUpdates') === true) {
        return {
          status: 200,
          json: {
            ok: true,
            result: [{
              update_id: 1,
              message: {
                message_id: 8,
                date: 1_700_000_100,
                text: 'ajuda',
                chat: { id: 11, type: 'group' },
                from: { id: 5, is_bot: false },
              },
            }],
          },
        }
      }
      return { status: 200, json: { ok: true } }
    })
    try {
      const triggers = await pollTelegram({
        token: 'fake-bot-token',
        fetch,
        baseUrl: fake.url,
        offset: 0,
      })
      expect(triggers).toHaveLength(1)
      expect(triggers[0]?.text).toBe('ajuda')
      expect(triggers[0]?.channel?.address.chat).toBe('11')
      expect(JSON.stringify(triggers)).not.toContain('fake-bot-token')
      const reply = await replyTelegram({
        token: 'fake-bot-token',
        chat: '11',
        text: 'ok',
        fetch,
        baseUrl: fake.url,
      })
      expect(reply.ok).toBe(true)
      expect(fake.seen.some(row => row.body.includes('"chat_id":"11"') && row.body.includes('"text":"ok"'))).toBe(true)
    } finally {
      await fake.close()
    }
  })

  it('maps email onto a Trigger keyed by subject and replies via SMTP hook', async () => {
    const trigger = emailMessageToTrigger({
      id: 'm1',
      from: 'ana@ex.test',
      to: 'nina@ex.test',
      subject: 'Landing',
      text: 'revisa o hero',
    })
    expect(trigger).toMatchObject({
      source: EMAIL_SOURCE,
      threads: [{ source: EMAIL_SOURCE, id: 'Landing' }],
      actor: { source: EMAIL_SOURCE, id: 'ana@ex.test' },
      text: 'revisa o hero',
      viaEmail: true,
      channel: { source: EMAIL_SOURCE, thread: 'Landing', address: { from: 'ana@ex.test', to: 'nina@ex.test', message: 'm1' } },
    })
    const inbox = await pollEmail({
      list: async () => [{
        id: 'm2', from: 'bob@ex.test', to: 'nina@ex.test', subject: 'Bug', text: 'quebra',
      }],
    })
    expect(inbox).toHaveLength(1)
    const sent: Array<{ to: string; subject: string; text: string }> = []
    const reply = await replyEmail({
      to: 'bob@ex.test',
      subject: 'Bug',
      text: 'visto',
      send: async (input) => {
        sent.push(input)
        return true
      },
    })
    expect(reply.ok).toBe(true)
    expect(sent).toEqual([{ to: 'bob@ex.test', subject: 'Bug', text: 'visto' }])
    expect(VAULT_TELEGRAM).toBe('telegram')
    expect(VAULT_IMAP).toBe('imap')
    expect(VAULT_SMTP).toBe('smtp')
  })
})
