// @vitest-environment jsdom
// COLHEITA-S1 · P2-01 parte B (Keel 05:48): a dica do chip de autonomia sai do dicionário do chat (ctx.locale), não de texto
// fixo em PT. Vermelho primeiro: com o dicionário em inglês, a dica ainda sai em português.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ChannelComposer, WHO_RESPONDS_HINT_KEY } from '../src/client/chat/ChannelComposer.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { en as chatEn, pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import type { ChannelPersonaMember } from '../src/client/team/persona-work-state.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}

const tPt = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(chatPt, key, params)) as never
const tEn = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(chatEn, key, params)) as never
const TEAM: readonly ChannelPersonaMember[] = [
  { id: 'nina', name: 'Nina', role: 'Pesquisa', state: 'resting', systemRoles: ['coordination'] },
]

beforeEach(() => { localStorage.setItem(WHO_RESPONDS_HINT_KEY, '1') })
afterEach(() => {
  cleanup()
  localStorage.clear()
})

// O Tooltip abre no pointerenter do âncora (primitives/Overlays.tsx), depois de 400 ms.
function hoverChip(name: string): void {
  const chip = screen.getByRole('button', { name })
  fireEvent.pointerOver(chip)
  fireEvent.pointerEnter(chip)
}

describe('P2-01 · dica do chip de autonomia vem do ctx.locale', () => {
  it('com o dicionário em inglês, "Sempre pergunta" explica em inglês', async () => {
    render(<ChannelComposer t={tEn} members={TEAM} responderAutonomy="on-request" />)
    hoverChip(chatEn['composer.autonomy.on-request'])
    expect(await screen.findByText('Nina always asks before any action.')).toBeTruthy()
    expect(screen.queryByText('Nina sempre pergunta antes de qualquer ação.')).toBeNull()
  })

  it('com o dicionário em inglês, "Decide o rotineiro" explica em inglês', async () => {
    render(<ChannelComposer t={tEn} members={TEAM} responderAutonomy="act-within-limits" />)
    hoverChip(chatEn['composer.autonomy.act-within-limits'])
    expect(await screen.findByText('Nina decides routine matters within the limits.')).toBeTruthy()
  })

  it('em português, a dica não muda', async () => {
    render(<ChannelComposer t={tPt} members={TEAM} responderAutonomy="on-request" />)
    hoverChip(chatPt['composer.autonomy.on-request'])
    expect(await screen.findByText('Nina sempre pergunta antes de qualquer ação.')).toBeTruthy()
  })
})
