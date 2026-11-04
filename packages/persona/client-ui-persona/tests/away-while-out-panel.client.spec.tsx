// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { pt } from '../src/client/locale/shell/locales.ts'
import { AwayWhileOutPanel } from '../src/client/overview/AwayWhileOutPanel.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { shellTranslate } from '../src/client/preview/shell-translate.ts'

installPreviewTheme()
afterEach(cleanup)

describe('AwayWhileOutPanel (PRO-4)', () => {
  it('opens the linked task on the board', () => {
    sessionStorage.clear()
    const onOpenTask = vi.fn()
    render(
      <AwayWhileOutPanel
        t={shellTranslate}
        onOpenTask={onOpenTask}
        events={[{ id: 'e1', body: 'Bento entregou.', taskLabel: 'Landing page', taskId: 'ticket-1' }]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: pt['overview.awayOpenTask'].replace('{task}', 'Landing page') }))
    expect(onOpenTask).toHaveBeenCalledWith('ticket-1')
  })
})
