import { expect, it } from 'vitest'
import { assertHandoffAllowed } from '../../src/index.ts'
import type { HandoffObject } from '../../src/index.ts'

it('ciclo de handoffs: A→B→A é recusado', () => {
  const ab: HandoffObject = {
    id: 'h1', ticketId: 't1', objective: 'a', decisionIds: [], evidence: [],
    nextAction: 'go', fromPersonaId: 'a', toPersonaId: 'b', depth: 1,
  }
  const ba: HandoffObject = { ...ab, id: 'h2', fromPersonaId: 'b', toPersonaId: 'a', depth: 2 }
  expect(() => assertHandoffAllowed([ab], ba)).toThrow('ACCESS_ESCALATION')
})
