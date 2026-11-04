/** Loader `!!js` must not call `new Function` at import (desktop CSP / empty #root). */
import { evaluate, interpolate } from '@deepseek-ai/cordis-plugin-loader'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const src = resolve(fileURLToPath(new URL('../vendor/loader/src/config/utils.ts', import.meta.url)))

it('does not construct Function at module init', () => {
  const text = readFileSync(src, 'utf8')
  expect(text).not.toMatch(/export const evaluate = new Function/)
  expect(text).toContain('compiled ??= compileEvaluate()')
})

it('still evaluates host !!js after first use', () => {
  expect(evaluate({ n: 2 }, 'n + 1')).toBe(3)
  expect(interpolate({ n: 2 }, { __jsExpr: 'n * 3' })).toBe(6)
  expect(interpolate({ n: 2 }, { keep: 1 })).toEqual({ keep: 1 })
})
