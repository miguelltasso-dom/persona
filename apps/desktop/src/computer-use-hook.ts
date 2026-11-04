/**
 * W3-5 physical input hook. Tests inject; main can use before-input-event
 * until a global uiohook is available (Keel install).
 */

import { isComputerUseResumeAccelerator } from './computer-use-control.ts'

/** One hook event from uiohook, Electron, or a test double. */
export interface PhysicalHookEvent {
  readonly kind: 'mouse' | 'key'
  readonly synthesized?: boolean
  readonly control?: boolean
  readonly shift?: boolean
  readonly key?: string
}

/** What the overlay controller should do. */
export type PhysicalHookAction = 'pause' | 'resume' | 'ignore'

/**
 * Classify a hook event. Devolver is resume, never an auto-pause.
 * @param event - Physical or synthetic input.
 */
export function interpretHookEvent(event: PhysicalHookEvent): PhysicalHookAction {
  if (event.synthesized === true) return 'ignore'
  if (
    event.kind === 'key'
    && isComputerUseResumeAccelerator({
      control: event.control === true,
      shift: event.shift === true,
      key: event.key ?? '',
    })
  ) {
    return 'resume'
  }
  return 'pause'
}

/**
 * Attach a physical hook. Synthetic events stay ignored.
 * @param onAction - Pause or resume-all.
 * @param subscribe - Injected hook (tests / Electron / uiohook later).
 */
export function attachComputerUseHook(
  onAction: (action: Exclude<PhysicalHookAction, 'ignore'>) => void,
  subscribe: (listener: (event: PhysicalHookEvent) => void) => () => void,
): () => void {
  return subscribe((event) => {
    const action = interpretHookEvent(event)
    if (action !== 'ignore') onAction(action)
  })
}
