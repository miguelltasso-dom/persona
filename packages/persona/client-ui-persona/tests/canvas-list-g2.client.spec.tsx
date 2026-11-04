// @vitest-environment jsdom
// G2: o modo lista diz em palavras o que o mapa mostra em linhas, seleciona com o teclado e não rouba o foco das abas.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CanvasView } from '../src/client/canvas/CanvasView.tsx'
import { MOCK_CANVAS_EDGES, MOCK_CANVAS_NODES } from '../src/client/canvas/mock-data.ts'
import { pt } from '../src/client/locale/canvas/locales.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
afterEach(() => { cleanup() })

const tabList = (): HTMLElement => screen.getByRole('tab', { name: pt['mode.list'] })

describe('CanvasView list mode: same objects, in words (G2)', () => {
  it('says each relation in words, both directions, and "sem relações" for an isolated object', () => {
    render(<CanvasView nodes={[...MOCK_CANVAS_NODES, { id: 'n-solo', kind: 'topic', label: 'Ideia solta', x: 10, y: 10 }]} edges={MOCK_CANVAS_EDGES} />)
    fireEvent.click(tabList())
    const table = screen.getByRole('table', { name: pt['a11y.listRegion'] })
    expect(within(table).getByRole('columnheader', { name: pt['column.links'] })).toBeTruthy()
    // The name cell is exact: other rows mention a label too ("vem de Atlas").
    const row = (label: string): HTMLElement => {
      const found = within(table).getByRole('cell', { name: label }).closest('tr')
      if (found === null) throw new Error(`no row for ${label}`)
      return found
    }
    expect(row('Atlas').textContent).toContain('liga a Hero landing')
    expect(row('Hero landing').textContent).toContain('vem de Atlas')
    expect(row('Hero landing').textContent).toContain('liga a Stack Next')
    expect(row('Stack Next').textContent).toContain('vem de Hero landing')
    expect(row('Ideia solta').textContent).toContain(pt['link.none'])
  })

  it('Enter selects a row, announces it, and the same item is selected on the map', () => {
    render(<CanvasView nodes={MOCK_CANVAS_NODES} edges={MOCK_CANVAS_EDGES} />)
    fireEvent.click(tabList())
    const rows = screen.getAllByRole('row').slice(1)
    fireEvent.keyDown(rows[1]!, { key: 'Enter' })
    expect(rows[1]?.getAttribute('aria-current')).toBe('true')
    expect(rows[0]?.getAttribute('aria-current')).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('Tarefa: Hero landing')
    fireEvent.click(screen.getByRole('tab', { name: pt['mode.canvas'] }))
    expect(screen.getByRole('button', { name: 'Tarefa: Hero landing' }).getAttribute('aria-pressed')).toBe('true')
    // and back: the list still has it selected
    fireEvent.click(tabList())
    expect(screen.getAllByRole('row').slice(1)[1]?.getAttribute('aria-current')).toBe('true')
  })

  it('clicking a row selects it too', () => {
    render(<CanvasView nodes={MOCK_CANVAS_NODES} edges={MOCK_CANVAS_EDGES} />)
    fireEvent.click(tabList())
    fireEvent.click(screen.getAllByRole('row').slice(1)[2]!)
    expect(screen.getAllByRole('row').slice(1)[2]?.getAttribute('aria-current')).toBe('true')
  })

  it('switching to the list does not pull focus off the tab; arrows then move it inside the list', () => {
    render(<CanvasView nodes={MOCK_CANVAS_NODES} edges={MOCK_CANVAS_EDGES} />)
    const tab = tabList()
    tab.focus()
    fireEvent.click(tab)
    expect(document.activeElement).toBe(tab)
    const rows = screen.getAllByRole('row').slice(1)
    rows[0]!.focus()
    fireEvent.keyDown(rows[0]!, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(rows[1])
  })

  it('the list explains how to use it', () => {
    render(<CanvasView nodes={MOCK_CANVAS_NODES} edges={MOCK_CANVAS_EDGES} />)
    fireEvent.click(tabList())
    expect(screen.getByText(pt['a11y.listHint'])).toBeTruthy()
    expect(screen.getByRole('table').getAttribute('aria-describedby')).toBe('canvas-list-hint')
  })
})
