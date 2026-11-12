import type { MenuItemConstructorOptions } from 'electron'
import { afterEach, expect, it, vi } from 'vitest'
import { resolveDesktopLocale } from '../src/locale.ts'
import { DesktopTray, trayKindOf } from '../src/tray.ts'

const native = await vi.hoisted(async () => {
  const { EventEmitter } = await import('node:events')
  const trays: FakeTray[] = []
  class FakeTray extends EventEmitter {
    readonly setToolTip = vi.fn()
    readonly setContextMenu = vi.fn()
    readonly setImage = vi.fn()
    readonly destroy = vi.fn()
    constructor(readonly image: unknown) { super(); trays.push(this) }
  }
  const menus: MenuItemConstructorOptions[][] = []
  return {
    trays, FakeTray, menus,
    createFromPath: vi.fn((path: string) => ({ path })),
    buildFromTemplate: vi.fn((template: MenuItemConstructorOptions[]) => { menus.push(template); return { template } }),
  }
})
vi.mock('electron', () => ({
  Tray: native.FakeTray,
  nativeImage: { createFromPath: native.createFromPath },
  Menu: { buildFromTemplate: native.buildFromTemplate },
}))

afterEach(() => { native.trays.length = 0; native.menus.length = 0; vi.clearAllMocks() })

function setup(locale = 'en') {
  let current = resolveDesktopLocale(locale)
  const open = vi.fn()
  const quit = vi.fn()
  const pause = vi.fn()
  const tray = new DesktopTray({ iconPath: 'C:/app/resources/tray.ico', locale: () => current, open, pause, quit })
  return { tray, open, pause, quit, native: native.trays[0]!, setLocale: (next: string) => { current = resolveDesktopLocale(next) } }
}

function labels(menu: MenuItemConstructorOptions[]): (string | undefined)[] {
  return menu.map(item => item.type === 'separator' ? 'separator' : item.label)
}

it('shows the application icon with its name as the tooltip and an Open / Pause / Quit menu', () => {
  const f = setup()
  expect(native.createFromPath).toHaveBeenCalledWith('C:/app/resources/tray.ico')
  expect(f.native.image).toEqual({ path: 'C:/app/resources/tray.ico' })
  expect(f.native.setToolTip).toHaveBeenCalledWith('Persona — team resting')
  expect(labels(native.menus[0]!)).toEqual([
    'Team resting', 'Open Persona', 'separator', 'Pause the team', 'Open logs folder', 'Copy diagnostic', 'separator', 'Quit for good',
  ])
  expect(f.native.setContextMenu).toHaveBeenCalledWith({ template: native.menus[0] })
})

it('opens the window on a single click and routes menu entries to the open, pause and quit actions', () => {
  const f = setup()
  f.native.emit('click')
  expect(f.open).toHaveBeenCalledOnce()
  const menu = native.menus[0]!
  ;(menu[1] as { click: () => void }).click()
  ;(menu[3] as { click: () => void }).click()
  ;(menu[7] as { click: () => void }).click()
  expect(f.open).toHaveBeenCalledTimes(2)
  expect(f.pause).toHaveBeenCalledOnce()
  expect(f.quit).toHaveBeenCalledOnce()
})

it('relabels the menu in the current locale and ignores relabel after disposal', () => {
  const f = setup()
  f.setLocale('pt')
  f.tray.relabel()
  expect(labels(native.menus[1]!)).toEqual([
    'equipe descansando', 'Abrir a Persona', 'separator', 'Pausar a equipe', 'Abrir pasta de logs', 'Copiar diagnóstico', 'separator', 'Sair de vez',
  ])
  f.tray.dispose()
  f.tray.dispose()
  expect(f.native.destroy).toHaveBeenCalledOnce()
  f.tray.relabel()
  expect(native.menus).toHaveLength(2)
})

it('prefers needs-you over working and shows the overview item', () => {
  expect(trayKindOf({ working: 2, needsYou: 1, paused: false })).toBe('needs-you')
  expect(trayKindOf({ working: 2, needsYou: 0, paused: false })).toBe('working')
  expect(trayKindOf({ working: 2, needsYou: 1, paused: true })).toBe('paused')
  const f = setup()
  f.tray.setPresence({ working: 2, needsYou: 1, paused: false })
  expect(f.native.setToolTip).toHaveBeenCalledWith('Persona — 1 need you')
  expect(labels(native.menus.at(-1)!)).toEqual([
    '2 working · 1 need you', 'Open Persona', 'See what needs you', 'separator', 'Pause the team',
    'Open logs folder', 'Copy diagnostic', 'separator', 'Quit for good',
  ])
})
