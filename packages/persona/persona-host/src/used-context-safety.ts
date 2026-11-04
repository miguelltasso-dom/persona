/** Sensitive derived context stays visible only as a restricted citation. */
import { containsSecretValue } from '@deepseek-ai/dsh-persona-core'
import type { UsedContextRecord } from './types.ts'

/**
 * Omit sensitive text before retaining context for prompts or human inspection.
 * @param rows - Derived Cofre, document and subject citations.
 * @returns Citations preserving identifiers and mandatory flags without sensitive text.
 */
export function safeUsedContext(rows: readonly UsedContextRecord[]): UsedContextRecord[] {
  return rows.map((row) => {
    const sensitive = [row.body, row.title ?? '', row.locator ?? ''].some(containsSecretValue)
    return !sensitive ? row : { ...row, body: '', restricted: true,
      ...(row.title === undefined ? {} : { title: '' }),
      ...(row.locator === undefined ? {} : { locator: '' }) }
  })
}
