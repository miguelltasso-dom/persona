/**
 * A Cofre card with "before → after", for the real shell — CAPTURES ONLY (D-074). The host does not yet send
 * `changeField`/`changeBefore`/`changeAfter`, so the design review has nothing real to look at. Opt-in, dev seed only:
 * `localStorage['persona.devSeed.approvalSample'] = '1'` (and the dev seed flag). Without it nothing here runs. The card
 * says "Exemplo", never reaches the host (the inbox ignores its buttons) and is never in the batch.
 */

import type { ApprovalItem } from './mock-data.ts'
import { readClientDevSeedEnabled } from '../remote/persona-dev-seed.ts'

const KEY = 'persona.devSeed.approvalSample'

/** Whether the sample card is on: the dev seed AND its own flag. */
export function approvalsDevSampleEnabled(): boolean {
  if (!readClientDevSeedEnabled()) return false
  try {
    return globalThis.localStorage?.getItem(KEY) === '1'
  } catch (error: unknown) {
    // Storage blocked: no sample, the real cards show alone.
    void error
    return false
  }
}

export const APPROVALS_DEV_SAMPLE: readonly ApprovalItem[] = [
  {
    id: 'dev-approval-sample-vault',
    kind: 'vault',
    title: 'preco-do-pao',
    question: 'Atualizar registro no Cofre?',
    primaryKey: 'action.primary.vault',
    proposerName: 'Nina',
    proposerPersonaId: 'nina',
    vaultField: 'Preço do pão',
    vaultBefore: 'R$ 12',
    vaultAfter: 'R$ 14',
    // `normal` keeps it out of the batch even if the guard below were removed.
    risk: 'normal',
    example: true,
    decisionState: 'pending',
  },
]
