// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { pt as kanbanPt } from '../src/client/locale/kanban/locales.ts'
import { ProjectWorkspaceTabs } from '../src/client/shell/ProjectWorkspaceTabs.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()

describe('ProjectWorkspaceTabs (PB-5)', () => {
  it('keeps board selected and delegates other tabs to shell navigation', () => {
    const onChange = vi.fn()
    render(
      <ProjectWorkspaceTabs dict={kanbanPt} value="board" onChange={onChange} />,
    )
    fireEvent.click(screen.getByRole('tab', { name: kanbanPt['project.tabs.conversation'] }))
    expect(onChange).toHaveBeenCalledWith('conversation')
  })
})
