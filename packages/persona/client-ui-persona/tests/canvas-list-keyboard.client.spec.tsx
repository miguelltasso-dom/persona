// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CanvasView } from '../src/client/canvas/CanvasView.tsx'
import { MOCK_CANVAS_EDGES, MOCK_CANVAS_NODES } from '../src/client/canvas/mock-data.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()

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
  })
})
