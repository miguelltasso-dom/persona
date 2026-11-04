// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CloseSprintModal } from '../src/client/kanban/CloseSprintModal.tsx'
import { pt } from '../src/client/locale/kanban/locales.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()

afterEach(() => {
  cleanup()
})

describe('CloseSprintModal (BOARDS-SPEC §4)', () => {
  it('shows sprint-concluida art and accessible stats', () => {
    render(
      <PreviewFrame brandLabel="Persona">
        <CloseSprintModal
          dict={pt}
          sprintName="Sprint 3"
          delivered={4}
          late={1}
          rolled={2}
          onClose={() => {}}
          onConfirm={() => {}}
        />
      </PreviewFrame>,
    )
    expect(screen.getByRole('heading', { name: pt['closeSprint.title'].replace('{name}', 'Sprint 3') })).toBeTruthy()
    expect(screen.getByText('4')).toBeTruthy()
    expect(document.querySelector('img[src*="sprint-concluida"]')).toBeTruthy()
  })

  it('calls onConfirm with the default leftover when confirmed', () => {
    const onConfirm = vi.fn()
    render(
      <PreviewFrame brandLabel="Persona">
        <CloseSprintModal
          dict={pt}
          sprintName="Sprint 3"
          delivered={1}
          late={0}
          rolled={1}
          onClose={() => {}}
          onConfirm={onConfirm}
        />
      </PreviewFrame>,
    )
    fireEvent.click(screen.getByRole('button', { name: pt['closeSprint.confirm'] }))
    expect(onConfirm).toHaveBeenCalledWith('next')
  })
})
