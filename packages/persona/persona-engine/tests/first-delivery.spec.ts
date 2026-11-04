import { expect, it } from 'vitest'
import { measureFirstDeliveryAcceptance } from '../src/first-delivery-accept.ts'

it('V1-P0-1: Agência ask wantsWork and accept reaches working/running', () => {
  const scored = measureFirstDeliveryAcceptance()
  expect(scored).toEqual({ passed: 4, total: 4, failed: [] })
})
