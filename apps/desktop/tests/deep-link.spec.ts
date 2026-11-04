import { describe, expect, it } from 'vitest'
import { parsePersonaDeepLink, personaTaskHref } from '../src/deep-link.ts'
import { bootErrorHtml, reconnectingPageHtml, reconnectingPageUrl } from '../src/reconnecting-page.ts'

describe('persona deep links', () => {
  it('parses an internal task link and rejects network urls', () => {
    expect(parsePersonaDeepLink(personaTaskHref('ticket-9'))).toEqual({ kind: 'task', ticketId: 'ticket-9' })
    expect(parsePersonaDeepLink('https://example.com/task/ticket-9')).toBeUndefined()
    expect(parsePersonaDeepLink('persona://task/')).toBeUndefined()
    expect(parsePersonaDeepLink('persona://task/Ticket_9')).toBeUndefined()
    expect(parsePersonaDeepLink('persona://task/t-1/extra')).toBeUndefined()
    expect(parsePersonaDeepLink('persona://task/t-1?action=x')).toBeUndefined()
    expect(parsePersonaDeepLink('persona://task/%')).toBeUndefined()
    expect(() => personaTaskHref('Ticket_9')).toThrow(/invalid persona ticket id/u)
  })
})

describe('reconnecting page', () => {
  it('renders the locale string without a network URL', () => {
    const html = reconnectingPageHtml('Reconectando…')
    expect(html).toContain('Reconectando…')
    expect(html).toContain('#FAF3E4')
    expect(html).toContain('Persona')
    expect(html).toContain('prefers-reduced-motion')
    expect(html).toContain('walker')
    expect(html).toContain('data:image/webp')
    expect(html).toContain('data:image/svg+xml')
    expect(html).toContain('data:font/woff2')
    expect(html).toContain('data-who="atlas"')
    expect(html).toContain('data-who="luna"')
    expect(html).toContain('height:84px')
    expect(html).toContain('width:10px')
    expect(html).toContain('#3B2B52')
    expect(html).toContain('#8E78B0')
    expect(html).toContain('lang="pt-BR"')
    expect(html).not.toContain('http://')
    expect(html).not.toContain('https://')
    expect(reconnectingPageUrl('Reconectando…').startsWith('data:text/html')).toBe(true)
  })

  it('renders a boot-error page with retry and copy actions, no network URL', () => {
    const html = bootErrorHtml({
      message: 'O aplicativo não pôde ser iniciado ou parou inesperadamente.',
      help: 'Se os arquivos do aplicativo estiverem ausentes, reinstale.',
      retry: 'Tentar de novo',
      copy: 'Copiar diagnóstico',
    })
    expect(html).toContain('Tentar de novo')
    expect(html).toContain('Copiar diagnóstico')
    expect(html).toContain('class="art"')
    expect(html).toContain('class="retry"')
    expect(html).toContain('class="error-title"')
    expect(html).toContain('class="help"')
    expect(html).toContain('data:image/webp')
    expect(html).toContain('data:font/woff2')
    expect(html).not.toContain('http://')
    expect(html).not.toContain('https://')
  })
})
