// @vitest-environment jsdom
/**
 * Muse (DESIGN-01 · ARTE lote 1.2, 11/11): UiIcon draws Brush's own UI glyphs. Every glyph Brush delivered in
 * persona-assets/icons/ui-glyphs/ must be the path data UiIcon renders (so the app never drifts back to a generic stroke),
 * stroke-only and currentColor (so it themes). 'baton' waits for Brush's redraw; 'fileText'/'fileSheet' have no glyph yet.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { UiIcon, type UiIconName } from '../src/client/primitives/icons.tsx'

// A path, not a URL: under jsdom the global URL is jsdom's, and node:fs refuses it.
const dir = join(dirname(fileURLToPath(import.meta.url)), '../../../../persona-assets/icons/ui-glyphs')
const PENDING: ReadonlySet<string> = new Set<string>([])
const glyphs = existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.svg')).map(f => f.replace(/\.svg$/u, '')) : []
/** The drawing elements of an <svg>, as "tag attr=value…" (order of attributes ignored; React and files serialize differently). */
const shapes = (svg: Element): string[] => [...svg.querySelectorAll('path, circle, rect, line, polyline, polygon, ellipse')].map(el =>
  [el.tagName.toLowerCase(), ...[...el.attributes].map(a => `${a.name}=${a.value}`).sort()].join(' ')).sort() // stroke-only: order does not change the drawing
const parse = (markup: string): Element => new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement

describe('UiIcon uses Brush glyphs', () => {
  it('found the delivered glyphs', () => {
    expect(glyphs.length).toBeGreaterThanOrEqual(24)
  })

  for (const name of glyphs.filter(n => !PENDING.has(n))) {
    it(`${name} renders Brush's path data`, () => {
      const source = readFileSync(join(dir, `${name}.svg`), 'utf8').replace(/^﻿/u, '') // some exports carry a BOM
      expect(source).toContain('stroke="currentColor"')
      expect(source).not.toMatch(/fill="#|stroke="#|<text|<image/u)
      const { container } = render(<UiIcon name={name as UiIconName} />)
      expect(shapes(container.querySelector('svg')!)).toEqual(shapes(parse(source)))
    })
  }
})
