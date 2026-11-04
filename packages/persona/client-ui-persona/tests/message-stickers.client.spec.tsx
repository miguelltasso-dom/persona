// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { MessageList } from '../src/client/chat/GeneralChannelView.tsx'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import type { ChannelMessageUi } from '../src/client/remote/map-host-ui.ts'

afterEach(() => { cleanup() })
HTMLElement.prototype.scrollTo = () => {}

const t = ((key: keyof typeof chatPt, params?: Readonly<Record<string, string>>) => {
  let text: string = chatPt[key]
  if (params !== undefined) {
    for (const [name, value] of Object.entries(params)) text = text.replace(`{${name}}`, value)
  }
  return text
}) as PropsLocale<'persona.chat'>['t']

const NINA_MSG: ChannelMessageUi = {
  id: 'm1', authorId: 'nina', authorName: 'Nina', body: 'Pesquisa pronta.', timeLabel: '10:00',
  reactions: [{ stickerId: 'coracao', count: 2, actorIds: ['owner', 'bento'] }],
}
const USER_MSG: ChannelMessageUi = {
  id: 'm2', authorId: 'user', authorName: 'Você', body: 'Valeu!', timeLabel: '10:01', reactions: [],
}

describe('MessageList sticker reactions (Muse)', () => {
  it('draws the chip with the author animal sticker, a human label and toggles it', () => {
    const onToggle = vi.fn()
    render(<MessageList t={t} messages={[NINA_MSG]} memberId="owner" onToggleReaction={onToggle} />)
    const chip = screen.getByRole('button', { name: 'Coração: 2' })
    expect(chip.getAttribute('aria-pressed')).toBe('true')
    expect(chip.querySelector('img')).not.toBeNull()
    fireEvent.click(chip)
    expect(onToggle).toHaveBeenCalledWith('m1', 'coracao')
  })

  it('without reactions the + is a floating action (no extra row) and the human message uses the peer set', () => {
    const onToggle = vi.fn()
    const { container } = render(
      <MessageList t={t} messages={[USER_MSG]} memberId="owner" onToggleReaction={onToggle} userStickerAnimal="atlas" />,
    )
    expect(container.querySelector('ul[aria-label="Reações"]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Reagir com figurinha' }))
    const joinha = screen.getByRole('button', { name: 'Joinha' })
    expect(joinha.querySelector('img')).not.toBeNull()
    fireEvent.click(joinha)
    expect(onToggle).toHaveBeenCalledWith('m2', 'joinha')
  })

  it('no + at all when the host cannot react (no dead control)', () => {
    render(<MessageList t={t} messages={[USER_MSG]} />)
    expect(screen.queryByRole('button', { name: 'Reagir com figurinha' })).toBeNull()
  })
})
