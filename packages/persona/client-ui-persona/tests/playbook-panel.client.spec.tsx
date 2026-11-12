// @vitest-environment jsdom
// Item 16 (Muse §16b): the tab "Jeito de trabalhar" — how a persona works, learned quietly. Words not "3×", no article for a persona,
// the decision lives in Aprovações, "Esquecer" confirms on the card with the focus on "Manter", the states are text only.
import type { ApprovalView, PlaybookNoteView } from '@deepseek-ai/dsh-persona-host/types'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReactiveApprovalsList } from '../src/client/approvals/ReactiveApprovalsList.tsx'
import { approvalViewToItem, isSkillOffer } from '../src/client/data/adapters/approvals.ts'
import { pt as approvalsPt } from '../src/client/locale/approvals/locales.ts'
import { Button } from '../src/client/primitives/index.ts'
import { createShellStore } from '../src/client/shell/create-shell-store.ts'
import { PlaybookPanel } from '../src/client/playbook/PlaybookPanel.tsx'
import { PersonaProfilePage } from '../src/client/profile/PersonaProfilePage.tsx'
import { MOCK_PROFILE_ATLAS } from '../src/client/profile/mock-data.ts'

afterEach(cleanup)

// Calendar days, never "now − N hours": near midnight that lands on the wrong day.
const YESTERDAY = (() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12).toISOString() })()
const TODAY = (() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12).toISOString() })()

const row = (over: Partial<PlaybookNoteView> & Pick<PlaybookNoteView, 'id' | 'title'>): PlaybookNoteView => ({
  personaId: 'bia', uses: 1, lastAt: YESTERDAY, stage: 'learning', progress: 1, goal: 3, adjustments: [], ...over,
})

const LEARNING = row({ id: 'n1', title: 'Resposta ao cliente sobre a entrega' })
const WAITING = row({ id: 'n2', title: 'Legenda do post de sexta', uses: 3, progress: 3, stage: 'ready', lastAt: TODAY })
/** The CSS-module class tokens that make a Button "s" (32 px) vs "m" (40 px), and "danger" vs "primary" (amber): read off real buttons, never hard-coded. */
function buttonTokens(): { readonly s: string; readonly m: string; readonly danger: string; readonly primary: string } {
  const { container, unmount } = render(<><Button size="s" variant="secondary">a</Button><Button size="m" variant="secondary">b</Button><Button variant="danger">c</Button><Button variant="primary">d</Button></>)
  const [small, medium, danger, primary] = [...container.querySelectorAll('button')].map(node => new Set(node.className.split(/\s+/u)))
  unmount()
  const only = (a: Set<string>, b: Set<string>): string => [...a].find(token => !b.has(token)) ?? ''
  return { s: only(small!, medium!), m: only(medium!, small!), danger: only(danger!, primary!), primary: only(primary!, danger!) }
}
const classesOf = (name: string): readonly string[] => screen.getByRole('button', { name }).className.split(/\s+/u)

const OFFERED = row({ id: 'n3', title: 'Cartaz da promoção de pão de queijo', uses: 3, progress: 3, stage: 'offered', approvalId: 'skill-offer-pb-bia-x', adjustments: ['Preço maior', 'Sem ponto de exclamação', 'Fundo claro', 'Letra grande'] })
const SKILL = row({ id: 'n4', title: 'Foto de produto com fundo claro', uses: 4, progress: 3, stage: 'skill', lastAt: '2025-03-04T12:00:00.000Z' })

