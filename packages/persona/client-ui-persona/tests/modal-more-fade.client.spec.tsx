// @vitest-environment jsdom
// Muse 16:08 (lib 6c): o degradê do fim da rolagem do Modal só vale enquanto ainda há conteúdo para rolar; no FIM da rolagem ele some,
// para a última linha (o aviso do snap do Esforço) nunca ficar sob a translucidez. O corpo tem 8 px de respiro embaixo: isso não é "mais abaixo".
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Modal } from '../src/client/primitives/index.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
afterEach(() => { cleanup() })

function setBox(element: HTMLElement, box: { readonly scrollHeight: number; readonly clientHeight: number; scrollTop: number }): void {
  Object.defineProperty(element, 'scrollHeight', { configurable: true, value: box.scrollHeight })
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: box.clientHeight })
  Object.defineProperty(element, 'scrollTop', { configurable: true, writable: true, value: box.scrollTop })
}

describe('Modal — degradê "ainda há mais abaixo"', () => {
  it('aparece com conteúdo abaixo, some no fim da rolagem (as 8 px de respiro não contam) e não existe sem rolagem', () => {
    render(
      <Modal open title="Teste" closeLabel="Fechar" onClose={() => undefined}>
        <div data-testid="content">conteúdo</div>
      </Modal>,
    )
    const body = screen.getByTestId('content').parentElement as HTMLElement
    const check = (box: { scrollHeight: number; clientHeight: number; scrollTop: number }): boolean => {
      setBox(body, box)
      act(() => { fireEvent.scroll(body) })
      return body.hasAttribute('data-more')
    }
    expect(check({ scrollHeight: 1000, clientHeight: 400, scrollTop: 0 })).toBe(true)
    expect(check({ scrollHeight: 1000, clientHeight: 400, scrollTop: 300 })).toBe(true)
    // No FIM: falta só o respiro de 8 px (o último elemento termina 8 px antes do fim do corpo): sem degradê.
    expect(check({ scrollHeight: 1000, clientHeight: 400, scrollTop: 592 })).toBe(false)
    expect(check({ scrollHeight: 1000, clientHeight: 400, scrollTop: 600 })).toBe(false)
    // Sem rolagem nenhuma: sem degradê.
    expect(check({ scrollHeight: 400, clientHeight: 400, scrollTop: 0 })).toBe(false)
  })
})
