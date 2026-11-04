// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkflowEditorModal } from '../src/client/kanban/WorkflowEditorModal.tsx'
import { pt } from '../src/client/locale/kanban/locales.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()

afterEach(() => {
  cleanup()
})

describe('WorkflowEditorModal (BOARDS-SPEC §5)', () => {
  it('blocks save when done column is removed', () => {
    render(
      <PreviewFrame brandLabel="Persona">
        <WorkflowEditorModal
          dict={pt}
          flowModel="software"
          columns={[
            { id: 'a', name: 'Backlog', category: 'todo' },
            { id: 'b', name: 'Done', category: 'done' },
          ]}
          ticketCountByColumn={{}}
          fields={[]}
          onClose={() => {}}
          onSave={() => {}}
        />
      </PreviewFrame>,
    )
    const removeButtons = screen.getAllByRole('button', { name: pt['editor.removeColumn'] })
    fireEvent.click(removeButtons[removeButtons.length - 1]!)
    expect(screen.getByRole('status').textContent).toContain(pt['editor.validation.done'])
    expect(screen.getByRole('button', { name: pt['editor.save'] }).hasAttribute('disabled')).toBe(true)
  })

  it('calls onSave with columns when valid', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <PreviewFrame brandLabel="Persona">
        <WorkflowEditorModal
          dict={pt}
          flowModel="software"
          columns={[
            { id: 'a', name: 'Backlog', category: 'todo' },
            { id: 'b', name: 'Done', category: 'done' },
          ]}
          ticketCountByColumn={{}}
          fields={[]}
          onClose={() => {}}
          onSave={onSave}
        />
      </PreviewFrame>,
    )
    fireEvent.click(screen.getByRole('button', { name: pt['editor.save'] }))
    await vi.waitFor(() => { expect(onSave).toHaveBeenCalled() })
    expect(onSave.mock.calls[0]?.[0]).toHaveLength(2)
    expect(onSave.mock.calls[0]?.[2]).toEqual([])
  })

  it('exposes drag handle and extra field editor', () => {
    render(
      <PreviewFrame brandLabel="Persona">
        <WorkflowEditorModal
          dict={pt}
          flowModel="contratacao"
          columns={[
            { id: 'a', name: 'Backlog', category: 'todo' },
            { id: 'b', name: 'Done', category: 'done' },
          ]}
          ticketCountByColumn={{}}
          fields={[{ id: 'f1', name: 'Cargo', kind: 'text' }]}
          onClose={() => {}}
          onSave={() => {}}
        />
      </PreviewFrame>,
    )
    expect(screen.getAllByRole('button', { name: pt['editor.dragColumn'] }).length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: pt['editor.fields'] })).toBeTruthy()
    expect(screen.getByDisplayValue('Cargo')).toBeTruthy()
  })
})
