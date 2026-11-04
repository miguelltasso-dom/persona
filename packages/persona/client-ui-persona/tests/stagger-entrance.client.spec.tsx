// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { StaggerEntrance } from '../src/client/primitives/StaggerEntrance.tsx'

afterEach(cleanup)

describe('StaggerEntrance', () => {
  it('can render as the <li> itself, so lists keep valid semantics (axe list/listitem)', () => {
    const { container } = render(<ul>{[0, 1].map(i => <StaggerEntrance key={i} as="li" index={i} className="x">item {i}</StaggerEntrance>)}</ul>)
    const ul = container.querySelector('ul')!
    expect([...ul.children].every(c => c.tagName === 'LI')).toBe(true)
    expect(ul.querySelector('li')!.className).toContain('x')
  })
  it('defaults to a div (unchanged for other callers)', () => {
    const { container } = render(<StaggerEntrance index={0}>a</StaggerEntrance>)
    expect(container.firstElementChild!.tagName).toBe('DIV')
  })
})
