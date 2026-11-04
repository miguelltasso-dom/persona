// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Avatar } from '../src/client/primitives/Avatar.tsx'
import { Modal } from '../src/client/primitives/Overlays.tsx'

afterEach(() => { cleanup() })

describe('Avatar icon (system actor, Muse 04/11)', () => {
  it('shows the icon and no initials when there is no portrait', () => {
    const { container } = render(<Avatar name="O bibliotecário" icon={<svg data-testid="book" />} />)
    expect(screen.getByTestId('book')).toBeTruthy()
    expect(container.textContent).not.toContain('OB')
    expect(container.querySelector('[data-icon]')).not.toBeNull()
  })

  it('a portrait wins over the icon', () => {
    const { container } = render(<Avatar name="Nina" src="nina.webp" icon={<svg data-testid="book" />} />)
    expect(screen.queryByTestId('book')).toBeNull()
    expect(container.querySelector('img')).not.toBeNull()
  })
})

describe('Modal makes the rest of the app inert while open', () => {
  function App({ open }: { readonly open: boolean }) {
    return (
      <div>
        <nav data-testid="rail"><button type="button">Canais</button></nav>
        <div role="status" data-testid="live">Salvo</div>
        <main>
          <Modal open={open} title="Adicionar conta" closeLabel="Fechar" onClose={() => {}}>
            <p>Corpo</p>
          </Modal>
        </main>
      </div>
    )
  }

  it('marks siblings inert (but not live regions) and releases them on close', () => {
    const { rerender } = render(<App open />)
    expect(screen.getByTestId('rail').hasAttribute('inert')).toBe(true)
    expect(screen.getByTestId('live').hasAttribute('inert')).toBe(false)
    expect(screen.getByRole('dialog').closest('[inert]')).toBeNull()
    rerender(<App open={false} />)
    expect(screen.getByTestId('rail').hasAttribute('inert')).toBe(false)
  })
})
