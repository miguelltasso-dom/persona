/**
 * Public webhook the Cloudflare Worker accepts and forwards to the owner desktop.
 * The Worker does not interpret the payload beyond routing.
 */

import type { WebhookEnvelope } from './types.ts'

/**
 * Build the envelope the Worker stores on the workspace Durable Object.
 * @param input - Delivery id (provider unique), owner device, raw payload.
 */
export function webhookEnvelope(input: {
  source: 'github'
  deliveryId: string
  receivedAt: string
  ownerDeviceId: string
  payload: unknown
}): WebhookEnvelope {
  return {
    source: input.source,
    deliveryId: input.deliveryId,
    receivedAt: input.receivedAt,
    ownerDeviceId: input.ownerDeviceId,
    payload: input.payload,
  }
}

/**
 * Same delivery id is the same webhook. The desktop Source decides Trigger ids.
 * @param a - First envelope.
 * @param b - Second envelope.
 */
export function sameWebhookDelivery(a: WebhookEnvelope, b: WebhookEnvelope): boolean {
  return a.source === b.source && a.deliveryId === b.deliveryId
}
