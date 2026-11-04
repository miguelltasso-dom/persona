import { describe, expect, it } from 'vitest'
import { desktopComputerUseActions } from '../src/computer-use-ports.ts'

describe('W3-5 desktop acting host', () => {
  it('refuses click and type while the human holds control', async () => {
    let held = true
    const host = desktopComputerUseActions({
      held: () => held,
      setValueCom: (_name, value) => `typed ${value}`,
    })
    expect(host.held()).toBe(true)
    expect(await host.click(4, 8)).toBe('humano no controle')
    expect(await host.type('oi')).toBe('humano no controle')
    held = false
    expect(await host.click(4, 8)).toBe('ok 4,8')
    expect(await host.type('oi')).toBe('typed oi')
  })
})
