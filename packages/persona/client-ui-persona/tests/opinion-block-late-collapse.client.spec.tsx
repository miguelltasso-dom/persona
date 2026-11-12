// @vitest-environment jsdom
// D-100 / REVISÃO-01 §B6: o cartão de opinião NÃO recolhia na tentativa 5 real. Causa: o "aberto/recolhido" nascia de `useState(consolidated === undefined)` na
// PRIMEIRA renderização; no fio real a consolidação chega DEPOIS (o cartão já está na tela, aberto), e o estado nunca mudava. Agora o recolhido segue a
// consolidação quando ela chega, e a escolha explícita da pessoa (abrir / ocultar) vale daí em diante.
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { OpinionBlock } from '../src/client/chat/opinion/OpinionBlock.tsx'
import { buildOpinionBlocks, type OpinionUi } from '../src/client/chat/opinion/opinion-model.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import type { ChannelMessageUi } from '../src/client/remote/map-host-ui.ts'
import type { TeamView } from '../src/client/remote/persona-remote-types.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}

const t = (key: string, params?: Readonly<Record<string, string | number>>) => {
  const raw = chatPt[key as keyof typeof chatPt] ?? key
  return params === undefined ? raw : raw.replace(/\{(\w+)\}/gu, (_m, name: string) => String(params[name] ?? ''))
}

beforeEach(() => { localStorage.clear() })
afterEach(() => { cleanup(); localStorage.clear() })

const TEAM = { personas: [{ id: 'persona-nina', name: 'Nina', avatarRef: 'nina' }, { id: 'persona-bento', name: 'Bento', avatarRef: 'bento' }] } as unknown as TeamView
const ui = (over: Partial<OpinionUi> = {}): OpinionUi => ({ kind: 'request', requestId: 'req-1', taskId: 'tk-1', round: 1, maxRounds: 2, imageIds: [], audience: 'team', noVision: [], ...over })
const msg = (id: string, authorId: string, authorName: string, body: string, opinion: OpinionUi): ChannelMessageUi => ({ id, authorId, authorName, body, timeLabel: '10:00', reactions: [], opinion })
const request = msg('m-req', 'nina', 'Nina', 'Qual destas capas funciona melhor?', ui())
const answer = msg('r1', 'bento', 'Bento', 'bom demais', ui({ kind: 'reply', mark: 'liked' }))
const final = msg('m-fin', 'nina', 'Nina', 'Troquei a fonte e escureci a capa', ui({ kind: 'consolidated' }))
const blockOf = (rows: readonly ChannelMessageUi[]) => {
  const model = buildOpinionBlocks(rows).get('req-1')
  if (model === undefined) throw new Error('sem bloco')
  return model
}
const card = (): HTMLElement => document.querySelector('[data-persona-opinion]') as HTMLElement
const pill = (): HTMLElement | null => document.querySelector('[data-persona-opinion-pill]')

describe('a consolidação chega DEPOIS que o cartão já está na tela', () => {
  it('o cartão aberto recolhe numa linha sozinho quando a consolidação chega', () => {
    const view = render(<OpinionBlock t={t as never} block={blockOf([request, answer])} team={TEAM} />)
    expect(card().getAttribute('data-collapsed')).toBeNull() // pedido em andamento: aberto, com a pergunta e a resposta
    expect(card().textContent).toContain('bom demais')
    view.rerender(<OpinionBlock t={t as never} block={blockOf([request, answer, final])} team={TEAM} />)
    expect(card().getAttribute('data-collapsed')).toBe('')
    expect(pill()).not.toBeNull()
    expect(card().textContent).not.toContain('bom demais')
  })

  it('depois de recolhido, a pessoa abre e a escolha dela FICA: um novo render não fecha de novo', () => {
    const view = render(<OpinionBlock t={t as never} block={blockOf([request, answer])} team={TEAM} />)
    view.rerender(<OpinionBlock t={t as never} block={blockOf([request, answer, final])} team={TEAM} />)
    fireEvent.click(pill() as HTMLElement)
    expect(card().getAttribute('data-collapsed')).toBeNull()
    view.rerender(<OpinionBlock t={t as never} block={blockOf([request, answer, final, msg('r2', 'nina', 'Nina', 'ok', ui({ kind: 'reply', mark: 'liked' }))])} team={TEAM} />)
    expect(card().getAttribute('data-collapsed')).toBeNull() // ela abriu: continua aberto
  })

  it('quem monta o fio já consolidado continua vendo a pílula (nada mudou para esse caminho)', () => {
    render(<OpinionBlock t={t as never} block={blockOf([request, answer, final])} team={TEAM} />)
    expect(card().getAttribute('data-collapsed')).toBe('')
  })

  it('sem consolidação o cartão fica aberto, rodada após rodada', () => {
    const view = render(<OpinionBlock t={t as never} block={blockOf([request])} team={TEAM} />)
    view.rerender(<OpinionBlock t={t as never} block={blockOf([request, answer])} team={TEAM} />)
    expect(card().getAttribute('data-collapsed')).toBeNull()
    expect(pill()).toBeNull()
  })
})
