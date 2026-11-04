import { describe, expect, it } from 'vitest'
import { attachBootUi } from '../src/boot-ui.ts'

describe('packaged startup UI', () => {
  it('places static recovery UI before the root without inline scripts', async () => {
    const html = await attachBootUi('<html><body><div id="root"></div></body></html>',
      new URL('../renderer', import.meta.url).pathname.replace(/^\/([A-Z]:)/u, '$1'), true, 'pt-BR')
    expect(html.indexOf('persona-boot-overlay')).toBeLessThan(html.indexOf('id="root"'))
    expect(html).toContain('shadowrootmode="open"')
    expect(html).toContain('boot.js?first=1&amp;lang=pt-BR')
    expect(html).toContain('Tentar de novo')
    expect(html).toContain('Detalhes para o suporte')
    expect(html).not.toMatch(/<script(?![^>]*src=)/u)
  })

  it('rejects missing packaged startup resources', async () => {
    await expect(attachBootUi('<body></body>', '/missing-persona-renderer', false, 'en')).rejects.toThrow()
  })
})
