// @vitest-environment jsdom
// COLHEITA-S1 · P1-04 (Carbon; pedido da Muse 10:46, parte do cliente): o partial em streaming com corpo VAZIO (o host esvazia durante a
// correção de fim de turno) NÃO desenha o balão vazio; no lugar fica o indicador "digitando" (rosto + frase do passo + pontinhos), com
// a mesma altura, para o fio não pular. Com texto, o balão entra normal e sem o indicador. Vermelho primeiro (staging até o corte).
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BUBBLES_FLAG_KEY } from '../src/client/chat/bubbles-flag.ts'
import { GeneralChannelView } from '../src/client/chat/GeneralChannelView.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { typingPersona } from '../src/client/chat/typing-indicator.ts'
import { typingLineMembers } from '../src/client/chat/typing-line-members.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}
beforeEach(() => { localStorage.setItem(BUBBLES_FLAG_KEY, '1') })
afterEach(() => { cleanup(); localStorage.clear() })

const MEMBER = { id: 'nina' as const, name: 'Nina', role: 'Pesquisa', state: 'working' as const }

function channel(body: string) {
  return render(
    <GeneralChannelView
      t={key => chatPt[key as keyof typeof chatPt] ?? key}
      shellT={key => shellPt[key as keyof typeof shellPt] ?? key}
      members={[MEMBER]}
      messages={[
        { id: 'm1', authorId: 'user', authorName: 'Você', body: 'Pesquise os preços.', timeLabel: '11:00', reactions: [] },
        { id: 'm2', authorId: 'nina', authorName: 'Nina', authorPersonaId: 'nina', body, timeLabel: '11:00', reactions: [], streaming: true, replyToId: 'm1' },
      ]}
      memberId="owner"
    />,
  )
}

describe('P1-04 · partial vazio em streaming: sem balão vazio, com o indicador "digitando"', () => {
  it('corpo vazio: não desenha o balão em streaming', () => {
    const { container } = channel('')
    expect(container.querySelector('[data-streaming]')).toBeNull()
  })

  it('corpo vazio: o indicador "digitando" (rosto + pontinhos) fica no lugar do balão, na linha da persona', () => {
    const { container } = channel('')
    const row = container.querySelector('[data-message-id="m2"]') as HTMLElement | null
    expect(row).not.toBeNull()
    expect(row?.querySelector('[data-persona-typing]')).not.toBeNull()
  })

  it('com texto: o balão em streaming entra e o indicador some dessa linha', () => {
    const { container } = channel('Achei três concorrentes.')
    expect(container.querySelector('[data-streaming]')).not.toBeNull()
    const row = container.querySelector('[data-message-id="m2"]') as HTMLElement | null
    expect(row?.querySelector('[data-persona-typing]')).toBeNull()
  })

  // Muse (12:28): um 'digitando' por persona, nunca dois. Partial vazio da Bia + Bia digitando = 1 indicador só (na linha dela).
  it('um só digitando por persona: partial vazio da Bia e Bia digitando = 1 indicador', () => {
    const BIA = { id: 'bia' as never, name: 'Bia', role: 'Pesquisa', state: 'working' as const }
    const { container } = render(
      <GeneralChannelView
        t={key => chatPt[key as keyof typeof chatPt] ?? key}
        shellT={key => shellPt[key as keyof typeof shellPt] ?? key}
        members={[BIA]}
        messages={[
          { id: 'm1', authorId: 'user', authorName: 'Você', body: 'Pesquise os preços.', timeLabel: '11:00', reactions: [] },
          { id: 'm2', authorId: 'bia', authorName: 'Bia', authorPersonaId: 'bia', body: '', timeLabel: '11:00', reactions: [], streaming: true, replyToId: 'm1' },
        ]}
        memberId="owner"
      />,
    )
    expect(container.querySelectorAll('[data-persona-typing]')).toHaveLength(1)
  })
})

// Keel 12:38: o indicador de baixo lista quem trabalha MENOS quem já tem partial aberto; o Parar (typingPersona) fica intacto.
describe('P1-04 · embaixo: só quem trabalha sem partial aberto; Parar intacto', () => {
  const BIA = { id: 'bia' as never, name: 'Bia', role: 'Pesquisa', state: 'working' as const }
  const NINA = { id: 'nina' as never, name: 'Nina', role: 'Engenharia', state: 'working' as const }
  const partialBia = { id: 'm2', authorId: 'bia', authorName: 'Bia', authorPersonaId: 'bia', body: '', timeLabel: '11:00', reactions: [], streaming: true, replyToId: 'm1' } as never
  const userMsg = { id: 'm1', authorId: 'user', authorName: 'Você', body: 'Pesquise.', timeLabel: '11:00', reactions: [] } as never

  it('sem partial aberto, embaixo fica o responsável (o de sempre)', () => {
    expect(typingLineMembers([userMsg], [BIA, NINA], NINA)).toEqual([NINA])
  })

  it('com partial da Bia e a Nina trabalhando, embaixo fica só a Nina (a Bia já está na linha dela)', () => {
    expect(typingLineMembers([userMsg, partialBia], [BIA, NINA], null).map(member => member.name)).toEqual(['Nina'])
  })

  it('com partial da Bia e só ela trabalhando, embaixo não sobra ninguém (ela aparece uma vez, na linha)', () => {
    expect(typingLineMembers([userMsg, partialBia], [BIA], null)).toEqual([])
  })

  it('o Parar não muda: com um partial aberto, typingPersona continua sem responsável', () => {
    expect(typingPersona([userMsg, partialBia], [BIA, NINA])).toBeNull()
  })
})
