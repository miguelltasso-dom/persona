/**
 * Keel 12/11: the host now sends `TaskView.blockedReason` (why a stopped card stopped); the card maps it to the Muse line under the title. It is the host's plain sentence, trimmed; empty or blank = no field
 * (the card then says only "Parado"). RED first: the mapper dropped it.
 */
import { describe, expect, it } from 'vitest'
import { mapTaskToKanbanCard } from '../src/client/remote/map-host-ui.ts'

const task = (extra: Record<string, unknown>): never => ({ id: 'tk-1', projectId: 'p', title: 'Pagar o fornecedor', stage: 'blocked', stageAction: 'blocked', ...extra }) as never

describe('o motivo do cartão parado vem do host', () => {
  it('leva o motivo (aparado) para o cartão', () => {
    expect(mapTaskToKanbanCard(task({ blockedReason: '  Falta o login do Mercado Pago ' }))).toMatchObject({ column: 'blocked', blockedReason: 'Falta o login do Mercado Pago' })
  })

  it('motivo vazio, em branco ou ausente: o campo some (o cartão diz só "Parado")', () => {
    for (const blockedReason of ['', '   ', undefined]) {
      expect(mapTaskToKanbanCard(task({ blockedReason })), String(blockedReason)).not.toHaveProperty('blockedReason')
    }
    expect(mapTaskToKanbanCard(task({}))).not.toHaveProperty('blockedReason')
  })

  it('um cartão que não está em Bloqueado não leva motivo, mesmo que o host o mande', () => {
    expect(mapTaskToKanbanCard(task({ stage: 'doing', stageAction: '', blockedReason: 'Falta o login do Mercado Pago' }))).not.toHaveProperty('blockedReason')
  })
})
