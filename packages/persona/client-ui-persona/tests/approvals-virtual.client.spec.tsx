// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ApprovalsInbox } from '../src/client/approvals/ApprovalsInbox.tsx'
import type { ApprovalItem } from '../src/client/approvals/mock-data.ts'
import { pt as dict } from '../src/client/locale/approvals/locales.ts'

afterEach(() => { cleanup() })

function manyApprovals(count: number): ApprovalItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `ap-${index}`,
    kind: 'attention' as const,
    title: `Pedido ${index}`,
    question: `Posso executar o pedido ${index}?`,
    primaryKey: 'action.approve' as const,
    proposerPersonaId: 'atlas',
  }))
}

describe('ApprovalsInbox virtualization', () => {
  it('windows a large reactive inbox', () => {
    const items = manyApprovals(48)
    const { container } = render(
      <div style={{ height: 420, overflow: 'hidden' }}>
        <ApprovalsInbox dict={dict} items={items} initialState="ready" />
      </div>,
    )
    const cards = container.querySelectorAll('.question, [class*="question"]').length
    expect(cards).toBeLessThan(items.length)
    expect(cards).toBeGreaterThan(2)
  })
})
