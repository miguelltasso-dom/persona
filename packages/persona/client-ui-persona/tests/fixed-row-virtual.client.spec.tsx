// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

afterEach(() => { cleanup() })
import { FixedRowVirtualScroller } from '../src/client/primitives/FixedRowVirtualScroller.tsx'

describe('FixedRowVirtualScroller', () => {
  it('renders a window of rows for large lists', () => {
    const rowCount = 200
    const { container } = render(
      <div style={{ height: 400 }}>
        <FixedRowVirtualScroller
          rowCount={rowCount}
          rowHeight={52}
          getRowKey={index => `row-${index}`}
          renderRow={index => <div data-testid="row">{index}</div>}
        />
      </div>,
    )
    const rows = container.querySelectorAll('[data-testid="row"]').length
    expect(rows).toBeLessThan(rowCount)
    expect(rows).toBeGreaterThan(4)
  })
})
