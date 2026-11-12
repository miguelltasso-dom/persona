// @vitest-environment jsdom
// Muse (tickets de leigo, 12/11): (1) o rail nunca desenha a inicial de uma persona; (2) a DM com um assunto só não mostra o chip "Geral";
// (3) as boas-vindas do produto são uma linha centrada, sem autor; (4) "Probe · Probe" aparece uma vez; (5) "1 membro" / "2 membros".
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { roleAfterName } from '../src/client/chat/author-role.ts'
import { MessageList, type GeneralChannelViewProps } from '../src/client/chat/GeneralChannelView.tsx'
import type { ConversationSubjectUi } from '../src/client/chat/conversation-subjects.ts'
import { isProductVoice } from '../src/client/chat/SystemLine.tsx'
import { SubjectBar } from '../src/client/chat/SubjectBar.tsx'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { shellTranslate } from '../src/client/preview/shell-translate.ts'
import type { ChannelMessageUi } from '../src/client/remote/map-host-ui.ts'
import { RailTeam, type RailPersona } from '../src/client/shell/RailTeam.tsx'
import type { ChannelPersonaMember } from '../src/client/team/persona-work-state.ts'
import { TeamChannelStrip } from '../src/client/team/TeamChannelStrip.tsx'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}
beforeEach(() => { localStorage.setItem('persona.rail.team.density.v1', 'list') })
afterEach(() => { cleanup(); localStorage.clear() })

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(chatPt, key, params)) as GeneralChannelViewProps['t']

describe('(1) o rail nunca desenha a inicial de uma persona', () => {
  const probe: RailPersona = { id: 'probe', characterId: 'probe-sem-bicho' as RailPersona['characterId'], name: 'Probe', role: 'Qualidade', state: 'resting', unread: 0 }

  it('um personagem que a galeria não conhece (Probe) ganha o mesmo bicho estável do cabeçalho da DM, nunca "P"', () => {
    render(<RailTeam t={shellTranslate} collapsed={false} members={[probe]} />)
    const row = screen.getByRole('list').querySelector('li') as HTMLElement
    expect(row.querySelector('img')).not.toBeNull()
    expect(row.querySelector('[class*="initials"]')).toBeNull() // nada de quadrado âmbar com a letra
  })

  it('L2: função igual ao nome ("Probe Probe") aparece uma vez só no rail; função diferente continua', () => {
    render(<RailTeam t={shellTranslate} collapsed={false} members={[{ ...probe, role: 'Probe' }, { ...probe, id: 'nina', characterId: 'nina', name: 'Nina', role: 'Pesquisa' }]} />)
    const rows = Array.from(screen.getByRole('list').querySelectorAll('li'))
    expect(rows.find(row => row.textContent?.includes('Probe'))?.textContent?.match(/Probe/gu)).toHaveLength(1)
    expect(rows.some(row => row.textContent?.includes('Pesquisa'))).toBe(true)
  })
})

