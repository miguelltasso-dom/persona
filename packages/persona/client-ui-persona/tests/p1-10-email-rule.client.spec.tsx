// @vitest-environment jsdom
// P1-10 (Carbon, colheita-s1), regra de e-mail: o campo "Para o endereço" é o DESTINATÁRIO (`filter.to`) e "De quem" é o REMETENTE (`filter.from`).
// No commit do snapshot 1 o primeiro rótulo era "Receber de" (remetente!) para o campo do destinatário, e o leigo cadastrava o e-mail do cliente
// no campo errado. Hoje o texto está certo (Muse, formulário em dois blocos); este teste trava o MAPA rótulo → campo da regra salva.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EmailRuleForm } from '../src/client/email-rule/EmailRuleForm.tsx'
import { pt } from '../src/client/locale/email-rule/locales.ts'

afterEach(() => { cleanup() })

const presets = [{ id: 'locaweb', label: 'Locaweb', host: 'email-ssl.com.br', port: 993, secure: true }]
const empty = { to: [], from: [], subject: [], skipBulk: true, preset: 'locaweb' }

describe('o rótulo diz o campo que a regra de fato filtra', () => {
  it('"Para o endereço" grava `to` (destinatário) e "De quem" grava `from` (remetente): nunca trocados', async () => {
    const onSave = vi.fn(() => Promise.resolve())
    render(<EmailRuleForm dict={pt} presets={presets} filter={empty} onSave={onSave} />)
    fireEvent.change(screen.getByLabelText('Para o endereço'), { target: { value: 'vendas@padarialua.com.br' } })
    fireEvent.change(screen.getByLabelText('De quem'), { target: { value: 'cliente@parceiro.com.br' } })
    fireEvent.click(screen.getByRole('button', { name: pt.save }))
    await waitFor(() => { expect(onSave).toHaveBeenCalledTimes(1) })
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ to: ['vendas@padarialua.com.br'], from: ['cliente@parceiro.com.br'] }))
  })

  it('o texto nunca chama o destinatário de "Receber de" e o rótulo em inglês também separa os dois', () => {
    render(<EmailRuleForm dict={pt} presets={presets} filter={empty} onSave={vi.fn(() => Promise.resolve())} />)
    expect(document.body.textContent).not.toContain('Receber de')
    expect(pt['to.label']).toBe('Para o endereço')
    expect(pt['from.label']).toBe('De quem')
  })
})
