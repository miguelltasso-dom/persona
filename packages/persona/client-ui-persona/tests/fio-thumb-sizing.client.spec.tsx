// @vitest-environment jsdom
// DESIGN-01 (Muse, 11/11 13:40) "Fio real" (b)(d): NÃO se amplia raster além do tamanho real. A imagem mostra, no máximo, a largura intrínseca dela dividida pelo DPR
// (um thumb de 192 px aparece com até 96 px CSS em tela 2x); o SVG da persona é vetor (o próprio arquivo, por <img src>) e escala sem perder nada em 240/320. O raster fica
// no tamanho real, centrado no espaço e com o fundo de papel, sem esticar e sem borrar.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DraftFileThumb } from '../src/client/chat/draft-files/DraftFileThumb.tsx'
import type { DraftFileUi } from '../src/client/chat/draft-files/draft-files-model.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'

installPreviewTheme()
const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(chatPt, key, params)) as never
const file = (thumb: string): DraftFileUi => ({ path: 'arte/cartaz.svg', name: 'cartaz.svg', mime: 'image/svg+xml', taskId: 'tk-1', personaId: 'p-teo', type: 'image', thumb })
const RASTER = 'data:image/png;base64,AAAA'
const VECTOR = 'data:image/svg+xml;base64,PHN2Zy8+'
const css = (): string => readFileSync(join(__dirname, '..', 'src', 'client', 'chat', 'draft-files', 'DraftFileThumb.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '')

const original = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio')
beforeEach(() => { Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true }) })
afterEach(() => {
  cleanup()
  if (original === undefined) Reflect.deleteProperty(window, 'devicePixelRatio')
  else Object.defineProperty(window, 'devicePixelRatio', original)
})

function loaded(variant: 'hero' | 'delivery', thumb: string, natural: number, dpr: number) {
  Object.defineProperty(window, 'devicePixelRatio', { value: dpr, configurable: true })
  const view = render(<DraftFileThumb t={t} file={file(thumb)} variant={variant} />)
  const image = view.container.querySelector('img') as HTMLImageElement
  Object.defineProperty(image, 'naturalWidth', { value: natural, configurable: true })
  fireEvent.load(image)
  return { box: view.container.querySelector('[data-draft-file]') as HTMLElement, image }
}

describe('raster: nunca além do tamanho real', () => {
  it('thumb de 192 px em tela 2x aparece com até 96 px CSS; em tela 1x, até 192 px', () => {
    expect(loaded('hero', RASTER, 192, 2).image.style.maxWidth).toBe('96px')
    cleanup()
    expect(loaded('hero', RASTER, 192, 1).image.style.maxWidth).toBe('192px')
  })

  it('vale também para a miniatura da entrega (240)', () => {
    const { box, image } = loaded('delivery', RASTER, 192, 2)
    expect(box.getAttribute('data-thumb')).toBe('raster')
    expect(image.style.maxWidth).toBe('96px')
  })

  it('antes de carregar (largura desconhecida) não inventa tamanho: o CSS não estica o raster (width:auto)', () => {
    const view = render(<DraftFileThumb t={t} file={file(RASTER)} variant="hero" />)
    expect((view.container.querySelector('img') as HTMLImageElement).style.maxWidth).toBe('')
    const hero = /\.hero\[data-thumb='raster'\] \.image\s*\{([^}]*)\}/u.exec(css())?.[1] ?? ''
    expect(hero).toMatch(/(?:^|[\s;])width:\s*auto/u)
    expect(hero).not.toMatch(/(?:^|[\s;])width:\s*100%/u)
  })
})

describe('SVG: o próprio arquivo, vetor, escala sem perder nada', () => {
  it('thumb em data:image/svg+xml é vetor: sem teto de largura natural e a imagem enche o espaço (até 320 / 240)', () => {
    const hero = loaded('hero', VECTOR, 300, 2)
    expect(hero.box.getAttribute('data-thumb')).toBe('vector')
    expect(hero.image.style.maxWidth).toBe('')
    expect(/\.hero\[data-thumb='vector'\] \.image\s*\{([^}]*)\}/u.exec(css())?.[1] ?? '').toMatch(/width:\s*100%/u)
    cleanup()
    const delivery = loaded('delivery', VECTOR, 300, 2)
    expect(delivery.box.getAttribute('data-thumb')).toBe('vector')
    expect(/\.delivery\[data-thumb='vector'\] \.image\s*\{([^}]*)\}/u.exec(css())?.[1] ?? '').toMatch(/max-height:\s*240px/u)
  })

  it('o raster não é esticado e a moldura ABRAÇA a imagem (Carbon fio-d103 #1: sem caixa dentro de caixa)', () => {
    const rule = /\.hero\[data-thumb='raster'\]\s*\{([^}]*)\}/u.exec(css())?.[1] ?? ''
    expect(rule).toMatch(/width:\s*fit-content/u)
    expect(rule).not.toMatch(/min-height/u)
  })
})
