// @vitest-environment jsdom
// COLHEITA §23 (Ember 08:35; Atlas, Keel e Muse 08:37): o fio virtualizado de 100 mensagens reprovava em duas regras reais do axe.
// As linhas são listitem sem lista-pai (raiz sem role="list") e a raiz rolável não recebe foco pelo teclado. Vermelho primeiro.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FixedRowVirtualScroller } from '../src/client/primitives/FixedRowVirtualScroller.tsx'

afterEach(cleanup)

describe('§23 · fio virtualizado de 100 mensagens: lista e foco', () => {
  it('com listRole, a raiz é role="list" e as linhas listitem ficam dentro dela', () => {
    const { container } = render(
      <FixedRowVirtualScroller
        rowCount={100}
        rowHeight={80}
        ariaLabel="Mensagens"
        listRole
        getRowKey={index => `row-${String(index)}`}
        renderRow={index => <div role="listitem">{`mensagem ${String(index)}`}</div>}
      />,
    )
    const root = screen.getByRole('list', { name: 'Mensagens' })
    const items = container.querySelectorAll('[role="listitem"]')
    expect(items.length).toBeGreaterThan(0)
    expect(root.contains(items[0] as Node)).toBe(true)
  })

  it('a raiz rolável recebe foco pelo teclado (tabIndex 0)', () => {
    render(
      <FixedRowVirtualScroller
        rowCount={100}
        rowHeight={80}
        ariaLabel="Mensagens"
        listRole
        getRowKey={index => `row-${String(index)}`}
        renderRow={index => <div role="listitem">{String(index)}</div>}
      />,
    )
    const root = screen.getByRole('list', { name: 'Mensagens' })
    expect(root.getAttribute('tabindex')).toBe('0')
    root.focus()
    expect(document.activeElement).toBe(root)
  })

  it('sem listRole, a raiz não vira lista (outras telas não ganham role por engano) e continua focável', () => {
    const { container } = render(
      <FixedRowVirtualScroller
        rowCount={3}
        rowHeight={40}
        ariaLabel="Quadro"
        getRowKey={index => `row-${String(index)}`}
        renderRow={index => <div>{String(index)}</div>}
      />,
    )
    const root = container.querySelector('[aria-label="Quadro"]') as HTMLElement
    expect(root.getAttribute('role')).toBeNull()
    expect(root.getAttribute('tabindex')).toBe('0')
  })
})
