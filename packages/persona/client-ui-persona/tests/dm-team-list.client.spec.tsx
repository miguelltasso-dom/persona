// @vitest-environment jsdom
// A-2 (NAV-SPEC regra 4): a lista de DMs mostra a equipe inteira; quem nunca conversou aparece com "Começar conversa".
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DirectMessagesView, type DmRowUi } from '../src/client/chat/DirectMessagesView.tsx'
import type { SelectablePersonaOption } from '../src/client/chat/NewDmPersonaModal.tsx'
import { appendNotStartedRows } from '../src/client/remote/dm-team-rows.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { shellTranslate } from '../src/client/preview/shell-translate.ts'

HTMLElement.prototype.scrollTo = () => {}
afterEach(() => { cleanup() })

const t = ((key: string, params?: Readonly<Record<string, string>>) => bindLocale(chatPt, key, params)) as never

const TEAM: readonly SelectablePersonaOption[] = [
  { id: 'p-atlas', name: 'Atlas', role: 'Coordenação', characterId: 'atlas', hasExistingDm: false },
  { id: 'p-bento', name: 'Bento', role: 'Engenharia', characterId: 'bento', hasExistingDm: false },
  { id: 'p-nina', name: 'Nina', role: 'Pesquisa', characterId: 'nina', hasExistingDm: true },
  { id: 'p-sol', name: 'Sol', role: 'Atendimento', characterId: 'sol', hasExistingDm: false },
  { id: 'p-luna', name: 'Luna', role: 'Conteúdo', characterId: 'luna', hasExistingDm: false },
]
const NINA_DM: DmRowUi = { id: 'dm-nina', peerId: 'p-nina', peerName: 'Nina', characterId: 'nina', role: 'Pesquisa' }

describe('appendNotStartedRows', () => {
  it('com 5 personas e só a Nina conversada, as 5 aparecem: a Nina primeiro, as outras 4 como "não começadas"', () => {
    const rows = appendNotStartedRows([NINA_DM], TEAM)
    expect(rows.map(row => row.peerName)).toEqual(['Nina', 'Atlas', 'Bento', 'Sol', 'Luna'])
    expect(rows[0]?.notStarted).toBeUndefined()
    expect(rows.slice(1).every(row => row.notStarted === true)).toBe(true)
    expect(rows[1]).toMatchObject({ id: 'start:p-atlas', peerId: 'p-atlas', role: 'Coordenação', characterId: 'atlas' })
  })

  it('ninguém repetido: quem já tem DM não ganha uma linha "Começar conversa"', () => {
    const rows = appendNotStartedRows([NINA_DM], TEAM)
    expect(rows.filter(row => row.peerName === 'Nina')).toHaveLength(1)
  })

  it('equipe toda conversada ou sem equipe: a lista fica como veio', () => {
    expect(appendNotStartedRows([NINA_DM], [{ id: 'p-nina', name: 'Nina', hasExistingDm: true }])).toEqual([NINA_DM])
    expect(appendNotStartedRows([], [])).toEqual([])
  })
})

describe('lista de DMs com a equipe inteira', () => {
  function renderList(onSelect = vi.fn(), onSelectPersonaForNewDm = vi.fn()) {
    render(
      <DirectMessagesView
        t={t}
        shellT={shellTranslate}
        loading={false}
        dms={appendNotStartedRows([NINA_DM], TEAM)}
        selectedId="dm-nina"
        messages={[]}
        onSelect={onSelect}
        onSend={() => undefined}
        availablePersonas={TEAM}
        onSelectPersonaForNewDm={onSelectPersonaForNewDm}
      />,
    )
    return { onSelect, onSelectPersonaForNewDm }
  }

  it('mostra as 5 personas; as 4 sem conversa dizem "Começar conversa"', () => {
    renderList()
    const list = screen.getByRole('list', { name: chatPt['dm.listTitle'] })
    expect(within(list).getAllByRole('listitem')).toHaveLength(5)
    expect(within(list).getAllByText(chatPt['dm.startConversation'])).toHaveLength(4)
    // a conversa que já existe mostra a função, não o convite
    expect(within(list).getByRole('button', { name: /Nina/u }).textContent).toContain('Pesquisa')
  })

  it('clicar em quem nunca conversou abre a DM dessa persona (não tenta selecionar uma DM que não existe)', () => {
    const { onSelect, onSelectPersonaForNewDm } = renderList()
    fireEvent.click(within(screen.getByRole('list', { name: chatPt['dm.listTitle'] })).getByRole('button', { name: /Bento/u }))
    expect(onSelectPersonaForNewDm).toHaveBeenCalledWith('p-bento')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('clicar numa conversa existente seleciona a DM', () => {
    const { onSelect, onSelectPersonaForNewDm } = renderList()
    fireEvent.click(within(screen.getByRole('list', { name: chatPt['dm.listTitle'] })).getByRole('button', { name: /Nina/u }))
    expect(onSelect).toHaveBeenCalledWith('dm-nina')
    expect(onSelectPersonaForNewDm).not.toHaveBeenCalled()
  })

  it('só a conversa aberta fica marcada como atual; as linhas "Começar conversa" nunca', () => {
    renderList()
    const items = within(screen.getByRole('list', { name: chatPt['dm.listTitle'] })).getAllByRole('button')
    expect(items.filter(button => button.getAttribute('aria-current') === 'true')).toHaveLength(1)
    expect(items.filter(button => button.hasAttribute('data-not-started'))).toHaveLength(4)
  })
})
