// @vitest-environment jsdom
// Halo da luminária na folhagem v2 (NIGHT-THEME-SPEC §5, Muse 20:55): o centro (66,5% × 75,1%) mapeado para o retângulo REAL com que a arte
// é desenhada (cover, ancorada embaixo no centro); só com a arte v2 (544×520); e a origem da luz do chat sai do halo. O jsdom não pinta:
// a conta e a estrutura. O brilho, na captura.
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FoliageLampHalo } from '../src/client/shell/FoliageLampHalo.tsx'
import {
  FOLIAGE_LAMP_CENTER,
  HALO_SIZE,
  foliageLampOffset,
  isFoliageV2,
  lampOriginFromHalo,
  litFor,
} from '../src/client/chat/lamp-light.ts'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('isFoliageV2', () => {
  it('só a arte de 544×520 (a v1 não tem luminária)', () => {
    expect(isFoliageV2({ width: 544, height: 520 })).toBe(true)
    expect(isFoliageV2({ width: 528, height: 300 })).toBe(false)
    expect(isFoliageV2({ width: 0, height: 0 })).toBe(false)
  })
})

describe('foliageLampOffset (cover, ancorada embaixo no centro)', () => {
  const natural = { width: 544, height: 520 }

  it('rail de 296 px × 150 px: escala pela largura, o topo é cortado, a luminária cai a ~53% da altura do contêiner', () => {
    const point = foliageLampOffset({ width: 296, height: 150 }, natural)!
    const scale = 296 / 544
    const drawnH = 520 * scale
    expect(point.x).toBeCloseTo(296 * FOLIAGE_LAMP_CENTER.x, 5)
    expect(point.y).toBeCloseTo(150 - drawnH + drawnH * FOLIAGE_LAMP_CENTER.y, 5)
    expect(point.y).toBeGreaterThan(0)
    expect(point.y).toBeLessThan(150)
  })

  it('trilho de 64 px × 150 px: escala pela altura e centra na horizontal (a luminária fica perto da borda direita)', () => {
    const point = foliageLampOffset({ width: 64, height: 150 }, natural)!
    const scale = 150 / 520
    const drawnW = 544 * scale
    expect(point.x).toBeCloseTo((64 - drawnW) / 2 + drawnW * FOLIAGE_LAMP_CENTER.x, 5)
    expect(point.y).toBeCloseTo(150 * FOLIAGE_LAMP_CENTER.y, 5)
  })

  it('contêiner ou arte sem tamanho: null (nunca NaN)', () => {
    expect(foliageLampOffset({ width: 0, height: 150 }, natural)).toBeNull()
    expect(foliageLampOffset({ width: 296, height: 150 }, { width: 0, height: 0 })).toBeNull()
  })
})

describe('FoliageLampHalo', () => {
  function mount(natural: { width: number; height: number } | null) {
    const view = render(
      <div data-testid="foliage">
        {natural !== null && <img data-persona-foliage-dark="" alt="" />}
        <FoliageLampHalo />
      </div>,
    )
    const container = view.getByTestId('foliage')
    if (natural !== null) {
      const img = container.querySelector('img') as HTMLImageElement
      Object.defineProperty(img, 'naturalWidth', { configurable: true, value: natural.width })
      Object.defineProperty(img, 'naturalHeight', { configurable: true, value: natural.height })
    }
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 750, width: 296, height: 150, right: 296, bottom: 900, x: 0, y: 750, toJSON: () => ({}) })
    return view
  }

  it('com a arte v2: o halo aparece centrado na luminária (o 1º cálculo sai quando a imagem carrega)', () => {
    const view = mount({ width: 544, height: 520 })
    const img = view.container.querySelector('img') as HTMLImageElement
    act(() => { img.dispatchEvent(new Event('load')) })
    const halo = view.container.querySelector('[data-persona-lamp-halo]') as HTMLElement
    expect(halo).toBeTruthy()
    expect(halo.getAttribute('aria-hidden')).toBe('true')
    expect(halo.hasAttribute('hidden')).toBe(false)
    const expected = foliageLampOffset({ width: 296, height: 150 }, { width: 544, height: 520 })!
    expect(halo.style.left).toBe(`${String(Math.round(expected.x - HALO_SIZE / 2))}px`)
    expect(halo.style.top).toBe(`${String(Math.round(expected.y - HALO_SIZE / 2))}px`)
  })

  it('com a arte v1 (outro tamanho) o halo NÃO existe', () => {
    const view = mount({ width: 528, height: 300 })
    act(() => { (view.container.querySelector('img') as HTMLImageElement).dispatchEvent(new Event('load')) })
    expect(view.container.querySelector('[data-persona-lamp-halo]')).toBeNull()
    expect((view.container.querySelector('[class*="halo"]') as HTMLElement).hasAttribute('hidden')).toBe(true)
  })

  it('sem a imagem escura (tema sem arte) nada aparece e nada quebra', () => {
    const view = mount(null)
    expect(view.container.querySelector('[data-persona-lamp-halo]')).toBeNull()
  })
})

describe('a origem da luz do chat sai do halo', () => {
  it('sem halo: null (a conta fixa de antes continua)', () => {
    expect(lampOriginFromHalo()).toBeNull()
  })

  it('com halo: o centro do retângulo dele; e o --lit muda com a origem', () => {
    const halo = document.createElement('div')
    halo.setAttribute('data-persona-lamp-halo', '')
    document.body.appendChild(halo)
    vi.spyOn(halo, 'getBoundingClientRect').mockReturnValue({ left: 150, top: 700, width: 90, height: 90, right: 240, bottom: 790, x: 150, y: 700, toJSON: () => ({}) })
    const origin = lampOriginFromHalo()
    expect(origin).toEqual({ x: 195, y: 745 })
    halo.remove()
    const box = { left: 300, top: 0, width: 1000, height: 800 }
    const element = { left: 320, top: 700, width: 160, height: 40 }
    // mais perto da luminária real: mais luz do que com a origem fixa 110 px à esquerda
    expect(litFor(box, element, { x: 330, y: 720 })).toBeGreaterThan(litFor(box, element))
  })
})
