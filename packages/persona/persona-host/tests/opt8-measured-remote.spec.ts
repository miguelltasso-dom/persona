/** D-068 additive Remote evidence; real host in memory, no model or application launch. */
import { expect } from 'vitest'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile('2026-11-04T12:00:00.000Z')

it('retains the legacy OPT-8 score fields and exposes estimate origin, comparable baseline and labelled projection', () => {
  const h = host()
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.sessionMemberId = 'ana'
  const result = h.measureOpt8({ workspaceId: 'ws' })
  expect(result.total).toBe(4)
  expect(result.passed).toBe(1)
  expect(result.failed).toEqual([])
  expect(result.blocked).toEqual(['cache-60', 'pair-parity', 'cut-40'])
  expect(result.liveEntries).toBe(0)
  expect(result.liveOrigin).toBe('estimate')
  expect(result.origin).toBe('estimate')
  expect(result.baseline).toBe('levers-before-wiring')
  const evidence = result.evidence
  expect(evidence).toBeDefined()
  if (evidence === undefined) throw new Error('current host omitted OPT-8 evidence')
  expect(evidence.origin).toBe(result.origin)
  expect(evidence.baseline).toBe(result.baseline)
  expect(evidence.historical).toEqual({ id: 'historical-134-fixture', countsForGoal: false })
  expect(evidence.projectionAll.label).toBe('projection')
  expect(evidence.providerCache).toEqual({ prefixHit: 0, status: 'blocked', origin: 'unavailable' })
  expect(evidence.cut40.status).toBe('blocked')
  expect(evidence.parity.status).toBe('blocked')
  expect(h.ledger.list()).toEqual([])
})

it('carries the same estimate evidence through v1-close without dropping existing front scores', () => {
  const h = host()
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.sessionMemberId = 'ana'
  const result = h.measureV1Close({ workspaceId: 'ws' })
  expect(result.passed).toBe(true)
  expect(result.proactivity).toMatchObject({ passed: 6, total: 6, failed: [] })
  expect(result.gestor).toMatchObject({ passed: 3, total: 3, failed: [] })
  expect(result.origin).toBe('estimate')
  expect(result.baseline).toBe('levers-before-wiring')
  expect(result.opt8.origin).toBe(result.origin)
  expect(result.opt8.baseline).toBe(result.baseline)
  const evidence = result.opt8.evidence
  expect(evidence).toBeDefined()
  if (evidence === undefined) throw new Error('current host omitted v1-close OPT-8 evidence')
  expect(evidence.cut40.status).toBe('blocked')
  expect(result.opt8.passed).toBe(1)
  expect(result.opt8.blocked).toEqual(['cache-60', 'pair-parity', 'cut-40'])
  expect(result.opt8.liveEntries).toBe(0)
  expect(h.ledger.list()).toEqual([])
  expect(JSON.parse(JSON.stringify(result))).toEqual(result)
})
