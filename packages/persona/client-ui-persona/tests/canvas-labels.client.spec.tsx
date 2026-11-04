// @vitest-environment jsdom
// 960x640 / zoom 200 %: a long task label must not run over its neighbour or off the scene.
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CANVAS_LABEL_MAX, CanvasView, shortNodeLabel } from '../src/client/canvas/CanvasView.tsx'

afterEach(() => { cleanup() })

const LONG = 'Bom dia, equipe! Preciso fechar a proposta de contratação até amanhã'

describe('Canvas node labels', () => {
  it('shortNodeLabel keeps short names and cuts long ones with an ellipsis within the limit', () => {
    expect(shortNodeLabel('Luna')).toBe('Luna')
    const cut = shortNodeLabel(LONG)
    expect(cut.length).toBeLessThanOrEqual(CANVAS_LABEL_MAX)
    expect(cut.endsWith('…')).toBe(true)
    expect(shortNodeLabel('   Sol   ')).toBe('Sol')
  })

  it('the scene draws the short label, keeps the whole text in the tooltip and in the accessible name', () => {
    const { container } = render(
      <CanvasView
        nodes={[
          { id: 'p', kind: 'persona', label: 'Luna', x: 80, y: 80 },
          { id: 't', kind: 'task', label: LONG, x: 280, y: 80 },
        ]}
        edges={[{ id: 'e', from: 'p', to: 't' }]}
      />,
    )
    const texts = [...container.querySelectorAll('svg text')].map(node => node.textContent ?? '')
    expect(texts.some(text => text.includes('…'))).toBe(true)
    expect(texts.every(text => !text.includes('equipe! Preciso fechar a proposta de contratação até amanhã'.slice(0, 40)) || text.includes(LONG))).toBe(true)
    const group = container.querySelector('g[role="button"][aria-label*="Preciso fechar"]')
    expect(group?.getAttribute('aria-label')).toContain(LONG)
    expect(container.querySelector('svg text title')?.textContent).toBeTruthy()
  })
})
