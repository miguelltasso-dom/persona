// @vitest-environment jsdom
// Item 22 (atrás de `persona.flag.channelSections`): a barra desenha os canais como o host os arruma (sem seção primeiro, depois uma seção por equipe, recolhível);
// clicar num canal abre ESSE canal. Sem o layout, é a lista de Canais de sempre.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { ConversationsRail } from '../src/client/shell/ConversationsRail.tsx'
import type { ConversationsSource } from '../src/client/shell/conversations-source.ts'

const t = ((key: string, params?: Record<string, string | number>) => bindLocale(shellPt, key, params)) as never

afterEach(() => { cleanup(); localStorage.clear() })

const GERAL = { id: 'geral', name: 'geral', unread: 0 }
const LAYOUT = {
  humanCount: 1,
  sections: [
    { id: null, name: null, faceIds: [], channels: [{ id: 'geral', name: 'geral', kind: 'general' }] },
    { id: 'sec-vendas', name: 'Vendas', teamId: 'team-vendas', faceIds: [], channels: [{ id: 'canal-vendas', name: 'vendas', kind: 'team', teamId: 'team-vendas' }, { id: 'canal-promo', name: 'promocoes', kind: 'custom' }] },
  ],
}

function mount(source: ConversationsSource, active: Parameters<typeof ConversationsRail>[0]['active'] = null) {
  const openConversation = vi.fn()
  render(<ConversationsRail t={t} source={source} active={active} openConversation={openConversation} />)
  return openConversation
}

describe('com o layout do host', () => {
  it('desenha o canal sem seção e a seção da equipe com os canais dentro (nada da lista plana de Canais)', () => {
    mount({ channels: [GERAL], people: [], layout: LAYOUT })
    expect(screen.getByText('geral')).toBeTruthy()
    expect(screen.getByText('Vendas')).toBeTruthy()
    expect(screen.getByText('vendas')).toBeTruthy()
    expect(screen.getByText('promocoes')).toBeTruthy()
  })

  it('clicar num canal abre ESSE canal', () => {
    const openConversation = mount({ channels: [GERAL], people: [], layout: LAYOUT })
    fireEvent.click(screen.getByText('vendas'))
    expect(openConversation).toHaveBeenCalledWith({ kind: 'channel', id: 'canal-vendas' })
  })

  it('o canal aberto é a linha ativa', () => {
    mount({ channels: [GERAL], people: [], layout: LAYOUT }, { kind: 'channel', id: 'canal-promo' })
    const active = document.querySelector('[aria-current="page"]') as HTMLElement
    expect(active.textContent).toContain('promocoes')
  })

  it('recolher a seção fecha os canais dela (o corpo fica inerte: a seção fecha em altura) e a barra lembra', () => {
    mount({ channels: [GERAL], people: [], layout: LAYOUT })
    expect(screen.getByText('promocoes').closest('[inert]')).toBeNull()
    fireEvent.click(screen.getByText('Vendas'))
    expect(screen.getByText('promocoes').closest('[inert]')).not.toBeNull()
    expect(screen.getByText('geral').closest('[inert]')).toBeNull() // o canal sem seção nunca recolhe
    cleanup()
    mount({ channels: [GERAL], people: [], layout: LAYOUT })
    expect(screen.getByText('promocoes').closest('[inert]')).not.toBeNull() // lembrado
  })
})

describe('sem o layout (o padrão)', () => {
  it('a lista de Canais de sempre', () => {
    mount({ channels: [GERAL], people: [] })
    expect(screen.getByText('geral')).toBeTruthy()
    expect(screen.queryByText('Vendas')).toBeNull()
  })
})