describe('PlaybookPanel: the cards', () => {
  it('says what it is for, by name and with no article, and keeps the learning out of the chat', () => {
    render(<PlaybookPanel personaName="Bia" rows={[LEARNING]} />)
    expect(screen.getByRole('heading', { name: 'Jeito de trabalhar' })).toBeTruthy()
    expect(screen.getByText('O que Bia aprendeu com as entregas que você usou. Fica aqui, sem aparecer na conversa.')).toBeTruthy()
  })

  it('a card: the kind of work, "Usado N vezes · o último …" in words, and the stage in a neutral chip', () => {
    render(<PlaybookPanel personaName="Bia" rows={[LEARNING, WAITING, OFFERED, SKILL]} />)
    expect(screen.getByRole('heading', { name: 'Resposta ao cliente sobre a entrega' })).toBeTruthy()
    expect(screen.getByText('Usado 1 vez · o último ontem')).toBeTruthy()
    expect(screen.getByText('Usado 3 vezes hoje · falta usar em outro dia')).toBeTruthy() // "Quase pronto": all the uses on one day (Muse 01:10)
    expect(screen.getByText('Usado 4 vezes · o último em 04/03/2025')).toBeTruthy()
    expect(screen.getByText('Aprendendo · 1 de 3')).toBeTruthy()
    expect(screen.getByText('Quase pronto')).toBeTruthy()
    expect(document.body.textContent).not.toContain('falta outro dia') // a layperson does not read "falta outro dia" as a stage
    expect(screen.getByText('Pronto para virar skill')).toBeTruthy()
    expect(screen.getByText('Já é skill')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/\d×/u)
  })

  it('a note with no use yet (only what the owner asked to change) says so', () => {
    render(<PlaybookPanel personaName="Bia" rows={[row({ id: 'n0', title: 'Cartaz', uses: 0, progress: 0, adjustments: ['Mais curto'] })]} />)
    expect(screen.getByText('Ainda sem entrega usada')).toBeTruthy()
  })

  it('"Decidir em Aprovações" only where an offer waits, and it goes there', () => {
    const onDecide = vi.fn()
    render(<PlaybookPanel personaName="Bia" rows={[LEARNING, OFFERED]} actions={{ onDecide }} />)
    const links = screen.getAllByRole('button', { name: 'Decidir em Aprovações' })
    expect(links).toHaveLength(1)
    fireEvent.click(links[0]!)
    expect(onDecide).toHaveBeenCalledOnce()
  })

  it('what the owner asked for: the label and three quotes in curly quotes, then "Ver tudo" for the rest', () => {
    const { container } = render(<PlaybookPanel personaName="Bia" rows={[OFFERED]} />)
    expect(screen.getByText('O que você costuma pedir:')).toBeTruthy()
    const quotes = (): string[] => [...container.querySelectorAll('li')].map(node => node.textContent ?? '').filter(text => text.startsWith('“'))
    expect(quotes()).toEqual(['“Preço maior”', '“Sem ponto de exclamação”', '“Fundo claro”'])
    fireEvent.click(screen.getByRole('button', { name: 'Ver tudo' }))
    expect(quotes()).toHaveLength(4)
    fireEvent.click(screen.getByRole('button', { name: 'Ver menos' }))
    expect(quotes()).toHaveLength(3)
    cleanup()
    render(<PlaybookPanel personaName="Bia" rows={[row({ id: 'n5', title: 'Cartaz', adjustments: ['Um', 'Dois', 'Três'] })]} />)
    expect(screen.queryByRole('button', { name: 'Ver tudo' })).toBeNull() // three or fewer: nothing hidden
  })
})

