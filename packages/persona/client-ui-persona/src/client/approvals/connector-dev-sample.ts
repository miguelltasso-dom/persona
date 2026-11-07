/**
 * Two "Liberar para {B}" cards for the real shell — CAPTURES ONLY (D-074). Until the host sends `kind: 'connector'` there is nothing real to
 * photograph. Opt-in with the TWO dev keys: `localStorage['persona.devSeed.v1'] = '1'` (the dev seed) and
 * `localStorage['persona.devSeed.connector'] = '1'`. Without both, nothing here runs. The cards say "Exemplo", never reach the host (the
 * panel ignores their buttons) and are never in the batch.
 */

import { readClientDevSeedEnabled } from '../remote/persona-dev-seed.ts'
import type { ActionPreviewUi } from '../remote/map-host-ui.ts'
import type { ApprovalItem } from './mock-data.ts'

const KEY = 'persona.devSeed.connector'

export function connectorDevSampleEnabled(): boolean {
  if (!readClientDevSeedEnabled()) return false
  try {
    return globalThis.localStorage?.getItem(KEY) === '1'
  } catch (error: unknown) {
    // Storage blocked: no sample, the real cards show alone.
    void error
    return false
  }
}

const ACTION_BASE = { items: [], count: 0, blind: false, requestedByPerson: false, status: 'pending' } as const

const EMAIL_PREVIEW: ActionPreviewUi = {
  ...ACTION_BASE,
  approvalId: 'dev-action-email',
  actionClass: 'send',
  verb: 'email',
  connectorName: 'Gmail',
  personaId: 'nina',
  personaName: 'Nina',
  characterId: 'nina',
  requestedByPerson: true,
  to: 'ana@padarialua.com.br',
  subject: 'Encomenda de sexta',
  body: 'Oi, Ana! Confirmo os 3 bolos de cenoura para sexta, com retirada às 9h.\nSe precisar mudar o horário, é só me avisar por aqui.\nUm abraço, Nina.',
}

const PAYMENT_PREVIEW: ActionPreviewUi = {
  ...ACTION_BASE,
  approvalId: 'dev-action-pay',
  actionClass: 'pay',
  verb: 'pay',
  connectorName: 'Mercado Pago',
  personaId: 'bento',
  personaName: 'Bento',
  characterId: 'bento',
  amount: 'R$ 120,00',
  payee: 'Gráfica Boa Impressão',
  reference: 'Folhetos de novembro',
}

/** The colleague case (all three choices) and the initiative case (the host offers no "sempre": the card never invents it). */
export const CONNECTOR_DEV_SAMPLE: readonly ApprovalItem[] = [
  // HT-9 / D-095: the two external actions waiting for a decision (the same card the thread shows).
  {
    id: 'dev-action-email',
    kind: 'action',
    title: 'Enviar um email pelo Gmail',
    question: '',
    primaryKey: 'action.primary.attention',
    proposerName: 'Nina',
    proposerPersonaId: 'nina',
    example: true,
    risk: 'normal',
    decisionState: 'pending',
    actionPreview: EMAIL_PREVIEW,
  },
  {
    id: 'dev-action-pay',
    kind: 'action',
    title: 'Pagar R$ 120,00 pelo Mercado Pago',
    question: '',
    primaryKey: 'action.primary.attention',
    proposerName: 'Bento',
    proposerPersonaId: 'bento',
    example: true,
    risk: 'normal',
    decisionState: 'pending',
    actionPreview: PAYMENT_PREVIEW,
  },
  {
    id: 'dev-connector-colleague',
    kind: 'connector',
    title: 'Liberar o Gmail para Bento',
    question: '',
    primaryKey: 'action.primary.connector',
    proposerName: 'Bento',
    proposerPersonaId: 'bento',
    example: true,
    risk: 'normal',
    decisionState: 'pending',
    connector: {
      reason: 'colleague',
      connectorName: 'Gmail',
      access: 'read',
      requestedByName: 'Nina',
      taskTitle: 'Responder o orçamento da gráfica',
      options: ['once', 'always', 'not-now'],
    },
  },
  {
    id: 'dev-connector-initiative',
    kind: 'connector',
    title: 'Liberar o Drive para Luna',
    question: '',
    primaryKey: 'action.primary.connector',
    proposerName: 'Luna',
    proposerPersonaId: 'luna',
    example: true,
    risk: 'normal',
    decisionState: 'pending',
    connector: {
      reason: 'initiative',
      connectorName: 'Drive',
      access: 'read',
      purpose: 'organizar as notas da semana na pasta Clientes',
      options: ['once', 'not-now'],
    },
  },
]
