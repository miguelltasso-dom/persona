/**
 * The two-pane Aprovações inbox (REVIEW-APPROVALS-REDESIGN §2) is the DEFAULT screen since the Muse accepted it (IV-8/A-4b/A-4, 05/11 01:38,
 * D-077). The one reader of the client's flags decides (`../flags.ts`, FLAGS-ON-1): `localStorage['persona.approvalsInbox.v2']` '0' turns the old
 * screen back on (reload), '1' keeps the inbox; then `window.__PERSONA_FLAGS__`; then the default of the table (ON). Blocked storage = the default.
 */
import { readFlag } from '../flags.ts'

export const APPROVALS_INBOX_V2_KEY = 'persona.approvalsInbox.v2'

/** Whether the two-pane inbox shows. Never throws. */
export function approvalsInboxV2Enabled(): boolean {
  return readFlag('approvalsInboxV2')
}
