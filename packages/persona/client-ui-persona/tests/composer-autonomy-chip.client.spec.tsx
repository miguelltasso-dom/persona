// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChannelComposer, WHO_RESPONDS_HINT_KEY } from '../src/client/chat/ChannelComposer.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import type { ChannelPersonaMember } from '../src/client/team/persona-work-state.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(chatPt, key, params)) as never
const TEAM: readonly ChannelPersonaMember[] = [
  { id: 'nina', name: 'Nina', role: 'Pesquisa', state: 'resting', systemRoles: ['coordination'] },
]

beforeEach(() => { localStorage.setItem(WHO_RESPONDS_HINT_KEY, '1') })
afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('chip de autonomia junto de "Quem responde" (UX-PHASE §10)', () => {
  it('no padrão ("Sugere e espera") o chip nem aparece', () => {
    render(<ChannelComposer t={t} members={TEAM} responderAutonomy="propose" />)
    expect(screen.queryByRole('button', { name: chatPt['composer.autonomy.on-request'] })).toBeNull()
    expect(screen.queryByRole('button', { name: chatPt['composer.autonomy.act-within-limits'] })).toBeNull()
  })

  it('"Sempre pergunta" e "Decide o rotineiro" aparecem e abrem o cartão da persona', () => {
    const onOpenPersonaCard = vi.fn()
    const { rerender } = render(
      <ChannelComposer t={t} members={TEAM} responderAutonomy="on-request" onOpenPersonaCard={onOpenPersonaCard} />,
    )
    fireEvent.click(screen.getByRole('button', { name: chatPt['composer.autonomy.on-request'] }))
    expect(onOpenPersonaCard).toHaveBeenCalledWith('nina')

    rerender(
      <ChannelComposer t={t} members={TEAM} responderAutonomy="act-within-limits" onOpenPersonaCard={onOpenPersonaCard} />,
    )
    fireEvent.click(screen.getByRole('button', { name: chatPt['composer.autonomy.act-within-limits'] }))
    expect(onOpenPersonaCard).toHaveBeenCalledTimes(2)
  })
})