describe('(2) a DM com um assunto só: sem o chip "Geral"', () => {
  const ONE: readonly ConversationSubjectUi[] = [{ id: 'geral', name: 'Geral', colorIndex: 0, unreadCount: 0 }]
  const TWO: readonly ConversationSubjectUi[] = [...ONE, { id: 'ui', name: 'UI', colorIndex: 4, unreadCount: 0 }]

  it('com um assunto e hideSingleTab o chip não é desenhado, mas o "+" fica', () => {
    render(<SubjectBar t={t as never} subjects={ONE} activeSubjectId="geral" onSelect={() => undefined} onCreate={() => undefined} hideSingleTab />)
    expect(screen.queryByRole('tab')).toBeNull()
    expect(screen.queryByText('Geral')).toBeNull()
    expect(screen.getByRole('button', { name: /assunto/iu })).toBeTruthy()
  })

  it('com mais de um assunto o chip volta; sem hideSingleTab (o #geral) nada muda', () => {
    render(<SubjectBar t={t as never} subjects={TWO} activeSubjectId="geral" onSelect={() => undefined} hideSingleTab />)
    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Geral'), expect.stringContaining('UI')]))
    cleanup()
    render(<SubjectBar t={t as never} subjects={ONE} activeSubjectId="geral" onSelect={() => undefined} />)
    expect(screen.getByRole('tab', { name: /Geral/u })).toBeTruthy()
  })

  it('o texto do campo: "Escreva para Probe…" (e nunca "Mensagem em Geral para Probe…" com um assunto só)', () => {
    expect(t('composer.placeholderDm', { name: 'Probe' })).toBe('Escreva para Probe…')
  })

  it('L3: com um assunto só não sobra o "···" solto: só "+ Assunto", com o rótulo visível; com mais de um volta o menu e o "+" de ícone', () => {
    const onCreate = vi.fn()
    render(<SubjectBar t={t as never} subjects={ONE} activeSubjectId="geral" onSelect={() => undefined} onCreate={onCreate} onRename={() => undefined} hideSingleTab />)
    expect(screen.queryByRole('button', { name: /Mais opções|Mais sobre/iu })).toBeNull()
    expect(document.querySelector('[aria-haspopup="menu"]')).toBeNull()
    const add = screen.getByRole('button', { name: 'Assunto' })
    expect(add.textContent).toContain('Assunto')
    fireEvent.click(add)
    expect(onCreate).toHaveBeenCalledTimes(1)
    cleanup()
    render(<SubjectBar t={t as never} subjects={TWO} activeSubjectId="geral" onSelect={() => undefined} onCreate={() => undefined} onRename={() => undefined} hideSingleTab />)
    expect(document.querySelector('[aria-haspopup="menu"]')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Novo assunto' })).toBeTruthy()
  })
})

describe('(3) as boas-vindas do produto: uma linha centrada, sem autor', () => {
  const welcome = (extra: Partial<ChannelMessageUi> = {}): ChannelMessageUi => ({ id: 'onb-welcome', authorId: 'system', authorName: 'system', body: 'Boas-vindas à Persona.', timeLabel: '09:00', reactions: [], ...extra })

  it('quem escreve é o produto: o autor "system" (em qualquer caixa), nunca uma persona', () => {
    expect(isProductVoice({ authorId: 'system', authorName: 'system' })).toBe(true)
    expect(isProductVoice({ authorId: 'System', authorName: 'x' })).toBe(true)
    expect(isProductVoice({ authorId: 'nina', authorName: 'Nina' })).toBe(false)
    expect(isProductVoice({ authorId: 'system-admin', authorName: 'Admin' })).toBe(false)
  })

  it('no fio vira "Boas-vindas à Persona." centrada, sem a inicial S, sem nome e sem a palavra system', () => {
    render(<MessageList t={t} messages={[welcome()]} />)
    const line = document.querySelector('[data-system-line]') as HTMLElement
    expect(line.textContent).toBe('Boas-vindas à Persona.')
    expect(document.body.textContent).not.toMatch(/system/iu)
    expect(document.body.textContent).not.toMatch(/\bS\b/u)
  })
})

describe('(4) "Probe · Probe" aparece uma vez', () => {
  it('função igual ao nome (qualquer caixa, com espaços) some; função diferente fica; sem função, nada', () => {
    expect(roleAfterName('Probe', 'Probe')).toBe('')
    expect(roleAfterName('  probe ', 'PROBE')).toBe('')
    expect(roleAfterName('Qualidade', 'Probe')).toBe('Qualidade')
    expect(roleAfterName(undefined, 'Probe')).toBe('')
    expect(roleAfterName('   ', 'Probe')).toBe('')
  })
})

describe('(5) o plural do cabeçalho é de verdade', () => {
  const member = (id: ChannelPersonaMember['id'], name: string): ChannelPersonaMember => ({ id, name, role: 'Cargo', state: 'resting' })

  it('"1 membro" e "2 membros"', () => {
    render(<TeamChannelStrip t={shellTranslate} members={[member('nina', 'Nina')]} />)
    expect(screen.getByText('1 membro')).toBeTruthy()
    expect(screen.queryByText('1 membros')).toBeNull()
    cleanup()
    render(<TeamChannelStrip t={shellTranslate} members={[member('nina', 'Nina'), member('bento', 'Bento')]} />)
    expect(screen.getByText('2 membros')).toBeTruthy()
  })
})
