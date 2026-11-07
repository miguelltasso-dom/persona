// @vitest-environment jsdom
// Muse 07/11 (bundle 6, D-069): uma persona NUNCA é uma letra. O cartão do quadro mostrava "N" para a Nina (o Avatar do rodapé não recebia `src`)
// e o Téo, sem animal conhecido, virava "T". Agora o rodapé, a animação de carregar e a nota "começou agora" usam `resolvePersonaFace`
// (a mesma ordem da Caixa de Aprovações: animal conhecido → bicho estável do id), e os "trabalhando agora" do hub de Quadros levam o rosto.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { personaPortraitSrc } from '../src/client/approvals/approvals-ui-helpers.ts'
import { deriveBoardSummaries } from '../src/client/boards/derive-board-summaries.ts'
import { personaFaceSrc } from '../src/client/hire/persona-face.ts'
import { KanbanCard } from '../src/client/kanban/KanbanCard.tsx'
import { StartedNowNote, StartedNowProvider } from '../src/client/kanban/StartedNowNote.tsx'
import type { KanbanCardModel } from '../src/client/kanban/types.ts'
import { pt as kanbanPt } from '../src/client/locale/kanban/locales.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import type { PersonaNowSnapshot } from '../src/client/team/persona-work-state.ts'

installPreviewTheme()
afterEach(() => { cleanup() })

const CARD: KanbanCardModel = {
  id: 'c1',
  title: 'Folheto de novembro',
  projectId: 'p1',
  projectName: 'Padaria',
  teamId: 't1',
  teamName: 'Equipe',
  column: 'in_progress',
  waitingEvent: false,
  blocked: false,
  reviewApproved: false,
}

const COLUMN_LABELS = { todo: 'A fazer', in_progress: 'Fazendo', in_review: 'Em revisão', blocked: 'Bloqueado', done: 'Concluído' } as const

function mount(card: KanbanCardModel): ReturnType<typeof render> {
  return render(
    <PreviewFrame brandLabel="Persona">
      <KanbanCard
        dict={kanbanPt}
        card={card}
        draggingId={null}
        showProject={false}
        columnLabels={COLUMN_LABELS}
        onDragStart={() => {}}
        onDragEnd={() => {}}
      />
    </PreviewFrame>,
  )
}

/** The footer avatar: the portrait image, or (the bug) the letter. */
function footerFace(container: HTMLElement): { readonly src: string | null; readonly letters: string } {
  const footer = container.querySelector('[class*="cardFooter"]')
  expect(footer).not.toBeNull()
  const img = footer?.querySelector('img') ?? null
  return { src: img?.getAttribute('src') ?? null, letters: (footer?.textContent ?? '') }
}

