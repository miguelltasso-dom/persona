/**
 * EFF-1: what a measured turn says about the persona's engine choice, as the ledger row keeps it (contract
 * `persona-settings-host.md` §(5)). The runner reports the choice it applied (`modelRequested` / `effortRequested`) and what the
 * engine dropped (`modelDropped` / `effortDropped`); "Padrão do motor" reports nothing and the row says nothing. `model` (what the
 * call started with) is kept only next to a choice or a drop. A value that is not a short identifier is left out: the
 * measurement of the turn is never lost for it.
 */
import { isLedgerChoiceValue, LEDGER_CHOICE_FIELDS, type LedgerChoiceField } from '@deepseek-ai/dsh-persona-core'

/** The fields a runner may report (the `MeasuredUsage` subset). */
export type ReportedEngineChoice = Partial<Record<LedgerChoiceField, string | undefined>>

/**
 * @param reported - The runner's measurement of one turn.
 * @returns The valid choice fields for the ledger row; empty when there was no choice and no drop.
 */
export function engineChoiceOf(reported: ReportedEngineChoice): Partial<Record<LedgerChoiceField, string>> {
  const choice: Partial<Record<LedgerChoiceField, string>> = {}
  for (const field of LEDGER_CHOICE_FIELDS) {
    if (field === 'model') continue
    const value = reported[field]
    if (isLedgerChoiceValue(value)) choice[field] = value
  }
  if (Object.keys(choice).length === 0) return {}
  return isLedgerChoiceValue(reported.model) ? { model: reported.model, ...choice } : choice
}
