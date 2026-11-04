/** Validated identifiers for private restoration points crossing the Remote interface. */
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'
import { HistoryReviewError } from './history-files.ts'

/** Opaque restoration point identifier; clients import this type without engine runtime code. */
export type ReviewRestorePointId = Branded<'PersonaReviewRestorePointId'>

/**
 * Admit a UUID received over Remote or read from private history and canonicalize its case.
 * @param value - Unbranded UUID text from a validated string field.
 * @returns Canonical lowercase restoration point identifier.
 * @throws HistoryReviewError when the identifier is malformed.
 */
export function parseReviewRestorePointId(value: string): ReviewRestorePointId {
  if (!/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/iu.test(value)) {
    throw new HistoryReviewError('invalid_restore_point', 'Este ponto de restauração é inválido. Atualize o histórico e escolha um ponto disponível.')
  }
  return brandString<ReviewRestorePointId>(value.toLowerCase())
}
