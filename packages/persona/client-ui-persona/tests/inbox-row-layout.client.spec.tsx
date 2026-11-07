// @vitest-environment jsdom
// Muse 07/11: na lista da Caixa de Aprovações o título ocupa a linha inteira (até 2 linhas, o nome inteiro no title e no nome acessível) e os chips vão
// para BAIXO dele, numa linha só ("+1" quando o chip extra não cabe, decidido por container query no CSS).
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ApprovalView } from '@deepseek-ai/dsh-persona-host/types'
import { ApprovalsInboxV2 } from '../src/client/approvals/ApprovalsInboxV2.tsx'
import type { ApprovalItem } from '../src/client/approvals/mock-data.ts'
import { approvalViewToItem } from '../src/client/data/adapters/approvals.ts'
import { pt as approvalsPt } from '../src/client/locale/approvals/locales.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'

installPreviewTheme()
afterEach(() => { cleanup(); localStorage.clear() })

const LONG = 'Liberar o Gmail para a Téo com um nome de pedido bem comprido que não cabe numa linha'
const view = (): ApprovalView => ({
  id: 'conn-1', kind: 'connector', title: LONG, question: 'q', status: 'pending', personaId: 'p-teo', personaName: 'Téo',
  connector: { reason: 'colleague', connectorName: 'Gmail', cli: 'claude', connectorId: 'gmail', access: 'read', requestedByPersonaId: 'p-bia', requestedByPersonaName: 'Bia', taskId: 't', taskTitle: 'Arte', options: ['once', 'always', 'not-now'] },
} as unknown as ApprovalView)
const item = (example: boolean): ApprovalItem => ({ ...approvalViewToItem(view()), decisionState: 'pending', ...(example ? { example: true } : {}) })

function row(example: boolean): HTMLElement {
  render(<PreviewFrame brandLabel="Persona"><ApprovalsInboxV2 dict={approvalsPt} items={[item(example)]} onDecideItem={() => undefined} /></PreviewFrame>)
  return document.querySelector<HTMLElement>('[role="option"]')!
}

describe('Aprovações: o contador do grupo (Cobalt/Keel 07/11)', () => {
  const group = (): HTMLElement => document.querySelector<HTMLElement>('[role="group"]')!
  it('conta só as linhas ABERTAS e REAIS: as amostras "Exemplo" não entram (bate com o selo do trilho)', () => {
    render(<PreviewFrame brandLabel="Persona"><ApprovalsInboxV2 dict={approvalsPt} items={[item(false), { ...item(true), id: 'ex-1' }, { ...item(true), id: 'ex-2' }]} onDecideItem={() => undefined} /></PreviewFrame>)
    expect(group().getAttribute('aria-label')).toMatch(/, 1$/u)
    expect(group().querySelector('[class*="groupCount"]')?.textContent).toBe('1')
    expect(group().querySelectorAll('[role="option"]')).toHaveLength(3)
  })
  it('uma decisão já tomada (saindo da lista) também não conta', () => {
    render(<PreviewFrame brandLabel="Persona"><ApprovalsInboxV2 dict={approvalsPt} items={[item(false), { ...item(false), id: 'done-1', decisionState: 'accepted' }]} onDecideItem={() => undefined} /></PreviewFrame>)
    expect(group().querySelector('[class*="groupCount"]')?.textContent).toBe('1')
  })
})

describe('Aprovações: linha da lista', () => {
  it('o título leva o nome inteiro no title e os chips vêm DEPOIS dele (segunda linha), antes da linha de quem pediu', () => {
    const r = row(false)
    const title = r.querySelector<HTMLElement>('[class*="rowTitle"]')!
    expect(title.getAttribute('title')).toBe(title.textContent)
    expect(title.textContent).not.toBe('')
    const chips = r.querySelector<HTMLElement>('[class*="rowChips"]')!
    expect(chips.textContent).toContain('Permissão')
    expect(title.compareDocumentPosition(chips) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const meta = r.querySelector<HTMLElement>('[class*="rowMeta"]')!
    expect(chips.compareDocumentPosition(meta) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('cartão de exemplo: o chip "Exemplo" e o "+1" de reserva ficam na MESMA linha de chips', () => {
    const r = row(true)
    const chips = r.querySelector<HTMLElement>('[class*="rowChips"]')!
    expect(chips.textContent).toContain('Exemplo')
    expect(chips.textContent).toContain('+1')
    expect(chips.querySelector('[class*="chipMore"]')?.getAttribute('title')).toBe('Exemplo')
  })
})
