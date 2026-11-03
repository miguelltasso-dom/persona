/**
 * Narrow `node:sqlite` rows and run statements with typed bind values.
 */

import type { DatabaseSync, SQLOutputValue } from 'node:sqlite'
import { StoreError } from './errors.ts'

/** Bind values we pass to product/event statements. */
export type SqlValue = string | number | null

/**
 * @param db - Open connection.
 * @param sql - Statement text.
 * @param params - Bind values.
 */
export function run(db: DatabaseSync, sql: string, params: readonly SqlValue[] = []): void {
  try {
    db.prepare(sql).run(...params)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'constraint'
    if (message.includes('UNIQUE') || message.includes('unique')) throw new StoreError('conflict', message)
    if (message.includes('FOREIGN') || message.includes('CHECK') || message.includes('NOT NULL')) {
      throw new StoreError('constraint', message)
    }
    throw error
  }
}

/**
 * @param raw - JSON text from a column.
 * @returns The parsed value.
 */
export function jsonValue(raw: string): unknown {
  const value: unknown = JSON.parse(raw)
  return value
}

/**
 * @param row - One sqlite result row.
 * @param key - Column name.
 * @returns The string column.
 */
export function text(row: Record<string, SQLOutputValue>, key: string): string {
  const value = row[key]
  if (typeof value !== 'string') throw new StoreError('constraint', key)
  return value
}

/**
 * @param row - One sqlite result row.
 * @param key - Column name.
 * @returns The string column, or `undefined` when NULL.
 */
export function optionalText(row: Record<string, SQLOutputValue>, key: string): string | undefined {
  const value = row[key]
  if (value === null || value === undefined) return undefined
  if (typeof value !== 'string') throw new StoreError('constraint', key)
  return value
}

/**
 * @param row - One sqlite result row.
 * @param key - Column name.
 * @returns The integer column.
 */
export function integer(row: Record<string, SQLOutputValue>, key: string): number {
  const value = row[key]
  if (typeof value !== 'number' || !Number.isInteger(value)) throw new StoreError('constraint', key)
  return value
}
