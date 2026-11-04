// IV-3: o parser de markdown das respostas. Só o subconjunto seguro; nada vira HTML; o que está incompleto fica como texto.
import { describe, expect, it } from 'vitest'
import { parseInline, parseMarkdown, safeHref, type Inline, type MarkdownBlock } from '../src/client/chat/markdown/parse-markdown.ts'

const text = (value: string): Inline => ({ type: 'text', text: value })

function plain(nodes: readonly Inline[]): string {
  return nodes.map((node) => {
    switch (node.type) {
      case 'text':
      case 'code':
        return node.text
      case 'br':
        return '\n'
      default:
        return plain(node.children)
    }
  }).join('')
}

const only = (source: string, options?: { streaming?: boolean }): MarkdownBlock => {
  const blocks = parseMarkdown(source, options)
  expect(blocks).toHaveLength(1)
  return blocks[0] as MarkdownBlock
}

describe('inline', () => {
  it('negrito, itálico e código', () => {
    expect(parseInline('um **forte**, um *leve* e `código`')).toEqual([
      text('um '), { type: 'strong', children: [text('forte')] }, text(', um '), { type: 'em', children: [text('leve')] }, text(' e '), { type: 'code', text: 'código' },
    ])
  })

  it('marcadores sem par ficam como texto (nunca somem nem comem o resto)', () => {
    expect(plain(parseInline('2 * 3 = 6 e **sem fechar'))).toBe('2 * 3 = 6 e **sem fechar')
    expect(plain(parseInline('uma `crase solta'))).toBe('uma `crase solta')
  })

  it('snake_case e nomes com sublinhado não viram itálico', () => {
    expect(parseInline('use meu_arquivo_final.ts hoje')).toEqual([text('use meu_arquivo_final.ts hoje')])
  })

  it('escape com barra invertida mostra o caractere', () => {
    expect(plain(parseInline('\\*não é itálico\\*'))).toBe('*não é itálico*')
  })

  it('links: http, https e mailto abrem; qualquer outro esquema vira texto', () => {
    expect(parseInline('[site](https://exemplo.com/a?b=1)')).toEqual([{ type: 'link', href: 'https://exemplo.com/a?b=1', children: [text('site')] }])
    expect(parseInline('[mail](mailto:a@b.co)')).toEqual([{ type: 'link', href: 'mailto:a@b.co', children: [text('mail')] }])
    for (const bad of ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'file:///c:/x', 'vbscript:x', '//evil.com']) {
      const nodes = parseInline(`[clique](${bad})`)
      expect(nodes.some(node => node.type === 'link')).toBe(false)
      expect(plain(nodes)).toContain('clique')
    }
    expect(safeHref(' https://x.co ')).toBe('https://x.co')
    expect(safeHref('JAVASCRIPT:alert(1)')).toBeNull()
  })

  it('URL solta vira link sem a pontuação final', () => {
    expect(parseInline('veja https://exemplo.com/pagina.')).toEqual([
      text('veja '), { type: 'link', href: 'https://exemplo.com/pagina', children: [text('https://exemplo.com/pagina')] }, text('.'),
    ])
  })

  it('HTML cru fica como texto, nunca como elemento', () => {
    const nodes = parseInline('<script>alert(1)</script> <img src=x onerror=alert(1)>')
    expect(nodes.every(node => node.type === 'text')).toBe(true)
    expect(plain(nodes)).toBe('<script>alert(1)</script> <img src=x onerror=alert(1)>')
  })

  it('quebra de linha vira <br>', () => {
    expect(parseInline('a\nb')).toEqual([text('a'), { type: 'br' }, text('b')])
  })
})

