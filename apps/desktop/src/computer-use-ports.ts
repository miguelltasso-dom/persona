/**
 * W3-5 desktop host for MCP `persona_computer_*` (Rivet acting ports).
 */

/**
 * Click/type/screenshot adapters the runner gateway injects.
 */
export interface DesktopComputerUseActions {
  readonly held: () => boolean
  readonly screenshot?: () => Promise<string>
  readonly click: (x: number, y: number) => Promise<string>
  readonly type: (text: string) => Promise<string>
}

/**
 * Map the overlay bind onto acting-port callbacks.
 * Human hold is reported; the runner gate also checks it.
 * @param bind - installComputerUseBind handle.
 * @returns Click/type adapters for `actingPortsFromComputerUse`.
 */
export function desktopComputerUseActions(bind: {
  readonly held: () => boolean
  readonly setValueCom: (name: string, value: string) => string
}): DesktopComputerUseActions {
  return {
    held: () => bind.held(),
    click: async (x, y) => {
      if (bind.held()) return 'humano no controle'
      return `ok ${x},${y}`
    },
    type: async (text) => {
      if (bind.held()) return 'humano no controle'
      return bind.setValueCom('', text)
    },
  }
}
