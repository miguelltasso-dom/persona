/**
 * Structured refusal for a workflow move/edit the host maps to Remote.
 * `delivery_pending` (FLOW-1): a card whose result still waits for Aplicar/Descartar cannot be dragged to Concluído.
 */
export type WorkflowFail = 'unknown_column' | 'missing_destination' | 'no_category_column' | 'delivery_pending'

/** Host maps `code` to a Remote error; `columnId` names the column when known, `ticketId` the card for `delivery_pending`. */
export class WorkflowError extends Error {
  /**
   * @param code - Stable refusal code.
   * @param columnId - Column that caused the refusal, when known.
   * @param ticketId - Card that caused the refusal, when known.
   */
  constructor(
    readonly code: WorkflowFail,
    readonly columnId?: string,
    readonly ticketId?: string,
  ) {
    super(code)
  }
}
