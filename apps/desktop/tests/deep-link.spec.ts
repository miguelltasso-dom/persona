import { describe, expect, it } from 'vitest'
import { parsePersonaDeepLink, personaTaskHref } from '../src/deep-link.ts'
import { reconnectingPageHtml, reconnectingPageUrl } from '../src/reconnecting-page.ts'

describe('persona deep links', () => {
  it('parses an internal task link and rejects network urls', () => {
    expect(parsePersonaDeepLink(personaTaskHref('ticket-9'))).toEqual({ kind: 'task', ticketId: 'ticket-9' })
    expect(parsePersonaDeepLink('https://example.com/task/ticket-9')).toBeUndefined()
    expect(parsePersonaDeepLink('persona://task/')).toBeUndefined()
  })
})

describe('reconnecting page', () => {
  it('renders the locale string without a network URL', () => {
    const html = reconnectingPageHtml('Reconectando…')
    expect(html).toContain('Reconectando…')
    expect(html).not.toContain('http')
    expect(reconnectingPageUrl('Reconectando…').startsWith('data:text/html')).toBe(true)
  })
})
