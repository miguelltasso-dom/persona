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
    expect(READ_ONLY_IMAP_COMMANDS).toContain('UID FETCH (BODY.PEEK[])')
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
