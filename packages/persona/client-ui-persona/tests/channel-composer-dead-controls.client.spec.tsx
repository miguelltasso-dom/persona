// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChannelComposer } from '../src/client/chat/ChannelComposer.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'

installPreviewTheme()
afterEach(() => { cleanup() })
HTMLElement.prototype.scrollTo = () => {}

const t = (key: string) => chatPt[key as keyof typeof chatPt] ?? key

describe('ChannelComposer host-gated tools (Keel dead buttons)', () => {
  it('marks attachment and emoji tools aria-disabled with coming soon', () => {
    const onSend = vi.fn()
    render(<ChannelComposer t={t} members={[]} onSend={onSend} />)
    const image = screen.getByRole('button', {
      name: `${chatPt['composer.image']} — ${chatPt['composer.comingSoon']}`,
    })
    expect(image.getAttribute('aria-disabled')).toBe('true')
    expect((image as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(image)
    expect(onSend).not.toHaveBeenCalled()
  })

  it('still sends text when submit is enabled', () => {
    const onSend = vi.fn()
    render(<ChannelComposer t={t} members={[]} onSend={onSend} />)
    fireEvent.change(screen.getByPlaceholderText(chatPt['composer.placeholderChannel']), { target: { value: 'Oi' } })
    fireEvent.click(screen.getByRole('button', { name: chatPt['composer.send'] }))
    expect(onSend).toHaveBeenCalledWith('Oi', [])
  })
})
