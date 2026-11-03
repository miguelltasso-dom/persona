/** C5b — "Contexto usado" drawer data (host {@link TurnContextView} projection). */

export interface TurnContextUi {
  readonly ticketId: string
  readonly title: string
  readonly triggerIds: readonly string[]
}
