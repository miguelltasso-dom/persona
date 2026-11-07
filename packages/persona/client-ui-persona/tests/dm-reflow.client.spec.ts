// WCAG 1.4.10 (reflow a 200% = 640×360 css): a lista de DMs a 272–320 px deixava ~38 px para o painel da direita e cortava o texto
// (Muse, varredura do H2 #3). Guarda do CSS: em largura estreita o layout vira uma coluna (lista em cima, painel embaixo).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const CSS = readFileSync(new URL('../src/client/chat/DirectMessagesView.module.css', import.meta.url), 'utf8')

/** Corpo do `@media` informado (até a chave que o fecha), ou '' se não existir. */
function mediaBody(query: string): string {
  const start = CSS.indexOf(`@media ${query} {`)
  if (start < 0) return ''
  let depth = 0
  for (let i = CSS.indexOf('{', start); i < CSS.length; i++) {
    if (CSS[i] === '{') depth++
    if (CSS[i] === '}' && --depth === 0) return CSS.slice(CSS.indexOf('{', start) + 1, i)
  }
  return ''
}

describe('DMs: reflow a 200% (WCAG 1.4.10)', () => {
  const narrow = mediaBody('(max-width: 760px)')

  it('em até 760 px o layout é uma coluna só, com a lista em cima (40%) e o painel embaixo', () => {
    expect(narrow).not.toBe('')
    expect(narrow).toMatch(/\.layout\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*;/u)
    expect(narrow).toMatch(/\.layout\s*\{[^}]*grid-template-rows:\s*minmax\(0,\s*40%\)\s+minmax\(0,\s*1fr\)\s*;/u)
  })

  it('a lista troca a borda direita pela inferior (a divisória acompanha o empilhamento)', () => {
    expect(narrow).toMatch(/\.listPane\s*\{[^}]*border-right:\s*0\s*;/u)
    expect(narrow).toMatch(/\.listPane\s*\{[^}]*border-bottom:\s*var\(--persona-border-width\)\s+solid\s+var\(--persona-outline-soft\)\s*;/u)
  })

  it('a regra estreita vem DEPOIS da de 1180 px (a cascata não a desfaz) e o desktop segue em duas colunas', () => {
    expect(CSS.indexOf('@media (max-width: 760px) {')).toBeGreaterThan(CSS.indexOf('@media (max-width: 1180px) {'))
    expect(CSS).toMatch(/^\.layout\s*\{[^}]*grid-template-columns:\s*320px\s+minmax\(0,\s*1fr\)\s*;/mu)
    expect(mediaBody('(max-width: 1180px)')).toMatch(/grid-template-columns:\s*272px\s+minmax\(0,\s*1fr\)/u)
  })
})
