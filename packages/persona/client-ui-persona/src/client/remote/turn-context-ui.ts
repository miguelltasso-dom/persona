/** C5b — "Contexto usado" drawer data (host {@link TurnContextView} projection). */

export interface TurnContextRecordUi {
  readonly id: string
  readonly kind: string
  readonly body: string
  readonly required: boolean
  readonly restricted: boolean
  readonly title?: string | undefined
  readonly locator?: string | undefined
}

export interface TurnContextUi {
  readonly ticketId: string
  readonly title: string
  readonly triggerIds: readonly string[]
  readonly records: readonly TurnContextRecordUi[]
}