describe('PlaybookPanel: Esquecer', () => {
  it('confirms on the card with "Sim, esquecer" and "Manter", the focus on "Manter"; Manter leaves everything as it was', () => {
    const onForget = vi.fn().mockResolvedValue(undefined)
    render(<PlaybookPanel personaName="Bia" rows={[LEARNING]} actions={{ onForget }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Esquecer' }))
    expect(screen.getByRole('group', { name: 'Esquecer este jeito de trabalhar' })).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Manter' }))
    fireEvent.click(screen.getByRole('button', { name: 'Manter' }))
    expect(onForget).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Esquecer' })).toBeTruthy()
  })

  it('"Sim, esquecer" asks the host; if it refuses the card stays and says so', async () => {
    const onForget = vi.fn().mockRejectedValue(new Error('nope'))
    render(<PlaybookPanel personaName="Bia" rows={[LEARNING]} actions={{ onForget }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Esquecer' }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Sim, esquecer' })) })
    expect(onForget).toHaveBeenCalledWith(LEARNING)
    expect(screen.getByRole('alert').textContent).toMatch(/A memória ficou como estava/u)
    expect(screen.getByRole('heading', { name: 'Resposta ao cliente sobre a entrega' })).toBeTruthy()
  })

  it('no handler, no button (never one that does nothing)', () => {
    render(<PlaybookPanel personaName="Bia" rows={[LEARNING]} />)
    expect(screen.queryByRole('button', { name: 'Esquecer' })).toBeNull()
  })

  it('"Sim, esquecer" is the DANGER button (amber is the product\'s "go ahead"), and "Manter" is the quiet one with the focus (Muse 12/11)', () => {
    const tokens = buttonTokens()
    expect(tokens.danger).not.toBe('')
    render(<PlaybookPanel personaName="Bia" rows={[LEARNING]} actions={{ onForget: vi.fn().mockResolvedValue(undefined) }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Esquecer' }))
    expect(classesOf('Sim, esquecer')).toContain(tokens.danger)
    expect(classesOf('Sim, esquecer')).not.toContain(tokens.primary)
    expect(classesOf('Manter')).not.toContain(tokens.danger)
    expect(classesOf('Manter')).not.toContain(tokens.primary)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Manter' }))
  })

  it('"A skill que já saiu dele continua." only when the way of working already IS a skill; otherwise "{nome} deixa de usar." (no article)', () => {
    const ask = (rows: PlaybookNoteView[]): string => {
      const { container, unmount } = render(<PlaybookPanel personaName="Bia" rows={rows} actions={{ onForget: vi.fn().mockResolvedValue(undefined) }} />)
      fireEvent.click(screen.getByRole('button', { name: 'Esquecer' }))
      const text = container.querySelector('[role="group"] p')?.textContent ?? ''
      unmount()
      return text
    }
    expect(ask([SKILL])).toBe('Esquecer este jeito? A skill que já saiu dele continua.')
    for (const one of [LEARNING, WAITING, OFFERED]) {
      const text = ask([one])
      expect(text).toBe('Esquecer este jeito? Bia deixa de usar.')
      expect(text).not.toContain('skill')
      expect(text).not.toMatch(/\b(?:a|à|o|ao) Bia\b/u)
    }
  })
})

describe('PlaybookPanel: the states (text only)', () => {
  it('empty: "Nada aprendido ainda." and the one action, a DM with her by name, no illustration', () => {
    const onMessage = vi.fn()
    const { container } = render(<PlaybookPanel personaName="Bia" rows={[]} onMessage={onMessage} />)
    expect(screen.getByText('Nada aprendido ainda.')).toBeTruthy()
    expect(screen.getByText('Quando você usar uma entrega de Bia, o jeito de fazer fica anotado aqui.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Conversar com Bia' }))
    expect(onMessage).toHaveBeenCalledOnce()
    expect(container.querySelector('img, svg')).toBeNull()
    cleanup()
    render(<PlaybookPanel personaName="Bia" rows={[]} />)
    expect(screen.queryByRole('button', { name: 'Conversar com Bia' })).toBeNull()
  })

  it('loading: two quiet blocks (busy for the reader, nothing animated)', () => {
    const { container } = render(<PlaybookPanel personaName="Bia" rows={[]} initialState="loading" />)
    expect(container.querySelector('section')?.getAttribute('aria-busy')).toBe('true')
    expect(container.querySelectorAll('[data-persona-playbook-skeleton] > li')).toHaveLength(2)
  })

  it('error: "Não consegui carregar agora." and "Tentar de novo"', () => {
    const onRetry = vi.fn()
    render(<PlaybookPanel personaName="Bia" rows={[]} initialState="error" onRetry={onRetry} />)
    expect(screen.getByRole('alert').textContent).toContain('Não consegui carregar agora.')
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('no state ever puts an article before a persona\'s name', () => {
    for (const rows of [[LEARNING, OFFERED, SKILL], []]) {
      const { container, unmount } = render(<PlaybookPanel personaName="Bia" rows={rows} onMessage={() => undefined} />)
      expect(container.textContent).not.toMatch(/\b(?:a|à|o|ao) Bia\b/u)
      unmount()
    }
  })
})

describe('Aprovações: the offer card', () => {
  const offer = (over: Partial<ApprovalView> = {}): ApprovalView => ({
    id: 'skill-offer-pb-bia-x', kind: 'skill', title: 'Bia aprendeu: Legenda do post de sexta',
    question: 'Usado 3 vezes em 2 dias.',
    status: 'pending', personaId: 'bia', personaName: 'Bia', ...over,
  })
  const listOf = (view: ApprovalView, onDecideItem = vi.fn(), extra: { readonly exitStampId?: string; readonly onOpenSkills?: (personaId: string) => void } = {}) => {
    render(
      <ReactiveApprovalsList
        dict={approvalsPt}
        items={[approvalViewToItem(view)]}
        scopeFor={() => undefined}
        exitStampId={extra.exitStampId ?? null}
        {...(extra.onOpenSkills === undefined ? {} : { onOpenSkills: extra.onOpenSkills })}
        rememberFor={() => ({ grant: false, validity: 'once' })}
        rememberStampNote={null}
        onRememberChange={() => {}}
        onCelebrateAccept={() => {}}
        onDecideItem={onDecideItem}
      />,
    )
    return onDecideItem
  }

  it('only the host\'s own offers (skill-offer-…) are recognized', () => {
    expect(isSkillOffer(offer())).toBe(true)
    expect(isSkillOffer(offer({ id: 'skill-offer-pb-bia-x-2' }))).toBe(true)
    expect(isSkillOffer(offer({ id: 'skill-7' }))).toBe(false)
    expect(isSkillOffer(offer({ kind: 'vault' }))).toBe(false)
  })

  it('reads "Virar skill" and "Agora não", with the host\'s question, and "Agora não" is a plain refusal', () => {
    const onDecideItem = listOf(offer())
    expect(screen.getByRole('button', { name: 'Virar skill' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Dispensar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Revisar skill' })).toBeNull()
    expect(document.body.textContent).toContain('Usado 3 vezes em 2 dias.')
    expect(document.body.textContent).not.toContain('Virar skill deixa') // one line of use, then the buttons (Atlas 12/11)
    fireEvent.click(screen.getByRole('button', { name: 'Agora não' }))
    expect(onDecideItem).toHaveBeenCalledOnce()
    expect(onDecideItem.mock.calls[0]?.[1]).toBe(false)
  })

  it('says WHICH way of working becomes a skill: "Bia aprendeu: …" is the title, the chip stays "Skill", "Nova skill proposta" is gone', () => {
    listOf(offer())
    expect(screen.getByRole('heading', { name: 'Bia aprendeu: Legenda do post de sexta' })).toBeTruthy()
    expect(screen.getByText('Skill')).toBeTruthy()
    expect(document.body.textContent).not.toContain('Nova skill proposta')
  })

  it('a long name is cut at two lines and the whole name is on hover (title attribute); the full text is always in the page', () => {
    const long = 'Bia aprendeu: Cartaz da promoção de pão de queijo com o preço grande, o fundo claro e a letra bem grande para ler de longe'
    listOf(offer({ title: long }))
    const heading = screen.getByRole('heading', { name: long })
    expect(heading.getAttribute('title')).toBe(long)
    expect(heading.className).toMatch(/Clamp/u)
  })

  it('both buttons are 40 px ("m"), not the 32 px of the other cards (Muse 12/11)', () => {
    const tokens = buttonTokens()
    expect(tokens.m).not.toBe('')
    listOf(offer())
    for (const name of ['Virar skill', 'Agora não']) {
      expect(classesOf(name)).toContain(tokens.m)
      expect(classesOf(name)).not.toContain(tokens.s)
    }
  })

  it('any other skill card keeps its own words (nothing else changes)', () => {
    listOf(offer({ id: 'skill-7', title: 'Nova skill' }))
    expect(screen.getByRole('button', { name: 'Revisar skill' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Dispensar' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Virar skill' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Nova skill proposta' })).toBeTruthy() // the generic card keeps its generic title
    expect(classesOf('Dispensar')).toContain(buttonTokens().s)
  })

  it('after "Virar skill" the stamp says "Virou skill" with "Ver em Skills" beside it, and the button opens THAT persona\'s Skills', () => {
    const onOpenSkills = vi.fn()
    listOf(offer(), vi.fn(), { exitStampId: 'skill-offer-pb-bia-x', onOpenSkills })
    expect(screen.getByText('Virou skill')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ver em Skills' }))
    expect(onOpenSkills).toHaveBeenCalledWith('bia')
  })

  it('no handler, no "Ver em Skills" (never a dead button); and the stamp of any other card never gets it', () => {
    listOf(offer(), vi.fn(), { exitStampId: 'skill-offer-pb-bia-x' })
    expect(screen.queryByRole('button', { name: 'Ver em Skills' })).toBeNull()
    cleanup()
    listOf(offer({ id: 'skill-7', title: 'Nova skill' }), vi.fn(), { exitStampId: 'skill-7', onOpenSkills: vi.fn() })
    expect(screen.queryByRole('button', { name: 'Ver em Skills' })).toBeNull()
    expect(screen.getByText('Aprovado')).toBeTruthy()
  })

  it('no article before the persona\'s name on the card', () => {
    listOf(offer())
    expect(document.body.textContent).not.toMatch(/\b(?:a|à|o|ao) Bia\b/u)
  })
})

describe('"Ver em Skills": the shell opens the profile on the Skills tab', () => {
  it('openPersonaSkills selects that persona and the tab; choosing another persona or another panel drops it', () => {
    const { store, actions } = createShellStore()
    actions.openPersonaSkills('bia')
    expect(store.getSnapshot()).toMatchObject({ activePanel: 'profile', profilePersonaId: 'bia', profileEditorOpen: false, profileInitialTab: 'skills' })
    actions.setProfilePersonaId('bento') // another persona from a card: the normal first tab
    expect(store.getSnapshot().profileInitialTab).toBeNull()
    actions.openPersonaSkills('bia')
    actions.selectPanel('approvals')
    expect(store.getSnapshot().profileInitialTab).toBeNull()
  })

  it('the profile page opens on Skills when asked, and on Visão geral otherwise', () => {
    const { unmount } = render(<PersonaProfilePage snapshot={MOCK_PROFILE_ATLAS} initialTab="skills" />)
    expect(screen.getByRole('tab', { name: 'Skills' }).getAttribute('aria-selected')).toBe('true')
    unmount()
    render(<PersonaProfilePage snapshot={MOCK_PROFILE_ATLAS} />)
    expect(screen.getByRole('tab', { name: 'Visão geral' }).getAttribute('aria-selected')).toBe('true')
  })
})

describe('PersonaProfilePage: the tab', () => {
  it('sits between Memória and Skills, and is only offered when the host has the playbook', () => {
    const { unmount } = render(<PersonaProfilePage snapshot={MOCK_PROFILE_ATLAS} playbookRows={[LEARNING]} />)
    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['Visão geral', 'Memória', 'Jeito de trabalhar', 'Skills'])
    fireEvent.click(screen.getByRole('tab', { name: 'Jeito de trabalhar' }))
    expect(screen.getByRole('heading', { name: 'Jeito de trabalhar' })).toBeTruthy()
    unmount()
    render(<PersonaProfilePage snapshot={MOCK_PROFILE_ATLAS} />)
    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['Visão geral', 'Memória', 'Skills'])
  })
})
