// @vitest-environment jsdom
// Item 4 da colheita (fala simples): o detalhe técnico chega como <details> dentro da resposta e o cliente o desenha recolhido.
// É a única tag HTML que o parser lê; o resumo é sempre texto; o resto do HTML continua virando texto.
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MarkdownBody } from '../src/client/chat/markdown/MarkdownBody.tsx'
import { parseMarkdown, type MarkdownBlock, type MarkdownDetails } from '../src/client/chat/markdown/parse-markdown.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'

afterEach(cleanup)

const t = ((key: string, params?: Readonly<Record<string, string>>) => bindLocale(chatPt, key, params)) as never

const detailsOf = (blocks: readonly MarkdownBlock[]): MarkdownDetails => {
  const found = blocks.find((block): block is MarkdownDetails => block.type === 'details')
  if (found === undefined) throw new Error('no details block')
  return found
}

const TYPICAL = [
  'Pronto, o cartaz está no rascunho. Quer que eu mude a cor?',
  '',
  '<details><summary>Detalhes</summary>',
  '',
  'Salvei em packages/persona/persona-host/src/speech.ts.',
  '',
  '- primeiro',
  '- segundo',
  '',
  '</details>',
].join('\n')

describe('parseMarkdown: <details>', () => {
  it('lê o bloco típico: frase simples antes, resumo, corpo em Markdown', () => {
    const blocks = parseMarkdown(TYPICAL)
    expect(blocks.map(block => block.type)).toEqual(['paragraph', 'details'])
    const details = detailsOf(blocks)
    expect(details.summary).toBe('Detalhes')
    expect(details.blocks.map(block => block.type)).toEqual(['paragraph', 'list'])
  })

  it('aceita tudo em uma linha e sem summary (usa "Detalhes")', () => {
    expect(detailsOf(parseMarkdown('<details><summary>Ver como fiz</summary>Passos usados.</details>'))).toMatchObject({ summary: 'Ver como fiz', blocks: [{ type: 'paragraph' }] })
    expect(detailsOf(parseMarkdown('<details>\nSó o corpo.\n</details>')).summary).toBe('Detalhes')
  })

  it('o bloco começa mesmo colado ao parágrafo anterior (sem linha em branco)', () => {
    expect(parseMarkdown('Feito.\n<details><summary>Detalhes</summary>\nx\n</details>').map(block => block.type)).toEqual(['paragraph', 'details'])
  })

  it('o que vem depois do fecho na mesma linha não se perde', () => {
    const blocks = parseMarkdown('<details><summary>Detalhes</summary>x</details> e o resto.')
    expect(blocks.map(block => block.type)).toEqual(['details', 'paragraph'])
  })

  it('um </details> dentro de bloco de código não fecha o bloco; aninhado fecha só no último', () => {
    const fenced = detailsOf(parseMarkdown('<details>\n```html\n</details>\n```\ndepois\n</details>'))
    expect(fenced.blocks.map(block => block.type)).toEqual(['code', 'paragraph'])
    const nested = detailsOf(parseMarkdown('<details><summary>A</summary>\n<details><summary>B</summary>\ndentro\n</details>\nfora\n</details>'))
    expect(nested.blocks.map(block => block.type)).toEqual(['details', 'paragraph'])
  })

  it('aberto e sem fecho (a resposta ainda chega) vai até o fim, sem tag crua', () => {
    const blocks = parseMarkdown('Feito.\n\n<details><summary>Detalhes</summary>\nparcial', { streaming: true })
    expect(detailsOf(blocks).blocks).toHaveLength(1)
    const half = detailsOf(parseMarkdown('<details><summary>Det', { streaming: true }))
    expect(half).toEqual({ type: 'details', summary: 'Detalhes', blocks: [] })
  })

  it('o resumo é texto puro, curto e de uma linha; o corpo não vira HTML', () => {
    const summary = detailsOf(parseMarkdown('<details><summary><b onclick="x()">Ver</b>\n   tudo</summary>\ncorpo</details>')).summary
    expect(summary).toBe('Ver tudo')
    expect(detailsOf(parseMarkdown(`<details><summary>${'a'.repeat(200)}</summary>x</details>`)).summary.length).toBeLessThanOrEqual(80)
  })

  it('as outras tags HTML continuam texto', () => {
    const blocks = parseMarkdown('<script>alert(1)</script>\n\n<div>oi</div>')
    expect(blocks.every(block => block.type === 'paragraph')).toBe(true)
  })
})

describe('MarkdownBody: <details>', () => {
  it('desenha um <details> nativo, recolhido, com a frase simples visível e o técnico dentro', () => {
    const { container } = render(<MarkdownBody source={TYPICAL} t={t} />)
    const details = container.querySelector('details') as HTMLDetailsElement
    expect(details).toBeTruthy()
    expect(details.open).toBe(false)
    expect(details.firstElementChild?.tagName).toBe('SUMMARY')
    expect(details.querySelector('summary')?.textContent).toBe('Detalhes')
    expect(details.textContent).toContain('packages/persona/persona-host/src/speech.ts')
    expect(details.querySelectorAll('ul > li')).toHaveLength(2)
    // a frase simples está fora do bloco recolhido
    const lead = container.querySelector('p') as HTMLElement
    expect(details.contains(lead)).toBe(false)
    expect(lead.textContent).toContain('Pronto, o cartaz está no rascunho.')
  })

  it('abre e fecha pelo resumo (o teclado vem do <summary> nativo)', () => {
    const { container } = render(<MarkdownBody source={TYPICAL} t={t} />)
    const details = container.querySelector('details') as HTMLDetailsElement
    const summary = details.querySelector('summary') as HTMLElement
    fireEvent.click(summary)
    expect(details.open).toBe(true)
    fireEvent.click(summary)
    expect(details.open).toBe(false)
  })

  it('nunca produz HTML cru: nenhum script, imagem ou atributo de evento, nem dentro do bloco', () => {
    const source = '<details><summary><img src=x onerror="alert(1)">Ver</summary>\n<script>alert(1)</script>\n\n<b onclick="x()">oi</b>\n</details>'
    const { container } = render(<MarkdownBody source={source} t={t} />)
    expect(container.querySelector('script, img, b')).toBeNull()
    expect(container.querySelector('[onclick], [onerror]')).toBeNull()
    expect(container.textContent).toContain('<script>alert(1)</script>')
  })

  it('durante o streaming a tag ainda aberta não aparece como texto', () => {
    const { container } = render(<MarkdownBody source={'Feito.\n\n<details><summary>Detalhes</summary>\nparcial'} t={t} streaming />)
    expect(container.textContent).not.toContain('<details')
    expect(container.querySelector('details')).toBeTruthy()
  })
})
