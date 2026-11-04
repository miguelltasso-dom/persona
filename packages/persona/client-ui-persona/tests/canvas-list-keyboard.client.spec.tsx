// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CanvasView } from '../src/client/canvas/CanvasView.tsx'
import { MOCK_CANVAS_EDGES, MOCK_CANVAS_NODES } from '../src/client/canvas/mock-data.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
afterEach(() => { cleanup() })

describe('CanvasView list mode (G2)', () => {
  it('moves roving tabindex with ArrowDown in list mode', () => {
    render(
      <CanvasView nodes={MOCK_CANVAS_NODES} edges={MOCK_CANVAS_EDGES} />,
    )
    fireEvent.click(screen.getByRole('tab', { name: /lista|list/i }))
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows[0]?.tabIndex).toBe(0)
    expect(rows[1]?.tabIndex).toBe(-1)
    fireEvent.keyDown(rows[0]!, { key: 'ArrowDown' })
    expect(rows[0]?.tabIndex).toBe(-1)
    expect(rows[1]?.tabIndex).toBe(0)
    expect(document.activeElement).toBe(rows[1])
  })

  it('Home and End move roving tabindex to first and last row', async () => {
    render(
      <CanvasView nodes={MOCK_CANVAS_NODES} edges={MOCK_CANVAS_EDGES} />,
    )
    fireEvent.click(screen.getByRole('tab', { name: /lista|list/i }))
    let rows = screen.getAllByRole('row').slice(1)
    rows.at(-1)?.focus()
    fireEvent.keyDown(rows.at(-1)!, { key: 'Home' })
    await waitFor(() => {
      rows = screen.getAllByRole('row').slice(1)
      expect(rows[0]?.tabIndex).toBe(0)
      expect(rows.at(-1)?.tabIndex).toBe(-1)
    })
    fireEvent.keyDown(rows[0]!, { key: 'End' })
    await waitFor(() => {
      rows = screen.getAllByRole('row').slice(1)
      expect(rows.at(-1)?.tabIndex).toBe(0)
      expect(rows[0]?.tabIndex).toBe(-1)
    })
  })
})
