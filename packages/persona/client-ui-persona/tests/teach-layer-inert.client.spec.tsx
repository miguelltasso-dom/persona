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

describe('Ensinar — a camada mora sobre o main do shell (a barra e o caminho de volta ficam à vista)', () => {
  it('com um main medido, a camada ocupa só a área dele; sem main, a janela toda', () => {
    const main = document.createElement('main')
    main.setAttribute('data-persona-area', 'main')
    main.getBoundingClientRect = () => ({ x: 264, y: 0, left: 264, top: 0, right: 1000, bottom: 600, width: 736, height: 600, toJSON: () => ({}) })
    document.body.append(main)
    Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 700, configurable: true })
    render(<TeachLayer label="Passo a passo" back={{ label: 'Voltar para a conversa com Nina', onBack: () => {} }}><button type="button">Dentro</button></TeachLayer>)
    const layer = screen.getByRole('dialog', { name: 'Passo a passo' })
    // top 0, right 1200-1000, bottom 700-600, left 264
    expect(layer.style.inset).toBe('0px 200px 100px 264px')
    expect(screen.getByRole('button', { name: 'Voltar para a conversa com Nina' })).toBeTruthy()
    cleanup()
    main.remove()
    render(<TeachLayer label="Sem main"><button type="button">Dentro</button></TeachLayer>)
    expect(screen.getByRole('dialog', { name: 'Sem main' }).style.inset).toBe('')
    expect(screen.queryByRole('button', { name: /Voltar/u })).toBeNull()
  })
})
