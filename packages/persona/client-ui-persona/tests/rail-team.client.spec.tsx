// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { pt } from '../src/client/locale/shell/locales.ts'
import { DirectMessagesView } from '../src/client/chat/DirectMessagesView.tsx'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { shellTranslate } from '../src/client/preview/shell-translate.ts'
import { RailTeam, type RailPersona } from '../src/client/shell/RailTeam.tsx'

const chatT = ((key: string, params?: Readonly<Record<string, string>>) => bindLocale(chatPt, key, params)) as never

beforeEach(() => { localStorage.setItem('persona.rail.team.density.v1', 'list') })
afterEach(() => { cleanup(); localStorage.clear() })

function persona(id: string, state: RailPersona['state'], unread = 0): RailPersona {
  return { id, characterId: id, name: id[0]!.toUpperCase() + id.slice(1), role: 'Cargo', state, unread }
}

describe('RailTeam ("Sua equipe" no rail)', () => {
  it('orders who needs you first, then stuck, then working; resting/offline last', () => {
    render(
      <RailTeam
        t={shellTranslate}
        collapsed={false}
        members={[persona('luna', 'offline'), persona('sol', 'resting'), persona('bento', 'working'), persona('nina', 'waiting'), persona('atlas', 'stuck')]}
      />,
    )
    const names = within(screen.getByRole('list')).getAllByRole('button').map(button => button.getAttribute('aria-label')?.split(' · ')[0]).filter(name => name?.startsWith('Conversar') === true)
    expect(names).toEqual(['Conversar com Nina', 'Conversar com Atlas', 'Conversar com Bento', 'Conversar com Sol', 'Conversar com Luna'])
  })

  it('shows the top 6 and a "ver todos" toggle; hire + open DM call back', () => {
    const onHire = vi.fn()
    const onOpenDm = vi.fn()
    const many = Array.from({ length: 8 }, (_, index) => persona(`p${index}`, 'working', index === 7 ? 3 : 0))
    render(<RailTeam t={shellTranslate} collapsed={false} members={many} onHire={onHire} onOpenDm={onOpenDm} />)
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(6)
    fireEvent.click(screen.getByRole('button', { name: pt['sidebar.team.seeAll'].replace('{count}', '8') }))
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(8)
    fireEvent.click(screen.getByRole('button', { name: pt['sidebar.team.hire'] }))
    expect(onHire).toHaveBeenCalledOnce()
    fireEvent.click(within(screen.getByRole('list')).getAllByRole('button')[0]!)
    expect(onOpenDm).toHaveBeenCalledWith('p7')
  })
})

describe('DirectMessagesView', () => {
  it('empty list renders the illustrated empty state with one primary action', () => {
    const onNew = vi.fn()
    render(
      <DirectMessagesView
        t={chatT}
        shellT={shellTranslate}
        loading={false}
        dms={[]}
        selectedId={null}
        messages={[]}
        onSelect={() => undefined}
        onSend={() => undefined}
        onNewConversation={onNew}
      />,
    )
    expect(screen.getByRole('heading', { name: chatPt['dm.emptyTitle'] })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: chatPt['dm.newConversation'] }))
    expect(onNew).toHaveBeenCalledOnce()
  })
})

describe('RailTeam density', () => {
  it('short windows default to an avatars row that still exposes name and state', () => {
    localStorage.removeItem('persona.rail.team.density.v1')
    render(<RailTeam t={shellTranslate} collapsed={false} members={[persona('nina', 'waiting', 2)]} />)
    const toggle = screen.getByRole('button', { name: /Sua equipe/u })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByRole('button', { name: /Conversar com Nina · Cargo · Aguardando você · 2 não lidas/u })).toBeTruthy()
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
  })
})

describe('RailTeam persona card', () => {
  it('⋯ opens the persona card with the live "agora" line; Esc closes back to ⋯', () => {
    const onSend = vi.fn()
    render(<RailTeam t={shellTranslate} collapsed={false} members={[persona('nina', 'resting')]} onSendToPersona={onSend} />)
    const more = screen.getAllByRole('button').find(button => button.getAttribute('aria-haspopup') === 'dialog')
    if (more === undefined) throw new Error('no card trigger')
    fireEvent.click(more)
    const dialog = screen.getByRole('dialog', { name: 'Nina' })
    expect(within(dialog).getByText('Descansando — nada na fila')).toBeTruthy()
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Mensagem para Nina' }), { target: { value: 'Bom dia' } })
    fireEvent.submit(within(dialog).getByRole('textbox', { name: 'Mensagem para Nina' }))
    expect(onSend).toHaveBeenCalledWith('nina', 'Bom dia')
  })
})

describe('RailTeam first-run name (AG-002)', () => {
  it('exposes Conversar com and Sobre for a coordination name that is not Atlas', () => {
    render(
      <RailTeam
        t={shellTranslate}
        collapsed={false}
        members={[{
          id: 'onb-1',
          characterId: 'atlas',
          name: 'Probe E2E',
          role: 'Coordenação',
          state: 'resting',
          unread: 0,
        }]}
      />,
    )
    expect(screen.getByRole('button', { name: /Conversar com Probe E2E/u })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Sobre Probe E2E$/u })).toBeTruthy()
  })
})

describe('RailTeam keyboard card (UX-07)', () => {
  it('Shift+F10 on an avatar opens the persona card even in the avatars row', () => {
    localStorage.setItem('persona.rail.team.density.v1', 'avatars')
    render(<RailTeam t={shellTranslate} collapsed={false} members={[persona('nina', 'working')]} />)
    const avatar = screen.getByRole('button', { name: /Conversar com Nina/u })
    fireEvent.keyDown(avatar, { key: 'F10', shiftKey: true })
    expect(screen.getByRole('dialog', { name: 'Nina' })).toBeTruthy()
  })
})
