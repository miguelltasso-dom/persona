// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { pt } from '../src/client/locale/shell/locales.ts'
import { DirectMessagesView } from '../src/client/chat/DirectMessagesView.tsx'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { shellTranslate } from '../src/client/preview/shell-translate.ts'
import { RailTeam, type RailPersona } from '../src/client/shell/RailTeam.tsx'

const chatT = ((key: string, params?: Readonly<Record<string, string>>) => bindLocale(chatPt, key, params)) as never

afterEach(() => { cleanup() })

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
    const names = within(screen.getByRole('list')).getAllByRole('button').map(button => button.getAttribute('aria-label')?.split(' · ')[0])
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
