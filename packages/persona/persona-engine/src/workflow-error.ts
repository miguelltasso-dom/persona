/** Structured refusal for a workflow move/edit the host maps to Remote. */
export type WorkflowFail = 'unknown_column' | 'missing_destination' | 'no_category_column'

/** Host maps `code` to a Remote error; `columnId` names the column when known. */
export class WorkflowError extends Error {
  /**
   * @param code - Stable refusal code.
   * @param columnId - Column that caused the refusal, when known.
   */
  constructor(
    readonly code: WorkflowFail,
    readonly columnId?: string,
  ) {
    super(code)
  }
}
