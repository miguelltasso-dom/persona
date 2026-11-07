// @vitest-environment jsdom
// Muse (D-089 a): the card of a task that needs the person is titled by the TASK's name, with the question under it —
// never "Precisa de você" repeating the section, never the task name as the body; and the verb is "Revisar" everywhere.
import { cleanup, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ApprovalsInboxV2 } from '../src/client/approvals/ApprovalsInboxV2.tsx'
import { approvalTitle, reactiveApprovalContext } from '../src/client/approvals/approvals-ui-helpers.ts'
import { ApprovalsInbox } from '../src/client/approvals/ApprovalsInbox.tsx'
import type { ApprovalItem } from '../src/client/approvals/mock-data.ts'
import { approvalViewToItem } from '../src/client/data/adapters/approvals.ts'
import { pt } from '../src/client/locale/approvals/locales.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()

afterEach(() => { cleanup() })

const TASK: ApprovalItem = { id: 'att-1', kind: 'attention', title: 'Primeira entrega', question: 'Primeira entrega', primaryKey: 'action.primary.attention' }

describe('Aprovações: título = nome da tarefa, a pergunta embaixo', () => {
  it('the title of a task that needs the person is its name', () => {
    expect(approvalTitle(pt, TASK)).toBe('Primeira entrega')
  })

  it('when the host only repeats the name as the question, the question is asked in words', () => {
    expect(reactiveApprovalContext(pt, TASK)).toBe('Esta tarefa está esperando uma decisão sua.')
    // a real question from the host is kept as it came
    expect(reactiveApprovalContext(pt, { ...TASK, question: 'Posso enviar o contrato para a Maria?' })).toBe('Posso enviar o contrato para a Maria?')
  })

  it('the card (old list) wears the task name as its heading and the question under it', () => {
    render(
      <PreviewFrame brandLabel="Persona">
        <ApprovalsInbox dict={pt} items={[TASK]} />
      </PreviewFrame>,
    )
    expect(screen.getByRole('heading', { level: 3, name: 'Primeira entrega' })).toBeTruthy()
    expect(screen.getByText('Esta tarefa está esperando uma decisão sua.')).toBeTruthy()
    // "Precisa de você" is the section, not the card's title
    expect(screen.queryByRole('heading', { level: 3, name: 'Precisa de você' })).toBeNull()
  })

  it('the V2 inbox says the same: the task name, the question in words, and "Revisar"', () => {
    const item = approvalViewToItem({ id: 'att-2', kind: 'attention', title: 'Primeira entrega', question: 'Primeira entrega', status: 'pending', personaId: 'bento', personaName: 'Bento' })
    render(
      <PreviewFrame brandLabel="Persona">
        <ApprovalsInboxV2 dict={pt} items={[item]} proactiveSummaries={[]} onDecideItem={() => undefined} />
      </PreviewFrame>,
    )
    expect(screen.getAllByText('Primeira entrega').length).toBeGreaterThan(0)
    expect(screen.getByText('Esta tarefa está esperando uma decisão sua.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Revisar' })).toBeTruthy()
    expect(screen.queryByText('Precisa de você', { selector: 'h2,h3,[class*="rowTitle"]' })).toBeNull()
  })

  it('the verb is "Revisar" in the copy (pt and en), the same as on Visão geral', () => {
    const dir = join(__dirname, '..', 'locale-sources')
    const ptJson = JSON.parse(readFileSync(join(dir, 'approvals.pt.json'), 'utf8')) as Record<string, string>
    const enJson = JSON.parse(readFileSync(join(dir, 'approvals.en.json'), 'utf8')) as Record<string, string>
    expect(ptJson['action.primary.attention']).toBe('Revisar')
    expect(enJson['action.primary.attention']).toBe('Review')
  })
})
