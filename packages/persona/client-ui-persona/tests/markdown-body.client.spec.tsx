// @vitest-environment jsdom
// IV-3: o desenho do markdown das respostas. Nada de HTML cru; links abrem fora; código com Copiar; tabela e código
// com rolagem própria (focáveis e nomeados); o código aberto durante o streaming aparece como texto.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MarkdownBody } from '../src/client/chat/markdown/MarkdownBody.tsx'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const t = ((key: string, params?: Readonly<Record<string, string>>) => bindLocale(chatPt, key, params)) as never

const RICH = [
  'Segue o **plano**:',
  '',
  '- primeiro',
  '- segundo',
  '  - detalhe',
  '',
  '| Dia | Vendas |',
  '|---|---|',
  '| Seg | 10 |',
  '| Ter | 25 |',
  '',
  '```sh',
  'npm test',
  '```',
  '',
  'Veja o [roteiro](https://exemplo.com/roteiro).',
].join('\n')

describe('MarkdownBody', () => {
  it('desenha lista, tabela, código, negrito e link', () => {
    const { container } = render(<MarkdownBody source={RICH} t={t} />)
    expect(container.querySelector('strong')?.textContent).toBe('plano')
    expect(container.querySelectorAll('ul > li')).toHaveLength(3)
    expect(container.querySelector('ul ul li')?.textContent).toBe('detalhe')
    expect(screen.getByRole('columnheader', { name: 'Vendas' })).toBeTruthy()
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2)
    expect(container.querySelector('pre code')?.textContent).toBe('npm test')
  })

  it('link abre fora, com noopener, e o ícone não entra no nome', () => {
    render(<MarkdownBody source="Veja o [roteiro](https://exemplo.com/roteiro)." t={t} />)
    const link = screen.getByRole('link', { name: 'roteiro' })
    expect(link.getAttribute('href')).toBe('https://exemplo.com/roteiro')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(link.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('esquema perigoso não vira link', () => {
    const { container } = render(<MarkdownBody source="[clique](javascript:alert(1))" t={t} />)
    expect(container.querySelector('a')).toBeNull()
    expect(container.textContent).toContain('clique')
  })

  it('HTML cru aparece como texto: nenhum script, imagem ou atributo de evento no DOM', () => {
    const { container } = render(<MarkdownBody source={'<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\n<b onclick="x()">oi</b>'} t={t} />)
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('b')).toBeNull()
    // o texto "onerror=…" aparece escrito na tela, mas nenhum elemento carrega atributo de evento
    const withHandler = [...container.querySelectorAll('*')].filter(element => element.getAttributeNames().some(name => name.startsWith('on')))
    expect(withHandler).toHaveLength(0)
    expect(container.textContent).toContain('<script>alert(1)</script>')
    expect(container.textContent).toContain('onerror="alert(1)"')
  })

  it('tabela e código são regiões com rolagem própria: focáveis e com nome', () => {
    render(<MarkdownBody source={RICH} t={t} />)
    const table = screen.getByRole('region', { name: 'Tabela' })
    expect(table.getAttribute('tabindex')).toBe('0')
    expect(within(table).getByRole('table')).toBeTruthy()
    const code = screen.getByRole('region', { name: 'Código' })
    expect(code.getAttribute('tabindex')).toBe('0')
  })

  it('números da tabela vão à direita com tabular-nums (marcados como numéricos)', () => {
    const { container } = render(<MarkdownBody source={RICH} t={t} />)
    const cells = [...container.querySelectorAll('tbody td')] as HTMLElement[]
    expect(cells[0]?.style.textAlign).toBe('left')
    expect(cells[1]?.style.textAlign).toBe('right')
    expect(cells[1]?.hasAttribute('data-numeric')).toBe(true)
  })

  it('títulos não entram no esquema de títulos da tela (role heading nível 4, sem h1–h3)', () => {
    const { container } = render(<MarkdownBody source={'# Um\n\n## Dois\n\n### Três'} t={t} />)
    expect(container.querySelector('h1, h2, h3')).toBeNull()
    expect(screen.getAllByRole('heading', { level: 4 })).toHaveLength(3)
  })

  it('Copiar manda o código para a área de transferência e vira "Copiado" por 1,5 s', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn(() => Promise.resolve())
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    render(<MarkdownBody source={'```sh\nnpm test\n```'} t={t} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copiar' }))
    await act(async () => { await Promise.resolve() })
    expect(writeText).toHaveBeenCalledWith('npm test')
    expect(screen.getByRole('button', { name: 'Copiado' })).toBeTruthy()
    act(() => { vi.advanceTimersByTime(1_500) })
    expect(screen.getByRole('button', { name: 'Copiar' })).toBeTruthy()
  })

  it('sem permissão da área de transferência o botão não promete "Copiado"', async () => {
    const writeText = vi.fn(() => Promise.reject(new Error('negado')))
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    render(<MarkdownBody source={'```\nx\n```'} t={t} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copiar' }))
    await act(async () => { await Promise.resolve() })
    expect(screen.queryByRole('button', { name: 'Copiado' })).toBeNull()
  })

  it('streaming: o código ainda aberto aparece como texto (sem Copiar) e vira bloco quando fecha', () => {
    const { rerender } = render(<MarkdownBody source={'ok\n\n```js\nconst a = 1'} t={t} streaming />)
    expect(screen.queryByRole('button', { name: 'Copiar' })).toBeNull()
    expect(document.querySelector('pre')).toBeNull()
    rerender(<MarkdownBody source={'ok\n\n```js\nconst a = 1\n```'} t={t} streaming />)
    expect(screen.getByRole('button', { name: 'Copiar' })).toBeTruthy()
    expect(document.querySelector('pre code')?.textContent).toBe('const a = 1')
  })

  it('texto simples continua sendo um parágrafo só', () => {
    const { container } = render(<MarkdownBody source="Oi! Já começo." t={t} />)
    expect(container.querySelectorAll('p')).toHaveLength(1)
    expect(container.textContent).toBe('Oi! Já começo.')
  })
})
