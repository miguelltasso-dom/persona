// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ContradictionCard, PageMeta, PermissionRow, RememberPermission, type PermissionValidity } from '../src/client/primitives/index.ts'

afterEach(() => { cleanup() })

const SCOPE = { persona: 'Sol', action: 'responder clientes no WhatsApp', target: 'só com modelos de resposta aprovados', limits: 'até 20 por dia' }

describe('RememberPermission (in the approval card)', () => {
  it('is opt-in; when on, spells the scope and asks for an explicit validity', () => {
    const Wrapper = () => {
      const [on, setOn] = useState(false)
      const [validity, setValidity] = useState<PermissionValidity>('once')
      return (
        <RememberPermission
          scope={SCOPE}
          remember={on}
          onRememberChange={setOn}
          validity={validity}
          onValidityChange={setValidity}
          labels={{ remember: 'Lembrar esta permissão', scopeLead: p => `Da próxima vez, ${p} não pergunta para:`, validity: 'Por quanto tempo', validities: { once: 'Só desta vez', week: '7 dias', 'until-revoked': 'Até eu revogar' }, guard: 'Qualquer coisa maior, outro alvo ou outra persona: ela pergunta de novo.' }}
        />
      )
    }
    render(<Wrapper />)
    const box = screen.getByRole('checkbox', { name: 'Lembrar esta permissão' }) as HTMLInputElement
    expect(box.checked).toBe(false)
    expect(screen.queryByText(/não pergunta para/u)).toBeNull()
    fireEvent.click(box)
    expect(screen.getByText('Da próxima vez, Sol não pergunta para:')).toBeTruthy()
    expect(screen.getByText('até 20 por dia')).toBeTruthy()
    expect((screen.getByRole('radio', { name: 'Só desta vez' }) as HTMLInputElement).checked).toBe(true)
    fireEvent.click(screen.getByRole('radio', { name: '7 dias' }))
    expect((screen.getByRole('radio', { name: '7 dias' }) as HTMLInputElement).checked).toBe(true)
  })
})

describe('PermissionRow', () => {
  it('revoke asks once inline, then calls through', () => {
    const revoke = vi.fn()
    render(<ul><PermissionRow scope={SCOPE} grantedBy="Concedida por você em 03/11" validityText="Até você revogar" usage="Usada 4 vezes" onRevoke={revoke} labels={{ revoke: 'Revogar', confirmRevoke: 'Revogar agora', cancel: 'Cancelar', revoked: 'Revogada' }} /></ul>)
    fireEvent.click(screen.getByRole('button', { name: 'Revogar' }))
    expect(revoke).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Revogar agora' }))
    expect(revoke).toHaveBeenCalledTimes(1)
  })
})

describe('ContradictionCard / PageMeta', () => {
  it('shows both versions with sources and lets the person pick', () => {
    const keep = vi.fn()
    const use = vi.fn()
    render(<ContradictionCard pageTitle="Entrega" current={{ text: 'Entrega até 20 km', source: 'você, 02/11' }} incoming={{ text: 'Entrega até 30 km', source: 'tarefa Proposta Padaria Lua' }} onKeepCurrent={keep} onUseIncoming={use} labels={{ title: p => `Contradição em ${p}`, current: 'Hoje', incoming: 'Novo', keep: 'Manter o de hoje', use: 'Usar o novo', edit: 'Juntar à mão' }} />)
    expect(screen.getByRole('heading', { name: 'Contradição em Entrega' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Usar o novo' }))
    expect(use).toHaveBeenCalled()
    expect(keep).not.toHaveBeenCalled()
  })

  it('page meta: properties, backlinks count, history and stale confirmation', () => {
    const confirm = vi.fn()
    render(<PageMeta properties={[{ label: 'Responsável', value: 'Sol' }]} backlinks={[{ id: 'b', title: 'Padaria Lua', type: 'Cliente', onOpen: () => undefined }]} history={[{ id: 'v1', who: 'Atlas', what: 'atualizou a partir da tarefa X', time: '14:20' }]} confirmation={{ text: 'Não confirmada há 90 dias', stale: true, onConfirm: confirm }} labels={{ properties: 'Propriedades', backlinks: 'Citada em', noBacklinks: 'Nenhuma página cita esta ainda.', history: 'Histórico', confirm: 'Confirmar agora', view: 'Ver' }} />)
    expect(screen.getByText('Responsável')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Padaria Lua' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar agora' }))
    expect(confirm).toHaveBeenCalled()
  })
})
