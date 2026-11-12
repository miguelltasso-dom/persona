// @vitest-environment jsdom
/**
 * Muse + Atlas (12/11): o chip do cartão diz o estado DO CARTÃO, nunca o da persona.
 *   A fazer: "Na fila de Bia" · Fazendo: "Bia está fazendo" (verde) · Revisão do cliente: "Esperando o cliente" · Revisão interna: "Bia está revisando" · Feito: "Feito por Bia"
 *   "Descansando", "Pausada" e os outros estados ficam só no rosto e no rail. Sem responsável: sem chip.
 * E o link "Comece aqui" de "Mais usadas" ganha alvo de 32 px (área invisível, sem mexer no visual).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { KanbanCard } from '../src/client/kanban/KanbanCard.tsx'
import { Details } from '../src/client/remote/ConnectedTaskConversation.tsx'
import { TeamworkProvider } from '../src/client/teamwork/teamwork-context.tsx'
import { cardStateChipOf } from '../src/client/kanban/card-state.ts'
import type { KanbanCardModel } from '../src/client/kanban/types.ts'
import { pt as kanbanPt } from '../src/client/locale/kanban/locales.ts'

afterEach(cleanup)

/** A file of this package, read from the repo root (vitest runs there; `import.meta.url` is not a file URL under jsdom). */
const PKG = 'packages/persona/client-ui-persona'
const read = (path: string): string => readFileSync(resolve(process.cwd(), PKG, path), 'utf8')
const BIA = { id: 'bia', name: 'Bia', initials: 'B' }
const BASE: KanbanCardModel = {
  id: 'c1', title: 'Cartaz da promoção', projectId: 'p1', projectName: 'Padaria Lua', teamId: 't1', teamName: 'Marketing',
  column: 'todo', assignee: BIA, assigneeState: 'resting', waitingEvent: false, blocked: false, reviewApproved: false,
}

function draw(model: KanbanCardModel): void {
  render(
    <KanbanCard
      dict={kanbanPt}
      card={model}
      draggingId={null}
      showProject={false}
      columnLabels={{ todo: 'A fazer', in_progress: 'Fazendo', in_review: 'Em revisão', blocked: 'Bloqueado', done: 'Feito' } as never}
      onDragStart={() => undefined}
      onDragEnd={() => undefined}
    />,
  )
}

