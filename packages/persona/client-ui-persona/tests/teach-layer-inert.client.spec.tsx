// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TeachLayer } from '../src/client/teach/TeachReview.tsx'

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

describe('Ensinar — a camada de tela cheia deixa o app de trás fora de alcance', () => {
  it('tudo que não é a camada (nem o caminho até ela) fica inert enquanto ela existe, e volta ao sair', () => {
    const otherRoot = document.createElement('div')
    otherRoot.id = 'other-root'
    document.body.append(otherRoot)
    render(
      <>
        <div data-testid="app"><button type="button">Rail</button></div>
        <TeachLayer label="Passo a passo"><button type="button">Dentro</button></TeachLayer>
      </>,
    )
    expect(screen.getByTestId('app').hasAttribute('inert')).toBe(true)
    expect(otherRoot.hasAttribute('inert')).toBe(true)
    // the layer itself and the path down to it are never inert
    const layer = screen.getByRole('dialog', { name: 'Passo a passo' })
    expect(layer.hasAttribute('inert')).toBe(false)
    expect(layer.parentElement?.hasAttribute('inert')).toBe(false)
    cleanup()
    expect(otherRoot.hasAttribute('inert')).toBe(false)
  })

  it('o que já estava inert por outro motivo continua assim quando a camada sai', () => {
    const already = document.createElement('div')
    already.setAttribute('inert', '')
    document.body.append(already)
    const { unmount } = render(<TeachLayer label="Camada"><button type="button">Dentro</button></TeachLayer>)
    expect(already.hasAttribute('inert')).toBe(true)
    unmount()
    expect(already.hasAttribute('inert')).toBe(true)
  })

  it('trocar de fase (camada nova com outra key) não deixa nada preso em inert', () => {
    const app = document.createElement('div')
    document.body.append(app)
    const { rerender, unmount } = render(<TeachLayer key="a" label="Uma"><button type="button">A</button></TeachLayer>)
    expect(app.hasAttribute('inert')).toBe(true)
    rerender(<TeachLayer key="b" label="Outra"><button type="button">B</button></TeachLayer>)
    expect(app.hasAttribute('inert')).toBe(true)
    unmount()
    expect(app.hasAttribute('inert')).toBe(false)
  })
})
