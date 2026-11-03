/** Persona domain core: ids, entities, access policy, context compilation and recall. */

/** Package identity marker used by the skeleton smoke test. */
export const PACKAGE_CORE = 'persona-core'

export {
  ContextError,
  compileContext,
  recall,
} from './context/index.ts'

export type {
  CompiledContext,
  CompileContextInput,
  ContextAuthorize,
  ContextErrorCode,
  ContextKind,
  ContextManifest,
  ContextManifestEntry,
  ContextRecord,
  ContextScope,
  ContextSnapshot,
  CountTokens,
  RecallEvent,
  RecallEventType,
  RecallInput,
  RecallResult,
  RecalledEvent,
} from './context/index.ts'
