export type {
  ImportAdapter,
  ImportBatch,
  ImportCandidate,
  ImportFile,
  ImportKind,
  ImportPreview,
  ImportPrivacy,
  ImportRejection,
  ImportStore,
} from './types.ts'

export { looksLikeCredential, looksLikeSecret, refuseSecrets } from './privacy.ts'
export { MemoryImportStore, applyImport, previewImport, rollbackImport } from './apply.ts'
export { chatgptAdapter } from './chatgpt.ts'
export { claudeAdapter } from './claude.ts'
export { markdownAdapter } from './markdown.ts'
export { grokAdapter } from './grok.ts'

import { chatgptAdapter } from './chatgpt.ts'
import { claudeAdapter } from './claude.ts'
import { grokAdapter } from './grok.ts'
import { markdownAdapter } from './markdown.ts'
import type { ImportAdapter } from './types.ts'

/** Built-in adapters; Grok is registered but does not sniff until a sample exists. */
export const IMPORT_ADAPTERS: readonly ImportAdapter[] = [
  chatgptAdapter,
  claudeAdapter,
  markdownAdapter,
  grokAdapter,
]
