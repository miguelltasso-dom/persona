// @vitest-environment jsdom
// DESIGN-01 (Muse, 11/11) #04 "Fio limpo": a folhinha (MessageSprig) sai dos balões comuns (o acento botânico fica só nos cartões
// DailyBrief e Milestone, que têm o seu), e a fila (QueuedMessageBubble) nunca tem a borda tracejada cortada. (O chip de referência com o ícone
// `attach` e sem emoji está em `fio-opinion-pill.client.spec.tsx`.)
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BUBBLES_FLAG_KEY } from '../src/client/chat/bubbles-flag.ts'
import { MessageList } from '../src/client/chat/GeneralChannelView.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import type { ChannelMessageUi } from '../src/client/remote/map-host-ui.ts'
import type { TeamView } from '../src/client/remote/persona-remote-types.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}
beforeEach(() => { localStorage.setItem(BUBBLES_FLAG_KEY, '1') })
afterEach(() => { cleanup(); localStorage.clear() })

const t = (key: string, params?: Readonly<Record<string, string | number>>) => {
  const raw = chatPt[key as keyof typeof chatPt] ?? key
  return params === undefined ? raw : raw.replace(/\{(\w+)\}/gu, (_m, name: string) => String(params[name] ?? ''))
}
const TEAM = { members: [], personas: [{ id: 'p-nina', name: 'Nina', title: 'Pesquisa' }] } as unknown as TeamView
const msg = (id: string, authorId: string, timeLabel: string, body: string): ChannelMessageUi => ({
  id, authorId, authorName: authorId === 'user' ? 'Você' : 'Nina', body, timeLabel, reactions: [], ...(authorId === 'user' ? {} : { authorPersonaId: 'p-nina' }),
})
const src = (name: string): string => readFileSync(join(__dirname, '..', 'src', 'client', 'chat', name), 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '')

describe('a folhinha sai dos balões comuns', () => {
  it('um grupo de 3 balões da persona não tem nenhuma folhinha (antes: uma no 1º de cada grupo)', () => {
    const { container } = render(<MessageList t={t as never} team={TEAM} messages={[msg('m1', 'nina', '14:02', 'Achei 3 concorrentes.'), msg('m2', 'nina', '14:03', 'Comparei os preços.'), msg('m3', 'nina', '14:04', 'Quer que eu atualize?')]} />)
    expect(container.querySelectorAll('[data-persona-bubble]')).toHaveLength(3)
    expect(container.querySelectorAll('[data-persona-sprig]')).toHaveLength(0)
  })

  it('o fio não carrega mais o componente nem o estilo da folhinha do balão (nada dormente)', () => {
    expect(existsSync(join(__dirname, '..', 'src', 'client', 'chat', 'MessageSprig.tsx'))).toBe(false)
    expect(src('GeneralChannelView.tsx')).not.toMatch(/MessageSprig/u)
    expect(src('GeneralChannelView.module.css')).not.toMatch(/\.sprig\b/u)
  })
})

describe('a fila nunca tem a borda tracejada cortada', () => {
  const rule = /\.queuedMessage\s*\{([^}]*)\}/u.exec(src('QueuedMessageBubble.module.css'))?.[1] ?? ''

  it('o balão deixa a borda para fora (overflow visível), com respiro de 8 px em cima e ao rolar até ele', () => {
    expect(rule).toMatch(/overflow:\s*visible/u)
    expect(rule).toMatch(/margin:\s*var\(--persona-space-2\)\s+0/u)
    expect(rule).toMatch(/scroll-margin-top:\s*var\(--persona-space-2\)/u)
  })
})
