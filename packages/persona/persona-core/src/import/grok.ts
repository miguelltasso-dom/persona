/**
 * Extension point for the Grok-bot export Miguel will provide.
 * Sniff never matches until a real fixture lands.
 */

import { DomainError } from '../domain/schemas.ts'
import type { ImportAdapter, ImportFile } from './types.ts'

export const grokAdapter: ImportAdapter = {
  id: 'grok',
  label: 'Grok-bot export (pending sample)',
  sniff(_files: readonly ImportFile[]): boolean {
    return false
  },
  parse(_files: readonly ImportFile[]) {
    throw new DomainError('IMPORT_REFUSED', 'GROK_EXPORT_PENDING')
  },
}
