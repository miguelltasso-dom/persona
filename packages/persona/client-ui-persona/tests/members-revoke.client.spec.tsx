// @vitest-environment jsdom
// E13: o "Revogar acesso" da lista de membros só existe quando há o que fazer; sem handler seria um controle morto.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MembersView } from '../src/client/members/MembersView.tsx'
import { MOCK_MEMBERS } from '../src/client/members/mock-data.ts'
import { pt } from '../src/client/locale/members/locales.ts'

afterEach(() => { cleanup() })

describe('MembersView: revogar acesso', () => {
  it('without a handler no member card offers a button that does nothing', () => {
    render(<MembersView members={MOCK_MEMBERS} />)
    expect(screen.queryByRole('button', { name: pt['action.revoke'] })).toBeNull()
  })

  it('with a handler, every member but the person themself can be revoked, with that member\'s id', () => {
    const onRevoke = vi.fn()
    render(<MembersView members={MOCK_MEMBERS} onRevokeMember={onRevoke} />)
    const others = MOCK_MEMBERS.filter(member => member.isSelf !== true)
    const buttons = screen.getAllByRole('button', { name: pt['action.revoke'] })
    expect(buttons).toHaveLength(others.length)
    fireEvent.click(buttons[0]!)
    expect(onRevoke).toHaveBeenCalledWith(others[0]!.id)
  })
})
