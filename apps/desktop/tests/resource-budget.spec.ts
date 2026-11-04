import { describe, expect, it } from 'vitest'
import {
  DESKTOP_CONNECTION_CAP,
  DESKTOP_HOST_CHILD_CAP,
  DESKTOP_RENDERER_LIMIT,
  applyChromiumResourceBudget,
} from '../src/resource-budget.ts'

describe('desktop resource budget', () => {
  it('applies a renderer-process-limit before ready', () => {
    const switches: Array<[string, string | undefined]> = []
    applyChromiumResourceBudget({
      appendSwitch: (name: string, value?: string) => {
        switches.push([name, value])
      },
    })
    expect(switches).toEqual([['renderer-process-limit', String(DESKTOP_RENDERER_LIMIT)]])
    expect(DESKTOP_HOST_CHILD_CAP).toBe(1)
    expect(DESKTOP_CONNECTION_CAP).toBe(8)
    expect(DESKTOP_RENDERER_LIMIT).toBe(4)
  })
})
