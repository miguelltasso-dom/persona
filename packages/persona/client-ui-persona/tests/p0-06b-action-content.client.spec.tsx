// @vitest-environment jsdom
// Carbon P0-06b (colheita-s1-fix): o cartão de "apagar" com 15 itens mostrava 6 e "e mais 9" SEM como ver os outros 9: a pessoa aprovava o que não via. Agora o "e mais N" é um botão que mostra
// TODOS os itens que o host mandou ("Ver menos" volta); o que o host não mandou (cortado acima do limite dele) já deixa o cartão sem "Enviar" (prévia cortada).
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ActionContent } from '../src/client/chat/ActionContent.tsx'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'

afterEach(() => { cleanup() })

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(chatPt, key, params)) as never
const names = (count: number): string[] => Array.from({ length: count }, (_, index) => `arquivo-${String(index + 1)}.pdf`)

function mount(items: readonly string[], count = items.length) {
  return render(<ActionContent t={t} verb="delete" content={{ items, count }} />)
}

describe('"e mais N" do cartão de apagar', () => {
  it('15 itens: 6 à vista e "e mais 9" é um BOTÃO que mostra os outros 9', () => {
    mount(names(15))
    expect(screen.getAllByRole('listitem').filter(row => /arquivo-/u.test(row.textContent ?? ''))).toHaveLength(6)
    const more = screen.getByRole('button', { name: /e mais 9/u })
    expect(more.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(more)
    for (const name of names(15)) expect(screen.getByText(name)).toBeTruthy() // os 15, incluindo o 7º ao 15º
    expect(screen.getByRole('button', { name: 'Ver menos' }).getAttribute('aria-expanded')).toBe('true')
  })

  it('"Ver menos" volta a 6 itens e ao "e mais 9"', () => {
    mount(names(15))
    fireEvent.click(screen.getByRole('button', { name: /e mais 9/u }))
    fireEvent.click(screen.getByRole('button', { name: 'Ver menos' }))
    expect(screen.queryByText('arquivo-15.pdf')).toBeNull()
    expect(screen.getByRole('button', { name: /e mais 9/u })).toBeTruthy()
  })

  it('até 6 itens não há o que expandir (nenhum botão)', () => {
    mount(names(6))
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('o host cortou a lista (diz 30, mandou 20): mostra os 20 e o resto segue como texto "e mais 10" (a prévia cortada já não deixa enviar)', () => {
    mount(names(20), 30)
    fireEvent.click(screen.getByRole('button', { name: /e mais 14/u }))
    expect(screen.getByText('arquivo-20.pdf')).toBeTruthy()
    expect(screen.getByText('e mais 10')).toBeTruthy()
  })
})
