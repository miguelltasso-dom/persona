import type { UsedContextRecord } from '@deepseek-ai/dsh-persona-host/types'
import type { TurnContextRecordUi } from './turn-context-ui.ts'

/** Project host {@link UsedContextRecord} for the Contexto usado drawer. */
export function mapUsedContextRecord(row: UsedContextRecord): TurnContextRecordUi {
  return {
    id: row.id,
    kind: row.kind,
    body: row.body,
    required: row.required,
    restricted: row.restricted,
    ...(row.title === undefined || row.title === '' ? {} : { title: row.title }),
    ...(row.locator === undefined || row.locator === '' ? {} : { locator: row.locator }),
  }
}
