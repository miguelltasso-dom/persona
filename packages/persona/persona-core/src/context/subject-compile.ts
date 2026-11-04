/**
 * Snapshot filter for the active conversation subject (WAVE2 §1).
 * Required vault facts always enter. Other subjects only via Chain of Recall.
 */

import type { ChainHop, RecallNode } from './chain.ts'
import type { CompiledContext, CompileContextInput, ContextKind, ContextRecord, ContextSnapshot } from './types.ts'

const ALWAYS: ReadonlySet<ContextKind> = new Set(['constraint', 'decision'])

/**
 * Keep requireds + records of the active subject. Drop other subjects' memories.
 * @param snapshot - Full project snapshot.
 * @param activeSubjectId - Subject in view.
 * @returns Snapshot with only requireds and the active subject's records.
 */
export function restrictSnapshotToSubject(
  snapshot: ContextSnapshot,
  activeSubjectId: string,
): ContextSnapshot {
  const required = new Set(snapshot.requiredIds)
  const records = snapshot.records.filter(record => recordBelongs(record, activeSubjectId, required))
  return { revision: snapshot.revision, requiredIds: snapshot.requiredIds, records }
}

function recordBelongs(
  record: ContextRecord,
  activeSubjectId: string,
  required: ReadonlySet<string>,
): boolean {
  if (required.has(record.id)) return true
  if (ALWAYS.has(record.kind) && record.subjectId === undefined) return true
  return record.subjectId === activeSubjectId
}

/** Trusted compile input plus the subject in view and optional citations. */
export interface CompileActiveSubjectInput extends CompileContextInput {
  readonly activeSubjectId: string
  readonly citedSubjectIds?: readonly string[]
  readonly subjectNodes?: readonly RecallNode[]
}

/** Active-subject payload plus optional Chain of Recall hops. */
export interface CompiledSubjectContext {
  readonly compiled: CompiledContext
  readonly chain: readonly ChainHop[]
}
