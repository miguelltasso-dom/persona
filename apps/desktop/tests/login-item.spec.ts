import { describe, expect, it, vi } from 'vitest'
import { DesktopLoginItem } from '../src/login-item.ts'

describe('desktop login item', () => {
  it('starts off and only enables on explicit consent', () => {
    const apply = vi.fn()
    const item = new DesktopLoginItem({ apply })
    expect(apply).toHaveBeenCalledWith({ openAtLogin: false })
    expect(item.openAtLogin).toBe(false)
    item.setOpenAtLogin(true)
    expect(item.openAtLogin).toBe(true)
    expect(apply).toHaveBeenLastCalledWith({ openAtLogin: true })
    item.setOpenAtLogin(false)
    expect(apply).toHaveBeenLastCalledWith({ openAtLogin: false })
  })
})