describe('o chip do cartão diz o estado do cartão', () => {
  it.each([
    ['todo', 'Na fila de Bia'],
    ['in_progress', 'Bia está fazendo'],
    ['in_review', 'Esperando o cliente'],
    ['done', 'Feito por Bia'],
  ] as const)('coluna %s: "%s"', (column, text) => {
    draw({ ...BASE, column })
    expect(screen.getByText(text)).toBeTruthy()
  })

  it('revisão interna com o revisor resolvido pelo contexto de equipe: "Lia está revisando" (o nome do REVISOR); sem colega revisando é a revisão de fora', () => {
    const team = { personaFor: (id: string) => (id === 'lia' ? { id: 'lia', name: 'Lia' } : undefined) } as never
    render(
      <TeamworkProvider value={team}>
        <KanbanCard dict={kanbanPt} card={{ ...BASE, column: 'in_review', reviewing: { personaId: 'lia', round: 1 } }} draggingId={null} showProject={false} columnLabels={{ todo: 'A fazer', in_progress: 'Fazendo', in_review: 'Em revisão', blocked: 'Bloqueado', done: 'Feito' } as never} onDragStart={() => undefined} onDragEnd={() => undefined} />
      </TeamworkProvider>,
    )
    expect(screen.getByText('Lia está revisando')).toBeTruthy()
    expect(screen.queryByText('Esperando o cliente')).toBeNull()
  })

  it('Ember + Atlas + Muse (12/11): sem o revisor conhecido o chip diz "Em revisão", SEM nome: nunca que o autor revisa o próprio cartão', () => {
    // no team context at all (the gallery, a host that does not send the colleague): the old fallback was the responsible persona
    draw({ ...BASE, assignee: { id: 'nina', name: 'Nina', initials: 'N' }, column: 'in_review', reviewing: { personaId: 'bia', round: 1 } })
    expect(screen.getByText('Em revisão', { selector: '[data-card-state]' })).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/Nina está revisando/u)
    expect(document.body.textContent).not.toMatch(/está revisando/u)
    cleanup()
    // the team context knows the persona but it is the card's OWN responsible persona: still no name
    const team = { personaFor: (id: string) => ({ id, name: id === 'nina' ? 'Nina' : 'Bia' }) } as never
    render(
      <TeamworkProvider value={team}>
        <KanbanCard dict={kanbanPt} card={{ ...BASE, assignee: { id: 'nina', name: 'Nina', initials: 'N' }, column: 'in_review', reviewing: { personaId: 'nina', round: 1 } }} draggingId={null} showProject={false} columnLabels={{ todo: 'A fazer', in_progress: 'Fazendo', in_review: 'Em revisão', blocked: 'Bloqueado', done: 'Feito' } as never} onDragStart={() => undefined} onDragEnd={() => undefined} />
      </TeamworkProvider>,
    )
    expect(document.body.textContent).not.toMatch(/Nina está revisando/u)
    expect(document.querySelector('[data-card-state="card.state.reviewingTeam"]')?.textContent).toBe('Em revisão')
  })

  it('a função pura: nunca o nome do autor, em nenhum caminho', () => {
    const author = { id: 'nina', name: 'Nina', initials: 'N' }
    for (const reviewerName of [undefined, '', '   ', 'Nina', 'nina']) {
      const chip = cardStateChipOf({ column: 'in_review', assignee: author, reviewing: { personaId: 'x', round: 1 } }, reviewerName)
      expect(chip, String(reviewerName)).toEqual({ key: 'card.state.reviewingTeam', tone: 'info', who: 'none' })
    }
    expect(cardStateChipOf({ column: 'in_review', assignee: author, reviewing: { personaId: 'nina', round: 1 } }, 'Lia')?.key).toBe('card.state.reviewingTeam')
    expect(cardStateChipOf({ column: 'in_review', assignee: author, reviewing: { personaId: 'lia', round: 1 } }, 'Lia')).toEqual({ key: 'card.state.reviewing', tone: 'info', who: 'reviewer' })
  })

  it('o chip de estado quebra em 2 linhas numa coluna estreita e nunca termina em reticências (Muse, 12/11)', () => {
    const css = read('src/client/kanban/Kanban.module.css')
    const rule = /\.stateChip\s*\{([^}]*)\}/u.exec(css)?.[1] ?? ''
    expect(rule).toMatch(/white-space:\s*normal/u)
    expect(rule).toMatch(/text-overflow:\s*clip/u)
    expect(rule).not.toMatch(/text-overflow:\s*ellipsis/u)
    draw({ ...BASE, column: 'in_progress', assignee: { id: 'n', name: 'Nina Cristina de Albuquerque', initials: 'NC' } })
    expect(document.querySelector('[data-card-state]')?.className).toContain('stateChip')
  })

  it('"Descansando", "Pausada", "Trabalhando" e "Precisa de ajuda" nunca aparecem no cartão, qualquer que seja o estado da persona; "Esperando você" só no Bloqueado que espera o dono', () => {
    for (const assigneeState of ['resting', 'working', 'waiting', 'stuck'] as const) {
      for (const column of ['todo', 'in_progress', 'in_review', 'blocked', 'done'] as const) {
        const { unmount } = render(
          <KanbanCard dict={kanbanPt} card={{ ...BASE, column, assigneeState }} draggingId={null} showProject={false} columnLabels={{ todo: 'A fazer', in_progress: 'Fazendo', in_review: 'Em revisão', blocked: 'Bloqueado', done: 'Feito' } as never} onDragStart={() => undefined} onDragEnd={() => undefined} />,
        )
        expect(document.body.textContent, `${column}/${assigneeState}`).not.toMatch(/Descansando|Pausada|Trabalhando|Precisa de ajuda/u)
        if (!(column === 'blocked' && assigneeState === 'waiting')) expect(document.body.textContent, `${column}/${assigneeState}`).not.toMatch(/Esperando você/u)
        unmount()
      }
    }
  })

  it('sem responsável: nenhum chip de estado (só o Bloqueado tem o seu, com ou sem responsável)', () => {
    const { assignee: _assignee, assigneeState: _state, ...unassigned } = BASE
    void [_assignee, _state]
    for (const column of ['todo', 'in_progress', 'in_review', 'done'] as const) {
      expect(cardStateChipOf({ column })).toBeUndefined()
    }
    expect(cardStateChipOf({ column: 'blocked' })).toMatchObject({ key: 'card.state.stopped' })
    draw({ ...unassigned, column: 'in_progress' })
    expect(document.querySelector('[data-card-state]')).toBeNull()
  })

  describe('Bloqueado: o cartão diz o porquê (Muse, 12/11)', () => {
    it.each([
      ['uma pergunta aberta', { question: 'Qual cor do cartaz?' }],
      ['uma entrega para aplicar ou descartar', { deliveryPending: true }],
      ['a persona esperando o dono', { assigneeState: 'waiting' as const }],
    ])('espera o dono (%s): o chip ÂMBAR "Esperando você", único caso em que o âmbar entra no cartão', (_why, extra) => {
      const chip = cardStateChipOf({ column: 'blocked', assignee: BIA, ...extra })
      expect(chip).toEqual({ key: 'card.state.waitingYou', tone: 'accent', who: 'none' })
      draw({ ...BASE, column: 'blocked', assigneeState: 'stuck', ...extra })
      const drawn = screen.getByText('Esperando você')
      expect(drawn.className).toContain('accent')
      expect(screen.queryByText('Parado')).toBeNull()
    })

    it('parado por outro motivo: o chip neutro "Parado" e, se o host mandou, 1 linha com o motivo embaixo do título', () => {
      draw({ ...BASE, column: 'blocked', assigneeState: 'stuck', blockedReason: 'Falta o login do Mercado Pago' })
      const chip = screen.getByText('Parado')
      expect(chip.className).toContain('neutral')
      expect(screen.queryByText('Esperando você')).toBeNull()
      const reason = document.querySelector('[data-card-reason]')
      expect(reason?.textContent).toBe('Falta o login do Mercado Pago')
      expect(reason?.tagName).toBe('P')
    })

    it('sem motivo: só "Parado" (nenhuma linha vazia, nenhum motivo inventado); um motivo em branco conta como sem motivo', () => {
      draw({ ...BASE, column: 'blocked', assigneeState: 'stuck' })
      expect(screen.getByText('Parado')).toBeTruthy()
      expect(document.querySelector('[data-card-reason]')).toBeNull()
      cleanup()
      draw({ ...BASE, column: 'blocked', assigneeState: 'stuck', blockedReason: '   ' })
      expect(document.querySelector('[data-card-reason]')).toBeNull()
    })

    it('o motivo só aparece no Bloqueado; a linha é de 13 px, apagada, em até 2 linhas (nunca 1 linha com reticências)', () => {
      draw({ ...BASE, column: 'in_progress', blockedReason: 'Falta o login do Mercado Pago' })
      expect(document.querySelector('[data-card-reason]')).toBeNull()
      const css = read('src/client/kanban/Kanban.module.css')
      const rule = /\.cardReason\s*\{([^}]*)\}/u.exec(css)?.[1] ?? ''
      expect(rule).toMatch(/font-size:\s*0\.8125rem/u)
      expect(rule).toMatch(/color:\s*var\(--persona-ink-soft\)/u)
      expect(rule).toMatch(/-webkit-line-clamp:\s*2/u)
      expect(rule).not.toMatch(/white-space:\s*nowrap/u)
    })

    it('Muse 12/11: o texto inteiro do motivo está no title da linha e no aria-label do cartão (o corte visual nunca esconde a informação)', () => {
      const reason = 'Falta o acesso ao Instagram da padaria; peça a senha ao dono e avise quando chegar para continuar'
      draw({ ...BASE, column: 'blocked', assigneeState: 'stuck', blockedReason: reason })
      expect(document.querySelector('[data-card-reason]')?.getAttribute('title')).toBe(reason)
      expect(screen.getByRole('article').getAttribute('aria-label')).toBe(`Cartaz da promoção. ${reason}`)
      cleanup()
      draw({ ...BASE, column: 'blocked', assigneeState: 'stuck' })
      expect(screen.getByRole('article').getAttribute('aria-label')).toBe('Cartaz da promoção') // no reason: the label is the title, as before
    })

    it('Muse + Atlas 12/11: no cartão ABERTO (a aba Detalhes) o motivo vai inteiro, sem corte', () => {
      const reason = 'Falta o acesso ao Instagram da padaria; peça a senha ao dono e avise quando chegar para continuar'
      render(<Details dict={kanbanPt} card={{ ...BASE, column: 'blocked', blockedReason: reason }} columnLabel="Bloqueado" />)
      const shown = document.querySelector('[data-card-reason-full]')
      expect(shown?.textContent).toBe(reason)
      expect(shown?.previousElementSibling?.textContent).toBe('Por que parou')
      cleanup()
      render(<Details dict={kanbanPt} card={{ ...BASE, column: 'blocked' }} columnLabel="Bloqueado" />)
      expect(document.querySelector('[data-card-reason-full]')).toBeNull() // no reason: no empty row
      cleanup()
      render(<Details dict={kanbanPt} card={{ ...BASE, column: 'in_progress', blockedReason: reason }} columnLabel="Fazendo" />)
      expect(document.querySelector('[data-card-reason-full]')).toBeNull() // only a stopped card says why
    })

    it('"Esperando você" e "Parado" existem nos dois idiomas', () => {
      const en = JSON.parse(read('locale-sources/kanban.en.json')) as Record<string, string>
      for (const key of ['card.state.waitingYou', 'card.state.stopped']) {
        expect(en[key], key).toBeTruthy()
        expect((kanbanPt as Readonly<Record<string, string>>)[key], key).toBeTruthy()
      }
    })
  })

  it('Muse 12/11: o chip SEGUE A ETAPA: numa coluna de revisão interna o cartão nunca diz "Esperando o cliente" (diz "Em revisão"); só a coluna do cliente diz', () => {
    const inColumn = (columnName: string | undefined): ReturnType<typeof cardStateChipOf> => cardStateChipOf({ column: 'in_review', assignee: BIA }, undefined, columnName)
    expect(inColumn('Revisão interna')).toEqual({ key: 'card.state.reviewingTeam', tone: 'info', who: 'none' })
    expect(inColumn('Revisão da Lia')).toMatchObject({ key: 'card.state.reviewingTeam' })
    expect(inColumn('Revisão do cliente')).toMatchObject({ key: 'card.state.client' })
    expect(inColumn('Client review')).toMatchObject({ key: 'card.state.client' })
    expect(inColumn(undefined)).toMatchObject({ key: 'card.state.client' }) // a board that does not know its columns' names keeps the old reading
    // through the card: the flow column the card sits in decides
    const targets = [{ id: 'col-int', label: 'Revisão interna' }, { id: 'col-cli', label: 'Revisão do cliente' }]
    const drawIn = (currentFlowColumnId: string): void => {
      render(<KanbanCard dict={kanbanPt} card={{ ...BASE, column: 'in_review' }} draggingId={null} showProject={false} columnLabels={{ todo: 'A fazer', in_progress: 'Fazendo', in_review: 'Em revisão', blocked: 'Bloqueado', done: 'Feito' } as never} flowMoveTargets={targets} currentFlowColumnId={currentFlowColumnId} onDragStart={() => undefined} onDragEnd={() => undefined} />)
    }
    drawIn('col-int')
    expect(screen.getByText('Em revisão', { selector: '[data-card-state]' })).toBeTruthy()
    expect(screen.queryByText('Esperando o cliente')).toBeNull()
    cleanup()
    drawIn('col-cli')
    expect(screen.getByText('Esperando o cliente')).toBeTruthy()
  })

  it('"Fazendo" é verde, a fila e a espera do cliente são neutras, a revisão interna informa', () => {
    expect(cardStateChipOf({ column: 'in_progress', assignee: BIA })?.tone).toBe('success')
    expect(cardStateChipOf({ column: 'todo', assignee: BIA })?.tone).toBe('neutral')
    expect(cardStateChipOf({ column: 'in_review', assignee: BIA })?.tone).toBe('neutral')
    expect(cardStateChipOf({ column: 'in_review', assignee: BIA, reviewing: { personaId: 'x', round: 1 } })?.tone).toBe('info')
  })

  it('o inglês diz o mesmo (as chaves existem nos dois idiomas)', () => {
    const en = JSON.parse(read('locale-sources/kanban.en.json')) as Record<string, string>
    for (const key of ['card.state.todo', 'card.state.doing', 'card.state.reviewing', 'card.state.client']) {
      expect(en[key], key).toBeTruthy()
      expect((kanbanPt as Readonly<Record<string, string>>)[key], key).toBeTruthy()
    }
  })
})

describe('"Comece aqui" em "Mais usadas": alvo de 32 px sem mudar o visual', () => {
  it('o link tem uma área de toque invisível de 4 px acima e abaixo (24 + 8 = 32), sem padding novo', () => {
    const css = read('src/client/second-brain/SecondBrain.module.css')
    const rule = /\.brainPageLink::after\s*\{([^}]*)\}/u.exec(css)?.[1] ?? ''
    expect(rule).toMatch(/content:\s*''/u)
    expect(rule).toMatch(/position:\s*absolute/u)
    expect(rule).toMatch(/inset:\s*-4px\s+-2px/u)
    expect(/\.brainPageLink\s*\{[^}]*position:\s*relative/u.test(css)).toBe(true)
    expect(/\.brainPageLink\s*\{[^}]*min-height:\s*24px/u.test(css)).toBe(true) // the link itself did not grow
  })
})
