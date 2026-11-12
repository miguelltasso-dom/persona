// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { DESKTOP_IPC } from '../src/ipc.ts'
import { rgbOf, syncWindowsAppearance } from '../src/preload-windows.ts'

const send = vi.hoisted(() => vi.fn())
vi.mock('electron', () => ({ ipcRenderer: { send } }))
vi.mock('../src/preload-menu.ts', () => ({ installWindowsMenu: () => ({ update: vi.fn(), dispose: vi.fn() }) }))

afterEach(() => {
  window.dispatchEvent(new Event('pagehide'))
  document.documentElement.removeAttribute('data-windows-titlebar')
  document.documentElement.style.removeProperty('--dsh-windows-titlebar-height')
  document.documentElement.lang = 'en'
  document.body.removeAttribute('data-ds-dark-theme')
  vi.restoreAllMocks()
  send.mockClear()
})

it('reads a computed rgb()/rgba() straight from the string, the way the canvas would, and leaves everything else to the canvas', () => {
  expect(rgbOf('rgb(255, 255, 255)')).toBe('rgba(255, 255, 255, 1)')
  expect(rgbOf('rgba(0, 0, 0, 0)')).toBe('rgba(0, 0, 0, 0)')
  expect(rgbOf('rgba(52, 36, 63, 0.16)')).toBe('rgba(52, 36, 63, 0.1607843137254902)') // 41 / 255: the byte a canvas reads back
  expect(rgbOf(' rgb(1,2,3) ')).toBe('rgba(1, 2, 3, 1)')
  for (const kept of ['black', 'oklch(0.2 0 0)', 'hsl(0 0% 100%)', 'color(srgb 0.1 0.2 0.3)', '#fff', 'rgb(1 2 3)', '']) expect(rgbOf(kept)).toBeUndefined()
})

it('does not create a canvas (nor read pixels back) while the colors are plain rgb(); it makes ONE when a color needs it', async () => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
  vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading')
  let background = 'rgb(240, 240, 240)'
  vi.spyOn(globalThis, 'getComputedStyle').mockImplementation(() => ({ backgroundColor: background, color: 'rgba(0, 0, 0, 0.5)' }) as CSSStyleDeclaration)
  const context = {
    fillStyle: '', clearRect: vi.fn(), fillRect: vi.fn(),
    getImageData: () => ({ data: new Uint8ClampedArray(context.fillStyle.startsWith('hsl') ? [128, 128, 128, 255] : [27, 27, 28, 255]) }),
  }
  const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
  document.documentElement.lang = 'en'
  syncWindowsAppearance()
  window.dispatchEvent(new Event('DOMContentLoaded'))
  expect(send).toHaveBeenLastCalledWith(DESKTOP_IPC.windowsAppearance, 'en', 'rgba(240, 240, 240, 1)', 'rgba(0, 0, 0, 0.5019607843137255)')
  expect(getContext).not.toHaveBeenCalled()
  background = 'oklch(0.2 0 0)'
  document.body.setAttribute('data-ds-dark-theme', '')
  await vi.waitFor(() => { expect(send).toHaveBeenLastCalledWith(DESKTOP_IPC.windowsAppearance, 'en', 'rgba(27, 27, 28, 1)', 'rgba(0, 0, 0, 0.5019607843137255)') })
  expect(getContext).toHaveBeenCalledTimes(1)
  background = 'hsl(0 0% 50%)'
  document.body.setAttribute('data-ds-dark-theme', 'again')
  await vi.waitFor(() => { expect(send).toHaveBeenLastCalledWith(DESKTOP_IPC.windowsAppearance, 'en', 'rgba(128, 128, 128, 1)', 'rgba(0, 0, 0, 0.5019607843137255)') })
  expect(getContext).toHaveBeenCalledTimes(1) // the canvas is made once and reused
})

it.each(['darwin', 'linux'] as const)('does not install Windows controls on %s', (platform) => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue(platform)
  syncWindowsAppearance()
  expect(document.documentElement.hasAttribute('data-windows-titlebar')).toBe(false)
  expect(send).not.toHaveBeenCalled()
})

it('synchronizes live language and palette changes and stops observing a closed document', async () => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
  vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading')
  vi.spyOn(globalThis, 'getComputedStyle').mockImplementation(() => ({
    backgroundColor: document.body.hasAttribute('data-ds-dark-theme') ? 'oklch(0.2 0 0)' : 'hsl(0 0% 100%)',
    color: 'black',
  }) as CSSStyleDeclaration)
  const context = {
    fillStyle: '', clearRect: vi.fn(), fillRect: vi.fn(),
    getImageData: () => ({ data: new Uint8ClampedArray(context.fillStyle === 'black'
      ? [0, 0, 0, 255] : context.fillStyle.startsWith('oklch') ? [27, 27, 28, 255] : [255, 255, 255, 255]) }),
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
  document.documentElement.lang = 'en'
  syncWindowsAppearance()
  expect(send).not.toHaveBeenCalled()
  expect(document.documentElement.hasAttribute('data-windows-titlebar')).toBe(true)
  window.dispatchEvent(new Event('DOMContentLoaded'))
  expect(document.documentElement.style.getPropertyValue('--dsh-windows-titlebar-height')).toBe('40px')
  expect(send).toHaveBeenLastCalledWith(DESKTOP_IPC.windowsAppearance, 'en', 'rgba(255, 255, 255, 1)', 'rgba(0, 0, 0, 1)')
  document.documentElement.lang = 'zh-CN'
  document.body.setAttribute('data-ds-dark-theme', '')
  await vi.waitFor(() => { expect(send).toHaveBeenLastCalledWith(DESKTOP_IPC.windowsAppearance, 'zh-CN', 'rgba(27, 27, 28, 1)', 'rgba(0, 0, 0, 1)') })
  window.dispatchEvent(new Event('pagehide'))
  send.mockClear()
  document.documentElement.lang = 'en'
  await new Promise<void>((resolve) => { queueMicrotask(resolve) })
  expect(send).not.toHaveBeenCalled()
})
