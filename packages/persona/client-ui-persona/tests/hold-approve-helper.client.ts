// COLHEITA 5: the tests approve the way a person does — by holding the button for the whole time, not by clicking it.
import { act, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { HOLD_APPROVE_MS } from '../src/client/chat/hold-approve.ts'

/**
 * Press a "Segure para …" button and keep it pressed for the whole hold, then let go. The timers are faked only while the press lasts, so
 * `waitFor` and the rest of the test keep running on real time.
 * @param button - The hold button.
 * @param heldMs - How long the press lasts (default: the full hold).
 */
export async function holdToApprove(button: HTMLElement, heldMs: number = HOLD_APPROVE_MS): Promise<void> {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  try {
    fireEvent.pointerDown(button, { pointerType: 'mouse', button: 0 })
    await act(async () => { vi.advanceTimersByTime(heldMs) })
    fireEvent.pointerUp(button, { pointerType: 'mouse', button: 0 })
  } finally {
    vi.useRealTimers()
  }
}
