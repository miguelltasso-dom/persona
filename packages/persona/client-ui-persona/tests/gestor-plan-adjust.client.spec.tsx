// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { GestorPlanAdjustModal } from '../src/client/chat/GestorPlanAdjustModal.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
afterEach(() => { cleanup() })

describe('GestorPlanAdjustModal', () => {
  it('submits trimmed feedback and closes', () => {
    const onSubmit = vi.fn()
    const onClose = vi.fn()
    render(
      <GestorPlanAdjustModal
        t={key => chatPt[key as keyof typeof chatPt] ?? key}
        open
        gestorName="Atlas"
        onClose={onClose}
        onSubmit={onSubmit}
      />,
    )
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  Só 2 personas  ' } })
    fireEvent.click(screen.getByRole('button', { name: /Enviar ajuste/u }))
    expect(onSubmit).toHaveBeenCalledWith('Só 2 personas')
    expect(onClose).toHaveBeenCalled()
  })
})