describe('blocos', () => {
  it('parágrafos separados por linha em branco; linhas seguidas ficam no mesmo parágrafo', () => {
    const blocks = parseMarkdown('primeiro\nainda o primeiro\n\nsegundo')
    expect(blocks.map(block => block.type)).toEqual(['paragraph', 'paragraph'])
  })

  it('títulos #, ## e ### (4 ou mais níveis usam o 3)', () => {
    const levels = parseMarkdown('# A\n\n## B\n\n### C\n\n#### D').map(block => (block.type === 'heading' ? block.level : 0))
    expect(levels).toEqual([1, 2, 3, 3])
  })

  it('lista com marcador e numerada, 2 níveis', () => {
    const block = only('- um\n- dois\n  - dois.a\n  - dois.b\n- três')
    expect(block.type).toBe('list')
    if (block.type !== 'list') return
    expect(block.ordered).toBe(false)
    expect(block.items.map(item => plain(item.inline))).toEqual(['um', 'dois', 'três'])
    expect(block.items[1]?.children?.items.map(item => plain(item.inline))).toEqual(['dois.a', 'dois.b'])
  })

  it('lista numerada guarda o número inicial e trocar de tipo abre outra lista', () => {
    const blocks = parseMarkdown('3. três\n4. quatro\n- marcador')
    expect(blocks.map(block => (block.type === 'list' ? `${block.ordered ? 'ol' : 'ul'}:${block.start}` : block.type))).toEqual(['ol:3', 'ul:1'])
  })

  it('terceiro nível é achatado no segundo (máx. 2 níveis)', () => {
    const block = only('- a\n  - b\n    - c')
    if (block.type !== 'list') throw new Error('lista esperada')
    expect(block.items[0]?.children?.items.map(item => plain(item.inline))).toEqual(['b', 'c'])
  })

  it('citação com mais de um parágrafo', () => {
    const block = only('> primeira\n>\n> segunda')
    if (block.type !== 'quote') throw new Error('citação esperada')
    expect(block.blocks).toHaveLength(2)
  })

  it('bloco de código fechado guarda a linguagem e o texto', () => {
    const block = only('```ts\nconst a = 1\nconst b = 2\n```')
    expect(block).toEqual({ type: 'code', lang: 'ts', text: 'const a = 1\nconst b = 2' })
  })

  it('markdown dentro do bloco de código não é interpretado', () => {
    const block = only('```\n**não negrito** <b>x</b>\n```')
    expect(block).toEqual({ type: 'code', lang: '', text: '**não negrito** <b>x</b>' })
  })

  it('cerca sem fechar: fora do streaming vai até o fim; no streaming fica como texto até fechar', () => {
    const source = 'antes\n\n```js\nconst a = 1'
    const finished = parseMarkdown(source)
    expect(finished.map(block => block.type)).toEqual(['paragraph', 'code'])
    const streaming = parseMarkdown(source, { streaming: true })
    expect(streaming.map(block => block.type)).toEqual(['paragraph', 'paragraph'])
    expect(streaming.some(block => block.type === 'code')).toBe(false)
    const closed = parseMarkdown(`${source}\n\`\`\``, { streaming: true })
    expect(closed.map(block => block.type)).toEqual(['paragraph', 'code'])
  })

  it('tabela: cabeçalho, alinhamento pela linha separadora e números à direita sozinhos', () => {
    const block = only('| Item | Preço | Obs |\n|:--|--:|---|\n| Pão | 12,50 | fresco |\n| Bolo | 40 | |')
    if (block.type !== 'table') throw new Error('tabela esperada')
    expect(block.header.map(plain)).toEqual(['Item', 'Preço', 'Obs'])
    expect(block.align).toEqual(['left', 'right', 'left'])
    expect(block.rows).toHaveLength(2)
    expect(plain(block.rows[1]?.[2] ?? [])).toBe('')
  })

  it('coluna só de números sem alinhamento explícito vai à direita', () => {
    const block = only('| Mês | Total |\n|---|---|\n| Jan | R$ 1.200 |\n| Fev | 980 |')
    if (block.type !== 'table') throw new Error('tabela esperada')
    expect(block.align).toEqual(['left', 'right'])
  })

  it('"|" sozinho num texto sem linha separadora não vira tabela', () => {
    expect(parseMarkdown('a | b\nc | d').map(block => block.type)).toEqual(['paragraph'])
  })

  it('texto sem nada de markdown vira um parágrafo igual ao que veio', () => {
    const block = only('Oi, tudo certo? Faço isso agora.')
    expect(block.type === 'paragraph' && plain(block.inline)).toBe('Oi, tudo certo? Faço isso agora.')
  })

  it('CRLF e texto vazio', () => {
    expect(parseMarkdown('a\r\n\r\nb').map(block => block.type)).toEqual(['paragraph', 'paragraph'])
    expect(parseMarkdown('')).toEqual([])
  })

  it('mistura realista: título, lista, tabela, código e link', () => {
    const source = [
      '## Plano da semana',
      '',
      'Veja o [roteiro](https://exemplo.com/roteiro) e **confirme**:',
      '',
      '1. Separar pedidos',
      '2. Revisar preços',
      '',
      '| Dia | Vendas |',
      '|---|---|',
      '| Seg | 10 |',
      '',
      '```sh',
      'npm test',
      '```',
    ].join('\n')
    expect(parseMarkdown(source).map(block => block.type)).toEqual(['heading', 'paragraph', 'list', 'table', 'code'])
  })
})
