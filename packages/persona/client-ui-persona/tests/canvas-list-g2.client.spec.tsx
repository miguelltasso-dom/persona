// @vitest-environment jsdom
// G2: o modo lista diz em palavras o que o mapa mostra em linhas, seleciona com o teclado e não rouba o foco das abas.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CanvasView } from '../src/client/canvas/CanvasView.tsx'
import { MOCK_CANVAS_EDGES, MOCK_CANVAS_NODES } from '../src/client/canvas/mock-data.ts'
import { pt } from '../src/client/locale/canvas/locales.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
beforeEach(() => { window.localStorage.clear() })
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
      // The name cell comes first; "Quem" can repeat a name later in other rows.
      const found = within(table).getAllByRole('cell', { name: label })[0]?.closest('tr')
      if (found === null || found === undefined) throw new Error(`no row for ${label}`)
      return found
    }
    expect(row('Atlas').textContent).toContain('leva a Hero landing')
    expect(row('Hero landing').textContent).toContain('vem de Atlas')
    expect(row('Hero landing').textContent).toContain('leva a Stack Next')
    expect(row('Stack Next').textContent).toContain('vem de Hero landing')
    expect(row('Ideia solta').textContent).toContain(pt['link.none'])
  })

  it('Space selects a row, announces it, and the same item is selected on the map', () => {
    render(<CanvasView nodes={MOCK_CANVAS_NODES} edges={MOCK_CANVAS_EDGES} />)
    fireEvent.click(tabList())
    const rows = screen.getAllByRole('row').slice(1)
    fireEvent.keyDown(rows[1]!, { key: ' ' })
    expect(rows[1]?.getAttribute('aria-current')).toBe('true')
    expect(rows[0]?.getAttribute('aria-current')).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('Tarefa: Hero landing')
    fireEvent.click(screen.getByRole('tab', { name: pt['mode.canvas'] }))
    expect(screen.getByRole('button', { name: 'Tarefa: Hero landing' }).getAttribute('aria-pressed')).toBe('true')
    // and back: the list still has it selected
    fireEvent.click(tabList())
    expect(screen.getAllByRole('row').slice(1)[1]?.getAttribute('aria-current')).toBe('true')
  })

  it('Enter OPENS the object (and keeps it selected); with no handler it still just selects', () => {
    const onOpen = vi.fn()
    const { rerender } = render(<CanvasView nodes={MOCK_CANVAS_NODES} edges={MOCK_CANVAS_EDGES} onOpenNode={onOpen} />)
    fireEvent.click(tabList())
    fireEvent.keyDown(screen.getAllByRole('row').slice(1)[1]!, { key: 'Enter' })
    expect(onOpen).toHaveBeenCalledWith(MOCK_CANVAS_NODES[1])
    expect(screen.getAllByRole('row').slice(1)[1]?.getAttribute('aria-current')).toBe('true')
    rerender(<CanvasView nodes={MOCK_CANVAS_NODES} edges={MOCK_CANVAS_EDGES} />)
    fireEvent.keyDown(screen.getAllByRole('row').slice(1)[0]!, { key: 'Enter' })
    expect(onOpen).toHaveBeenCalledTimes(1)
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

describe('CanvasView: mode, columns, states (QUILL-SCREENS-SPEC)', () => {
  it('remembers the chosen mode, and still works when storage is blocked', () => {
    const { unmount } = render(<CanvasView nodes={MOCK_CANVAS_NODES} edges={MOCK_CANVAS_EDGES} />)
    expect(screen.getByRole('region', { name: pt['a11y.graphRegion'] })).toBeTruthy()
    fireEvent.click(tabList())
    unmount()
    render(<CanvasView nodes={MOCK_CANVAS_NODES} edges={MOCK_CANVAS_EDGES} />)
    expect(screen.getByRole('table')).toBeTruthy()
    cleanup()
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    render(<CanvasView nodes={MOCK_CANVAS_NODES} edges={MOCK_CANVAS_EDGES} />)
    expect(screen.getByRole('region', { name: pt['a11y.graphRegion'] })).toBeTruthy()
    spy.mockRestore()
  })

  it('narrow windows (< 720 px) start in the list when nothing was chosen before', () => {
    const list = (query: string): MediaQueryList => ({
      matches: query.includes('719px'),
      media: query,
      onchange: null,
      // MediaQueryList still requires the legacy pair; the view only uses matches.
      // oxlint-disable-next-line typescript/no-deprecated
      addListener: () => {},
      // oxlint-disable-next-line typescript/no-deprecated
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })
    Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: list })
    try {
      render(<CanvasView nodes={MOCK_CANVAS_NODES} edges={MOCK_CANVAS_EDGES} />)
      expect(screen.getByRole('table')).toBeTruthy()
    } finally {
      Reflect.deleteProperty(window, 'matchMedia')
    }
  })

  it('zoom controls exist only in the map', () => {
    render(<CanvasView nodes={MOCK_CANVAS_NODES} edges={MOCK_CANVAS_EDGES} />)
    expect(screen.getByRole('button', { name: pt['action.zoomIn'] })).toBeTruthy()
    expect(screen.getByRole('button', { name: pt['action.resetView'] })).toBeTruthy()
    fireEvent.click(tabList())
    expect(screen.queryByRole('button', { name: pt['action.zoomIn'] })).toBeNull()
  })

  it('"Quem" is the linked persona; dashes where there is none; no column at all when nobody has anyone', () => {
    const { unmount } = render(<CanvasView nodes={[...MOCK_CANVAS_NODES, { id: 'n-solo', kind: 'topic', label: 'Ideia solta', x: 10, y: 10 }]} edges={MOCK_CANVAS_EDGES} />)
    fireEvent.click(tabList())
    const table = screen.getByRole('table')
    expect(within(table).getByRole('columnheader', { name: pt['column.who'] })).toBeTruthy()
    const rowOf = (label: string): HTMLElement => {
      const found = within(table).getByRole('cell', { name: label }).closest('tr')
      if (found === null) throw new Error('no row')
      return found
    }
    expect(rowOf('Hero landing').textContent).toContain('Atlas')
    expect(within(rowOf('Ideia solta')).getByLabelText(pt['who.none'])).toBeTruthy()
    unmount()
    render(<CanvasView nodes={[{ id: 'a', kind: 'topic', label: 'Assunto A', x: 0, y: 0 }, { id: 'b', kind: 'decision', label: 'Decisão B', x: 200, y: 0 }]} edges={[{ id: 'e', from: 'a', to: 'b' }]} />)
    fireEvent.click(tabList())
    expect(screen.queryByRole('columnheader', { name: pt['column.who'] })).toBeNull()
  })

  it('draws only what is inside the scene on the map; the list keeps everything', () => {
    const nodes = [...MOCK_CANVAS_NODES, { id: 'n-far', kind: 'task' as const, label: 'Fora da vista', x: 5000, y: 5000 }]
    render(<CanvasView nodes={nodes} edges={MOCK_CANVAS_EDGES} />)
    expect(screen.queryByRole('button', { name: /Fora da vista/u })).toBeNull()
    fireEvent.click(tabList())
    expect(screen.getByRole('cell', { name: 'Fora da vista' })).toBeTruthy()
  })

  it('empty: Luna, the two lines of the spec, and a button only when it goes somewhere', () => {
    const { rerender } = render(<CanvasView initialState="empty" />)
    expect(screen.getByText(pt['empty.title'])).toBeTruthy()
    expect(screen.getByText(pt['empty.hint'])).toBeTruthy()
    expect(screen.queryByRole('button', { name: pt['empty.action'] })).toBeNull()
    const go = vi.fn()
    rerender(<CanvasView initialState="empty" onEmptyPrimary={go} />)
    fireEvent.click(screen.getByRole('button', { name: pt['empty.action'] }))
    expect(go).toHaveBeenCalledTimes(1)
  })
})

