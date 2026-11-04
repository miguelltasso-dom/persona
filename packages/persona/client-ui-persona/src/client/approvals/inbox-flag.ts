/**
 * The two-pane Aprovações inbox (REVIEW-APPROVALS-REDESIGN §2) is a large change to a screen people already use, so it
 * ships behind a flag until the Muse accepts it (D-077). Off: the current screen. On: `ApprovalsInboxV2`.
 * Turn it on in a browser console with `localStorage.setItem('persona.approvalsInbox.v2', '1')`, then reload.
 */

export const APPROVALS_INBOX_V2_KEY = 'persona.approvalsInbox.v2'

/** Whether the two-pane inbox is on. Storage can be blocked (private window, preview): then it is off. */
export function approvalsInboxV2Enabled(): boolean {
  try {
    return globalThis.localStorage?.getItem(APPROVALS_INBOX_V2_KEY) === '1'
  } catch (error: unknown) {
    // Storage blocked or unavailable: the flag is simply off, the current screen shows.
    void error
    return false
  }
}
