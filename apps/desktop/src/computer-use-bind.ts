/**
 * W3-5 host bind: overlay specs + input hook + resume IPC.
 */

import { ipcMain, type BrowserWindow } from 'electron'
import {
  COMPUTER_USE_IPC,
  COMPUTER_USE_RESUME_ACCELERATOR,
  applyPhysicalInput,
  createComputerUseController,
  humanHoldsComputer,
  resumeHeldPersonas,
} from './computer-use-control.ts'
import { attachComputerUseHook, type PhysicalHookEvent } from './computer-use-hook.ts'
import { installComputerUseOverlays, overlayWindowSpec, type OverlayDisplay, type OverlayWindowHandle } from './computer-use-overlay.ts'
import { personaCursorOverlayHtml } from './computer-use-cursor-renderer.ts'
import {
  WINDOWS_UIA_INVOKE_SCRIPT,
  WINDOWS_UIA_SETVALUE_SCRIPT,
  WINDOWS_UIA_SNAPSHOT_SCRIPT,
  clickNamedUia,
  createFakeUiaPort,
  createWindowsUiaPort,
  invokeUiaTarget,
  invokeWindowsUiaNamed,
  runWindowsUiaScript,
  setWindowsUiaValue,
  uiaClickPoint,
  type UiaPort,
  type UiaScriptSpawn,
} from './computer-use-uia.ts'
import { assertDesktopSender } from './ipc.ts'

/** Injectable overlay factory (tests / Muse HTML later). */
export interface ComputerUseBindHost {
  displays?: () => readonly OverlayDisplay[]
  createWindow?: (spec: ReturnType<typeof overlayWindowSpec>) => OverlayWindowHandle
  /** Fake in tests; Windows COM later. */
  uia?: UiaPort
  /** Injected InvokePattern runner. */
  invokeCom?: (name: string) => string
  /** Injected ValuePattern runner. */
  setValueCom?: (name: string, value: string) => string
  /** Physical mouse/key hook (tests / Electron / uiohook later). */
  subscribeHook?: (listener: (event: PhysicalHookEvent) => void) => () => void
  /** Register Devolver (Ctrl/Cmd+Shift+Space). */
  registerShortcut?: (accelerator: string, callback: () => void) => () => void
}

/**
 * COM host for main. Pass `createWindow` + `displays` to open Muse cursor overlays.
 * @param spawn - Injected PowerShell (tests never use a real CLI).
 * @param displays - Optional monitors.
 * @param createWindow - Optional overlay factory.
 */
export function createComputerUseComHost(input: {
  readonly spawn: UiaScriptSpawn
  readonly displays?: () => readonly OverlayDisplay[]
  readonly createWindow?: (spec: ReturnType<typeof overlayWindowSpec>) => OverlayWindowHandle
}): ComputerUseBindHost {
  const spawn = input.spawn
  return {
    ...(input.displays === undefined ? {} : { displays: input.displays }),
    ...(input.createWindow === undefined ? {} : { createWindow: input.createWindow }),
    uia: createWindowsUiaPort(() => runWindowsUiaScript(WINDOWS_UIA_SNAPSHOT_SCRIPT, {}, spawn)),
    invokeCom: name => runWindowsUiaScript(WINDOWS_UIA_INVOKE_SCRIPT, { PERSONA_UIA_NAME: name }, spawn),
    setValueCom: (name, value) => runWindowsUiaScript(
      WINDOWS_UIA_SETVALUE_SCRIPT,
      { PERSONA_UIA_NAME: name, PERSONA_UIA_VALUE: value },
      spawn,
    ),
  }
}

/**
 * Install resume/state IPC and optional overlay windows.
 * @param getWindow - App window.
 * @param host - Displays and window factory.
 */
export function installComputerUseBind(
  getWindow: () => BrowserWindow | undefined,
  host: ComputerUseBindHost = {},
) {
  const control = createComputerUseController()
  const assertOwner = (event: { readonly sender: unknown; readonly senderFrame: unknown }): void => {
    const window = getWindow()
    if (window === undefined || window.isDestroyed() || event.sender !== window.webContents
      || event.senderFrame !== window.webContents.mainFrame) {
      throw new Error('dsh desktop: rejected computer-use from an unowned renderer')
    }
    assertDesktopSender(event as { readonly senderFrame: { readonly url: string } | null }, ['app'])
  }

  ipcMain.handle(COMPUTER_USE_IPC.resume, (event, personaId: unknown) => {
    assertOwner(event)
    return typeof personaId === 'string' && control.resume(personaId)
  })
  ipcMain.handle(COMPUTER_USE_IPC.state, (event) => {
    assertOwner(event)
    return control.personas()
  })

  const displays = host.displays?.() ?? []
  const overlays = host.createWindow === undefined
    ? undefined
    : installComputerUseOverlays(displays, host.createWindow, personaCursorOverlayHtml())

  const uia = host.uia ?? createFakeUiaPort([])
  const disposeHook = host.subscribeHook === undefined
    ? undefined
    : attachComputerUseHook((action) => {
      if (action === 'pause') applyPhysicalInput(control, {})
      else resumeHeldPersonas(control)
    }, host.subscribeHook)
  const disposeShortcut = host.registerShortcut === undefined
    ? undefined
    : host.registerShortcut(COMPUTER_USE_RESUME_ACCELERATOR, () => {
      resumeHeldPersonas(control)
    })

  return {
    control,
    overlays,
    onHook: (event: { readonly synthesized?: boolean }) => applyPhysicalInput(control, event),
    resumeHeld: () => resumeHeldPersonas(control),
    held: () => humanHoldsComputer(control),
    invoke: (name: string) => {
      const result = invokeUiaTarget(uia, name, humanHoldsComputer(control))
      if (!result.ok) return result
      return { ...result, point: uiaClickPoint(result.node) }
    },
    clickNamed: (name: string, click: (x: number, y: number) => Promise<string>) => (
      clickNamedUia(uia, name, humanHoldsComputer(control), click)
    ),
    invokeCom: (name: string) => {
      if (host.invokeCom === undefined) return invokeUiaTarget(uia, name, humanHoldsComputer(control))
      return invokeWindowsUiaNamed(host.invokeCom, name, humanHoldsComputer(control))
    },
    setValueCom: (name: string, value: string) => {
      if (host.setValueCom === undefined) {
        const result = invokeUiaTarget(uia, name, humanHoldsComputer(control))
        return result.ok ? 'ok' : result.why
      }
      return setWindowsUiaValue(host.setValueCom, name, value, humanHoldsComputer(control))
    },
    close: () => {
      disposeHook?.()
      disposeShortcut?.()
      overlays?.close()
    },
  }
}
