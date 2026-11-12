import { describe, expect, it } from 'vitest'
import {
  EMAIL_PRESETS,
  READ_ONLY_IMAP_COMMANDS,
  emailPresetFor,
  filterEmailMessages,
  matchesEmailFilter,
  pollEmail,
  type EmailMessage,
} from '../src/index.ts'

const message = (partial: Partial<EmailMessage> = {}): EmailMessage => ({
  id: 'm1',
  from: 'fornecedor@loja.com.br',
  to: 'vendas@loja.com.br',
  subject: 'Pedido 42',
  text: 'segue o pedido',
  ...partial,
})

describe('harvest 19b: mailbox presets and the origin filter', () => {
  it('offers the Brazilian providers with TLS and never mutates the mailbox', () => {
    expect(EMAIL_PRESETS.map(preset => preset.id)).toEqual(['locaweb', 'hostinger', 'godaddy', 'titan', 'zoho', 'icloud'])
    for (const preset of EMAIL_PRESETS) {
      expect(preset.port).toBe(993)
      expect(preset.secure).toBe(true)
    }
    expect(emailPresetFor('vendas@loja.com.br')).toBeUndefined()
    expect(emailPresetFor('ana@zoho.com')?.host).toBe('imap.zoho.com')
    expect(emailPresetFor('ana@icloud.com')?.id).toBe('icloud')
    expect(READ_ONLY_IMAP_COMMANDS).toContain('EXAMINE')
    expect(READ_ONLY_IMAP_COMMANDS).toContain('UID FETCH (BODY.PEEK[HEADER] BODY.PEEK[TEXT]<0.32768>)')
    expect(READ_ONLY_IMAP_COMMANDS.join(' ')).not.toMatch(/\b(?:STORE|EXPUNGE|COPY|MOVE|APPEND|DELETE)\b/u)
  })

  it('matches recipients, senders and subject words without case, and skips bulk mail by default', () => {
    expect(matchesEmailFilter(message(), {})).toBe(true)
    expect(matchesEmailFilter(message(), { to: ['vendas@'] })).toBe(true)
    expect(matchesEmailFilter(message(), { to: ['@outra.com'] })).toBe(false)
    expect(matchesEmailFilter(message(), { from: ['@loja.com.br'] })).toBe(true)
    expect(matchesEmailFilter(message(), { subject: ['pedido'] })).toBe(true)
    expect(matchesEmailFilter(message(), { subject: ['pedido', '42'] })).toBe(true)
    expect(matchesEmailFilter(message(), { subject: ['nota'] })).toBe(false)
    expect(matchesEmailFilter(message({ bulk: true }), {})).toBe(false)
    expect(matchesEmailFilter(message({ bulk: true }), { skipBulk: false })).toBe(true)
    expect(filterEmailMessages([message(), message({ id: 'm2', subject: 'Nota' })], { subject: ['pedido'] })).toHaveLength(1)
  })

  it('drops the message before any Trigger exists and reports it once', async () => {
    const dropped: string[] = []
    const triggers = await pollEmail({
      list: async () => [
        message(),
        message({ id: 'm2', from: 'news@loja.com.br', subject: 'Promoção', bulk: true }),
        message({ id: 'm3', to: 'outro@loja.com.br', subject: 'Pedido 43' }),
      ],
      filter: { to: ['vendas@loja.com.br'], subject: ['pedido'] },
      onFiltered: (item) => { dropped.push(item.id) },
    })
    expect(triggers.map(trigger => trigger.id)).toEqual(['mail:m1'])
    expect(dropped).toEqual(['m2', 'm3'])
  })
})