describe('the board card footer draws the persona\'s animal, never the initial', () => {
  it('Nina (a gallery animal): her portrait, not an "N"', () => {
    const { container } = mount({ ...CARD, assignee: { id: 'nina', name: 'Nina', initials: 'N' } })
    const face = footerFace(container)
    expect(face.src).toBe(personaPortraitSrc(undefined, 'Nina'))
    expect(face.src).not.toBeNull()
    expect(face.letters).not.toMatch(/^N(?!ina)/u)
  })

  it('Téo (no gallery animal): the stable animal of his id, not a "T"', () => {
    const { container } = mount({ ...CARD, assignee: { id: 'persona-teo', name: 'Téo', initials: 'T' } })
    const face = footerFace(container)
    expect(face.src).toBe(personaFaceSrc(undefined, 'persona-teo'))
    expect(face.src).not.toBeNull()
  })

  it('a card with nobody on it (the host sends no responsible persona yet) wears the team icon: no invented animal and never the initials "SR"', () => {
    const { container } = mount(CARD)
    const face = footerFace(container)
    expect(face.src).toBeNull()
    expect(face.letters).not.toMatch(/SR/u)
    expect(container.querySelector('[class*="cardFooter"] [data-icon]')).not.toBeNull()
    // it still says who it is for the screen reader
    expect(container.querySelector('[class*="cardFooter"] [role="img"]')?.getAttribute('aria-label')).toBe('Sem responsável')
  })

  it('the nobody-on-it disc is NEUTRAL (paper-sunken, ink-soft, 1 px soft line: never the accent or the lilac wash) and outranks the Avatar\'s own icon wash (Muse 07/11)', () => {
    const css = readFileSync(join(__dirname, '..', 'src', 'client', 'kanban', 'Kanban.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '')
    const rule = /\.cardFooter \.unassignedAvatar\[data-icon\]\s*\{([^}]*)\}/u.exec(css)?.[1] ?? ''
    expect(rule).toMatch(/background:\s*var\(--persona-paper-sunken\)/u)
    expect(rule).toMatch(/color:\s*var\(--persona-ink-soft\)/u)
    expect(rule).toMatch(/border:\s*1px solid var\(--persona-outline-soft\)/u)
    expect(rule).not.toMatch(/accent|lilac|wash|brand/u)
    const { container } = mount(CARD)
    expect(container.querySelector('[class*="cardFooter"] [data-icon]')?.className ?? '').toMatch(/unassignedAvatar/u)
  })

  it('the card whose ⋯ menu is open (or has focus) rises over the next card: each card is a stacking context (will-change), so the menu was painted BEHIND the card below it', () => {
    const css = readFileSync(join(__dirname, '..', 'src', 'client', 'kanban', 'Kanban.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '')
    expect(/\.ticket\s*\{[^}]*will-change:/u.test(css)).toBe(true)
    const rise = /\.ticket:has\(\.cardMenu\),\s*\.ticket:focus-within\s*\{([^}]*)\}/u.exec(css)?.[1] ?? ''
    expect(rise).toMatch(/z-index:\s*4/u)
    expect(/\.cardMenu\s*\{[^}]*z-index:\s*5/u.test(css)).toBe(true)
    // the dragging card (2) is not covered by a menu-less neighbour and a menu card (4) still sits under the menu itself (5)
    expect(/\.ticketDragging\s*\{[^}]*z-index:\s*2/u.test(css)).toBe(true)
  })

  it('an approved card: title leaves room for the sticker, the stamp word is not drawn (it crossed the chip) and "Aprovado" is its own footer chip', () => {
    const css = readFileSync(join(__dirname, '..', 'src', 'client', 'kanban', 'Kanban.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '')
    expect(/\.cardTitleRowStamped\s*\{[^}]*padding-right:\s*44px/u.test(css)).toBe(true)
    expect(/\.approvalStamp \[aria-hidden='true'\]:last-child\s*\{[^}]*display:\s*none/u.test(css)).toBe(true)
    const { container } = mount({ ...CARD, column: 'done', reviewApproved: true })
    expect(container.querySelector('[class*="cardTitleRowStamped"]')).not.toBeNull()
    expect(container.querySelector('[class*="cardFooter"] [data-card-approved]')?.textContent).toBe('Aprovado')
    const plain = mount(CARD)
    expect(plain.container.querySelector('[class*="cardTitleRowStamped"]')).toBeNull()
  })

  it('a card WITH a responsible persona has no team icon (the icon is only the nobody-on-it state)', () => {
    const { container } = mount({ ...CARD, assignee: { id: 'nina', name: 'Nina', initials: 'N' } })
    expect(container.querySelector('[class*="cardFooter"] [data-icon]')).toBeNull()
  })

  it('the animation that carries a persona between columns wears the face too', () => {
    const { container } = mount({
      ...CARD,
      assignee: { id: 'persona-teo', name: 'Téo', initials: 'T' },
      carry: { persona: { id: 'persona-teo', name: 'Téo', initials: 'T' }, fromColumn: 'todo', toColumn: 'in_progress' },
    })
    const carry = container.querySelector('[class*="carryAvatar"] img')
    expect(carry?.getAttribute('src')).toBe(personaFaceSrc(undefined, 'persona-teo'))
  })
})

describe('"{nome} começou agora" and the hub tile show the face', () => {
  it('the note draws the animal of an unknown name by its id (HT-3)', () => {
    render(
      <StartedNowProvider value={{ startedFor: () => ({ cardId: 'c1', personaId: 'persona-teo', personaName: 'Téo' }) }}>
        <StartedNowNote cardId="c1" label={name => `${name} começou agora`} />
      </StartedNowProvider>,
    )
    const note = screen.getByRole('status')
    expect(note.querySelector('img')?.getAttribute('src')).toBe(personaFaceSrc(undefined, 'persona-teo'))
  })

  it('the "trabalhando agora" of a project tile carries each persona\'s face (a letter would be the fallback)', () => {
    const rows: PersonaNowSnapshot[] = [
      { member: { id: 'nina', name: 'Nina', role: 'Pesquisa', state: 'working' }, queueCount: 0 },
      // in the live data the member id IS the gallery animal ("stripMember"); the name ("Téo") says nothing about it
      { member: { id: 'bento', name: 'Téo', role: 'Vendas', state: 'working' }, queueCount: 0 },
      { member: { id: 'sol', name: 'Sol', role: 'Atendimento', state: 'resting' }, queueCount: 0 },
    ]
    const [tile] = deriveBoardSummaries({ projects: [{ id: 'p1', name: 'Padaria' }], kanbanCards: [], nowRows: rows })
    expect(tile?.activeWorkers.map(worker => worker.name)).toEqual(['Nina', 'Téo'])
    expect(tile?.activeWorkers[0]?.avatarSrc).toBe(personaPortraitSrc(undefined, 'Nina'))
    expect(tile?.activeWorkers[1]?.avatarSrc).toBe(personaPortraitSrc('bento', 'Téo'))
    expect(tile?.activeWorkers[1]?.avatarSrc).toBeDefined()
  })
})
