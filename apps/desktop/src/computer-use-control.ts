/**
 * W3-5 shared control (Muse COMPUTER-USE-SPEC §5/§7).
 * Human mouse/key pauses every persona; resume is explicit only.
 */

/** Main → overlay renderer channels (COMPUTER-USE-SPEC §7). */
export const COMPUTER_USE_IPC = {
  move: 'dsh-desktop:cu-move',
  click: 'dsh-desktop:cu-click',
  type: 'dsh-desktop:cu-type',
  state: 'dsh-desktop:cu-state',
  frame: 'dsh-desktop:cu-frame',
  resume: 'dsh-desktop:cu-resume',
} as const

/** Cursor presentation state. */
export type ComputerUseCursorState = 'idle' | 'moving' | 'clicking' | 'typing' | 'waiting' | 'human'

/** Physical input vs persona-generated events. */
export type ComputerUseInputOrigin = 'human' | 'synthetic'

/** One on-screen persona cursor. */
export interface ComputerUsePersona {
  readonly personaId: string
  state: ComputerUseCursorState
  progress: number
}

/**
 * In-memory overlay controller. Main sends targets; renderer animates.
 */
export function createComputerUseController(): {
  personas: () => readonly ComputerUsePersona[]
  begin: (personaId: string) => void
  setState: (personaId: string, state: ComputerUseCursorState, progress?: number) => void
  onInput: (origin: ComputerUseInputOrigin) => readonly string[]
  resume: (personaId: string) => boolean
} {
  const byId = new Map<string, ComputerUsePersona>()
  return {
    personas: () => [...byId.values()],
    begin: (personaId) => {
      byId.set(personaId, { personaId, state: 'idle', progress: 0 })
    },
    setState: (personaId, state, progress) => {
      const row = byId.get(personaId)
      if (row === undefined || row.state === 'human') return
      row.state = state
      if (progress !== undefined) row.progress = progress
    },
    onInput: (origin) => {
      if (origin !== 'human') return []
      const paused: string[] = []
      for (const row of byId.values()) {
        if (row.state === 'human') continue
        row.state = 'human'
        paused.push(row.personaId)
      }
      return paused
    },
    resume: (personaId) => {
      const row = byId.get(personaId)
      if (row === undefined || row.state !== 'human') return false
      row.state = 'idle'
      return true
    },
  }
}

/** Shared overlay controller (pause on human input). */
export type ComputerUseController = ReturnType<typeof createComputerUseController>

/**
 * Refuse local click/type while the human holds control.
 * @param control - Shared overlay controller.
 */
export function humanHoldsComputer(control: ComputerUseController): boolean {
  return control.personas().some(row => row.state === 'human')
}

/**
 * Synthetic persona events stay ignored; physical mouse/key pauses everyone.
 * @param event - Input from uiohook or a test double.
 */
export function classifyInputOrigin(event: { readonly synthesized?: boolean }): ComputerUseInputOrigin {
  return event.synthesized === true ? 'synthetic' : 'human'
}

/**
 * Apply a hook event to the shared controller.
 * @param control - Overlay controller.
 * @param event - Physical or synthetic input.
 */
export function applyPhysicalInput(
  control: ComputerUseController,
  event: { readonly synthesized?: boolean },
): readonly string[] {
  return control.onInput(classifyInputOrigin(event))
}

/**
 * Resume every persona the human is holding. Never auto-fires.
 * @param control - Overlay controller.
 */
export function resumeHeldPersonas(control: ComputerUseController): readonly string[] {
  const ids = control.personas().filter(row => row.state === 'human').map(row => row.personaId)
  const resumed: string[] = []
  for (const personaId of ids) {
    if (control.resume(personaId)) resumed.push(personaId)
  }
  return resumed
}

/** Muse §5: Devolver never auto-resumes. */
export const COMPUTER_USE_RESUME_ACCELERATOR = 'CommandOrControl+Shift+Space'

/**
 * True for Ctrl/Cmd+Shift+Space (Devolver).
 * @param input - Key event from the hook or menu.
 */
export function isComputerUseResumeAccelerator(input: {
  readonly control: boolean
  readonly shift: boolean
  readonly key: string
}): boolean {
  return input.control && input.shift && (input.key === ' ' || input.key === 'Space')
}