// P0-11 (Carbon, colheita S1): the sender is the address between <...>, never the display name.
describe('P0-11: the origin filter reads the real address', () => {
  const spoof = message({ from: '"cliente@parceiro.com.br" <atacante@externo.com>' })

  it('does not let a display name pass for the sender', () => {
    expect(matchesEmailFilter(spoof, { from: ['parceiro.com.br'] })).toBe(false)
    expect(matchesEmailFilter(spoof, { from: ['@parceiro.com.br'] })).toBe(false)
    expect(matchesEmailFilter(spoof, { from: ['cliente@parceiro.com.br'] })).toBe(false)
    expect(matchesEmailFilter(spoof, { from: ['@externo.com'] })).toBe(true) // the real sender
  })

  it('a bare domain means that domain (and its subdomains), never a piece of another one', () => {
    expect(matchesEmailFilter(message({ from: 'Ana <ana@parceiro.com.br>' }), { from: ['parceiro.com.br'] })).toBe(true)
    expect(matchesEmailFilter(message({ from: 'ana@mail.parceiro.com.br' }), { from: ['parceiro.com.br'] })).toBe(true)
    expect(matchesEmailFilter(message({ from: 'ana@evilparceiro.com.br' }), { from: ['parceiro.com.br'] })).toBe(false)
    expect(matchesEmailFilter(message({ from: 'ana@parceiro.com.br.evil.com' }), { from: ['parceiro.com.br'] })).toBe(false)
  })

  it('"@domain" is exactly that domain, a full address is exactly that address, "name@" is a local-part prefix', () => {
    expect(matchesEmailFilter(message({ from: 'ana@parceiro.com.br' }), { from: ['@parceiro.com.br'] })).toBe(true)
    expect(matchesEmailFilter(message({ from: 'ana@parceiro.com.br.evil.com' }), { from: ['@parceiro.com.br'] })).toBe(false)
    expect(matchesEmailFilter(message({ from: 'Ana <ana@parceiro.com.br>' }), { from: ['ana@parceiro.com.br'] })).toBe(true)
    expect(matchesEmailFilter(message({ from: 'banana@parceiro.com.br' }), { from: ['ana@parceiro.com.br'] })).toBe(false)
    expect(matchesEmailFilter(message({ to: 'vendas@loja.com.br, Outro <outro@x.com>' }), { to: ['vendas@'] })).toBe(true)
    expect(matchesEmailFilter(message({ to: 'x-vendas@loja.com.br' }), { to: ['vendas@'] })).toBe(false)
  })

  it('reads every address of a list of recipients, with or without a display name', () => {
    const to = 'Fulano <fulano@a.com>, vendas@loja.com.br, "Beltrano, B." <b@c.com>'
    expect(matchesEmailFilter(message({ to }), { to: ['@c.com'] })).toBe(true)
    expect(matchesEmailFilter(message({ to }), { to: ['vendas@loja.com.br'] })).toBe(true)
    expect(matchesEmailFilter(message({ to }), { to: ['@d.com'] })).toBe(false)
  })
})

// P0-06c (Carbon, colheita S1 fix): the quotes of a display name may carry a FAKE `<address>`: the real one is the angle-addr OUTSIDE the quotes and comments.
describe('P0-06c: a quoted display name with <...> inside is never the sender', () => {
  const from = (value: string) => message({ from: value })
  const partner = { from: ['parceiro.com.br'] }

  it('"<cliente@parceiro.com.br>" <atacante@externo.com> is sent by atacante@externo.com', () => {
    const spoof = from('"<cliente@parceiro.com.br>" <atacante@externo.com>')
    expect(matchesEmailFilter(spoof, partner)).toBe(false)
    expect(matchesEmailFilter(spoof, { from: ['@parceiro.com.br'] })).toBe(false)
    expect(matchesEmailFilter(spoof, { from: ['cliente@parceiro.com.br'] })).toBe(false)
    expect(matchesEmailFilter(spoof, { from: ['@externo.com'] })).toBe(true) // the real sender
  })

  it('a quote escaped inside the name does not close it early', () => {
    const spoof = from(String.raw`"Cliente \" <cliente@parceiro.com.br> \" Silva" <atacante@externo.com>`)
    expect(matchesEmailFilter(spoof, partner)).toBe(false)
    expect(matchesEmailFilter(spoof, { from: ['externo.com'] })).toBe(true)
  })

  it('a comment with a fake <address> is not the sender either', () => {
    const spoof = from('Atacante (<cliente@parceiro.com.br>) <atacante@externo.com>')
    expect(matchesEmailFilter(spoof, partner)).toBe(false)
    expect(matchesEmailFilter(spoof, { from: ['externo.com'] })).toBe(true)
  })

  it('only the real address of each item of a list counts', () => {
    const to = '"<a@fake.com>" <real@loja.com.br>, Outro <outro@x.com>'
    expect(matchesEmailFilter(message({ to }), { to: ['@fake.com'] })).toBe(false)
    expect(matchesEmailFilter(message({ to }), { to: ['@loja.com.br'] })).toBe(true)
    expect(matchesEmailFilter(message({ to }), { to: ['@x.com'] })).toBe(true)
  })

  it('a quoted name WITHOUT an angle-addr has no address at all (a name is not an address)', () => {
    expect(matchesEmailFilter(from('"cliente@parceiro.com.br"'), partner)).toBe(false)
  })

  it('what must keep working: plain, named, quoted-name-with-comma and bare senders', () => {
    expect(matchesEmailFilter(from('cliente@parceiro.com.br'), partner)).toBe(true)
    expect(matchesEmailFilter(from('Cliente <cliente@parceiro.com.br>'), partner)).toBe(true)
    expect(matchesEmailFilter(from('"Silva, Cliente" <cliente@parceiro.com.br>'), partner)).toBe(true)
    expect(matchesEmailFilter(from('Cliente (financeiro) <cliente@parceiro.com.br>'), partner)).toBe(true)
  })
})
