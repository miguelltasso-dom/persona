import { expect, it } from 'vitest'
import {
  assignPersonaCharge,
  defaultSectorPolicy,
  routeApproval,
  type AttentionBudget,
  type GovernanceSnapshot,
} from '../src/index.ts'

const AT = '2026-11-03T12:00:00.000Z'

function snap(): GovernanceSnapshot {
  return {
    workspaceId: 'ws',
    humans: [{ id: 'ana', name: 'Ana' }, { id: 'bia', name: 'Bia' }],
    personas: [
      { id: 'coord', title: 'Coordenação', systemRoles: ['coordination'] },
      { id: 'ops', title: 'Operações', systemRoles: [] },
    ],
    sectors: [{ id: 'ops', workspaceId: 'ws', name: 'Operações', policy: defaultSectorPolicy() }],
    charges: [
      assignPersonaCharge({ personaId: 'ops', responsibleHumanId: 'ana', substituteHumanId: 'bia', sectorId: 'ops' }),
    ],
    away: [{ humanId: 'ana', kind: 'away', from: AT, until: '2026-11-06T00:00:00.000Z' }],
    routines: [],
  }
}

const open: AttentionBudget = {
  proposalsPerDay: 4, proposedToday: 0, silenceUntil: 0, tokensLeft: 10, runsLeft: 4, acceptanceRate: 1,
}

it('delivers the approval to the substituto when the responsável is away', () => {
  const delivery = routeApproval({ snapshot: snap(), personaId: 'ops', at: AT, budget: open })
  expect(delivery.kind).toBe('deliver')
  if (delivery.kind !== 'deliver') return
  expect(delivery.route).toMatchObject({ kind: 'human', role: 'substitute', humanId: 'bia', onBehalfOf: 'ana' })
  expect(delivery.audit.onBehalfOf).toBe('ana')
})

it('waits with a notice when there is no substituto', () => {
  const lonely: GovernanceSnapshot = {
    ...snap(),
    charges: [assignPersonaCharge({ personaId: 'ops', responsibleHumanId: 'ana' })],
  }
  const delivery = routeApproval({ snapshot: lonely, personaId: 'ops', at: AT })
  expect(delivery.kind).toBe('wait')
  if (delivery.kind !== 'wait') return
  expect(delivery.route.notice.length).toBeGreaterThan(0)
  expect(delivery.audit.action).toBe('waited')
})

it('required sector approval still delivers inside a silence window', () => {
  const quiet: AttentionBudget = { ...open, silenceUntil: Date.parse(AT) + 60_000 }
  const delivery = routeApproval({
    snapshot: snap(), personaId: 'ops', at: AT, required: true, budget: quiet, kind: 'payment',
  })
  expect(delivery.kind).toBe('deliver')
})

it('proposal-style approval waits in silence; notice is never empty', () => {
  const quiet: AttentionBudget = { ...open, silenceUntil: Date.parse(AT) + 60_000 }
  const delivery = routeApproval({ snapshot: snap(), personaId: 'ops', at: AT, budget: quiet })
  expect(delivery.kind).toBe('wait')
  if (delivery.kind !== 'wait') return
  expect(delivery.route.notice).toMatch(/espera/)
})
