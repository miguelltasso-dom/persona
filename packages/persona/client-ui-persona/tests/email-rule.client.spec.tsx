// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EmailRuleForm } from '../src/client/email-rule/EmailRuleForm.tsx'
import { pt } from '../src/client/locale/email-rule/locales.ts'

afterEach(() => { cleanup() })

const presets = [{ id: 'locaweb', label: 'Locaweb', host: 'email-ssl.com.br', port: 993, secure: true }]
const filter = {
  to: ['vendas@loja.com.br'],
  from: [],
  subject: ['pedido'],
  skipBulk: true,
  preset: 'locaweb',
}

describe('harvest 19b: the inbox rule form', () => {
  it('shows the human phrase and saves the parsed rule', async () => {
    const onSave = vi.fn(async () => undefined)
    render(<EmailRuleForm dict={pt} presets={presets} filter={filter} onSave={onSave} variant="phrase" />)
    expect(screen.getByText(/Quando chegar e-mail em vendas@loja\.com\.br com assunto pedido/u)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: pt['edit'] }))
    fireEvent.change(screen.getByLabelText(pt['to.label']), {
      target: { value: 'vendas@loja.com.br, financeiro@loja.com.br' },
    })
    fireEvent.click(screen.getByRole('button', { name: pt['save'] }))
    await waitFor(() => { expect(onSave).toHaveBeenCalled() })
    expect(onSave).toHaveBeenCalledWith({
      to: ['vendas@loja.com.br', 'financeiro@loja.com.br'],
      from: [],
      subject: ['pedido'],
      skipBulk: true,
      preset: 'locaweb',
    })
    expect(await screen.findByText(pt['saved'])).toBeTruthy()
  })

  it('cancel throws away the edits and shows the saved phrase again', () => {
    const onSave = vi.fn(async () => undefined)
    render(<EmailRuleForm dict={pt} presets={presets} filter={filter} onSave={onSave} variant="phrase" />)
    fireEvent.click(screen.getByRole('button', { name: pt['edit'] }))
    fireEvent.change(screen.getByLabelText(pt['to.label']), { target: { value: 'outro@loja.com.br' } })
    fireEvent.click(screen.getByRole('button', { name: pt['cancel'] }))
    expect(screen.getByText(/Quando chegar e-mail em vendas@loja\.com\.br com assunto pedido/u)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: pt['edit'] }))
    expect((screen.getByLabelText(pt['to.label']) as HTMLInputElement).value).toBe('vendas@loja.com.br')
    expect(onSave).not.toHaveBeenCalled()
  })

  it('swallows Enter inside the rule so it never saves the routine around it', () => {
    const onSave = vi.fn(async () => undefined)
    render(<EmailRuleForm dict={pt} presets={presets} filter={filter} onSave={onSave} variant="phrase" />)
    fireEvent.click(screen.getByRole('button', { name: pt['edit'] }))
    expect(fireEvent.keyDown(screen.getByLabelText(pt['to.label']), { key: 'Enter' })).toBe(false)
    expect(fireEvent.keyDown(screen.getByLabelText(pt['preset.label']), { key: 'Enter' })).toBe(false)
    expect(fireEvent.keyDown(screen.getByRole('checkbox'), { key: 'Enter' })).toBe(true)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('says it could not save instead of pretending', async () => {
    const onSave = vi.fn(async () => { throw new Error('offline') })
    render(<EmailRuleForm dict={pt} presets={presets} filter={filter} onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: pt['save'] }))
    expect(await screen.findByText(pt['failed'])).toBeTruthy()
  })
})
