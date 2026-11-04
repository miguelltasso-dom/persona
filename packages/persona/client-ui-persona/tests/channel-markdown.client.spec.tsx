// @vitest-environment jsdom
// IV-3 ligado: as respostas das personas no fio são markdown seguro (lista, tabela, código, link); o que a pessoa escreve
// continua texto simples; HTML cru nunca vira elemento.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { GeneralChannelView } from '../src/client/chat/GeneralChannelView.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}
afterEach(() => { cleanup() })

const MEMBER = { id: 'bento' as const, name: 'Bento', role: 'Engenharia', state: 'waiting' as const }
const RICH = [
  'Segue o **plano**:',
  '',
  '- primeiro',
  '- segundo',
  '',
  '| Dia | Vendas |',
  '|---|---|',
  '| Seg | 10 |',
  '',
  '```sh',
  'npm test',
  '```',
  '',
  'Veja o [roteiro](https://exemplo.com/roteiro).',
].join('\n')

function view(messages: React.ComponentProps<typeof GeneralChannelView>['messages']) {
  return render(
    <GeneralChannelView
      t={key => chatPt[key as keyof typeof chatPt] ?? key}
      shellT={key => shellPt[key as keyof typeof shellPt] ?? key}
      members={[MEMBER]}
      messages={messages}
      memberId="owner"
    />,
  )
}

const row = (overrides: Partial<NonNullable<React.ComponentProps<typeof GeneralChannelView>['messages']>[number]>) => ({
  id: 'm1', authorId: 'bento', authorName: 'Bento', body: 'oi', timeLabel: '10:00', reactions: [], ...overrides,
})

describe('markdown nas respostas do fio', () => {
  it('a resposta da persona mostra lista, tabela, código e link', () => {
    const { container } = view([row({ body: RICH })])
    const md = container.querySelector('[data-persona-markdown]') as HTMLElement
    expect(md.querySelector('strong')?.textContent).toBe('plano')
    expect(md.querySelectorAll('ul > li')).toHaveLength(2)
    expect(screen.getByRole('columnheader', { name: 'Vendas' })).toBeTruthy()
    expect(md.querySelector('pre code')?.textContent).toBe('npm test')
    expect(screen.getByRole('link', { name: 'roteiro' }).getAttribute('target')).toBe('_blank')
  })

  it('o que a própria pessoa escreve fica texto simples (nada de markdown nas mensagens dela)', () => {
    const { container } = view([row({ id: 'u1', authorId: 'user', authorName: 'Você', body: 'quero **isto** e `aquilo`' })])
    const mine = container.querySelector('[data-message-id="u1"]') as HTMLElement
    expect(mine.querySelector('[data-persona-markdown]')).toBeNull()
    expect(mine.querySelector('code')).toBeNull()
    expect(mine.textContent).toContain('quero **isto** e `aquilo`')
  })

  it('HTML cru na resposta vira texto: nenhum script, imagem ou atributo de evento', () => {
    const { container } = view([row({ body: '<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">' })])
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('img[src="x"]')).toBeNull()
    const withHandler = [...container.querySelectorAll('*')].filter(element => element.getAttributeNames().some(name => name.startsWith('on')))
    expect(withHandler).toHaveLength(0)
  })

  it('texto comum continua sendo um parágrafo só, com o mesmo texto', () => {
    const { container } = view([row({ body: 'Pronto. Já mandei o orçamento.' })])
    expect(container.querySelector('[data-persona-markdown] p')?.textContent).toBe('Pronto. Já mandei o orçamento.')
  })
})
