/**
 * Forge import persist contract (dedupe + rollback) parameterized by ImportStore.
 */

import {
  applyImport,
  rollbackImport,
  type ImportPreview,
  type ImportStore,
} from '@deepseek-ai/dsh-persona-core'
import { expect, it } from 'vitest'

/**
 * Preview used by the persist suite. Adapter sniffing stays in persona-core.
 * @returns One accepted proposed message.
 */
export function samplePreview(): ImportPreview {
  return {
    adapterId: 'claude',
    accepted: [{
      kind: 'message',
      externalId: 'claude:c1',
      body: 'olá',
      privacy: 'private',
      status: 'proposed',
    }],
    rejected: [],
  }
}

/**
 * Same persist cases as Forge `import.spec.ts` ("dedupes on external id…").
 * @param label - Backend name.
 * @param open - Fresh store factory.
 */
export function defineImportStoreContract(label: string, open: () => ImportStore): void {
  it(`${label} dedupes on external id and rolls a batch back`, () => {
    const store = open()
    const preview = samplePreview()
    const first = applyImport(store, preview, 'b1')
    expect(first.applied).toHaveLength(1)
    expect(applyImport(store, preview, 'b2').applied).toHaveLength(0)
    expect(rollbackImport(store, 'b1').rolledBack).toBe(true)
    expect(applyImport(store, preview, 'b3').applied).toHaveLength(1)
  })
}