describe('CanvasView map: readable nodes (Muse, app real)', () => {
  it('each node says its KIND (text, not only colour), the name is 15 px and the kind 12 px, a persona carries a portrait', () => {
    const { container } = render(<CanvasView nodes={MOCK_CANVAS_NODES} edges={MOCK_CANVAS_EDGES} />)
    const texts = [...container.querySelectorAll('svg text')].map(node => node.textContent ?? '')
    for (const kind of ['Persona', 'Tarefa', 'Decisão']) expect(texts).toContain(kind)
    expect(container.querySelectorAll('svg image').length).toBe(1) // Atlas
    expect(container.querySelector('svg [class*="nodeLabel"]')).not.toBeNull()
  })

  it('the scene is drawn in real pixels and zoom resizes it (no transform to scale the type)', () => {
    const { container } = render(<CanvasView nodes={MOCK_CANVAS_NODES} edges={MOCK_CANVAS_EDGES} />)
    const svg = container.querySelector('svg[role="presentation"]')!
    const before = Number(svg.getAttribute('width'))
    expect(before).toBeGreaterThanOrEqual(640)
    expect(svg.getAttribute('style') ?? '').not.toContain('scale')
    fireEvent.click(screen.getByRole('button', { name: pt['action.zoomIn'] }))
    expect(Number(svg.getAttribute('width'))).toBeGreaterThan(before)
    fireEvent.click(screen.getByRole('button', { name: pt['action.resetView'] }))
    expect(Number(svg.getAttribute('width'))).toBe(before)
  })

  it('the subtitle no longer carries development wording', () => {
    render(<CanvasView nodes={MOCK_CANVAS_NODES} edges={MOCK_CANVAS_EDGES} />)
    expect(screen.getByText('Tarefas, pessoas e decisões, e como se ligam.')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/Mesmos objetos do produto/u)
  })
})
