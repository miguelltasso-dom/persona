import { expect, it } from 'vitest'
import { captureReplyTarget, replyUsesCapture } from '../../src/index.ts'

it('resposta com aba trocada: run e assunto capturados no envio, não na aba atual', () => {
  const capture = captureReplyTarget('run-9', 'ticket-a', 'chat:t1')
  const sent = replyUsesCapture(capture, { ticketId: 'ticket-b', threadKey: 'chat:other' })
  expect(sent).toEqual({ runId: 'run-9', ticketId: 'ticket-a', threadKey: 'chat:t1' })
})
