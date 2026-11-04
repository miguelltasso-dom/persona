export type {
  ImportAdapter,
  ImportBatch,
  ImportCandidate,
  ImportCounts,
  ImportFile,
  ImportKind,
  ImportPreview,
  ImportPrivacy,
  ImportRejection,
  ImportStore,
} from './types.ts'
export { IMPORT_SCHEMA_PRESUMED, IMPORT_UNRECOGNIZED } from './types.ts'

export { containsSecretValue, looksLikeCredential, looksLikeSecret, refuseSecrets } from './privacy.ts'
export { MemoryImportStore, applyImport, previewImport, rollbackImport } from './apply.ts'
export { chatgptAdapter } from './chatgpt.ts'
export { claudeAdapter } from './claude.ts'
export { markdownAdapter, expandWikilinks, stripFrontmatter } from './markdown.ts'
export {
  BRING_CONTEXT_PROMPT_EN,
  BRING_CONTEXT_PROMPT_PT,
  bringContextPrompt,
  classifyVaultPath,
  contentHash,
  decideBringApply,
  applyContextProposals,
  vaultToBringExisting,
  listVaultFolderFiles,
  parseBringPaste,
  previewBringVault,
  sensitiveWhy,
} from './bring-context.ts'
export type {
  BringApplyAction,
  BringApplyItem,
  BringContextPreview,
  BringContextProposal,
  BringExistingRecord,
  BringIgnored,
  BringLocale,
  BringPriorHash,
  BringProposalStatus,
  BringProvider,
  BringVaultFile,
  BringVaultKind,
} from './bring-context.ts'
export { notionAdapter } from './notion.ts'
export { geminiAdapter } from './gemini.ts'
export { grokAdapter } from './grok.ts'

import { chatgptAdapter } from './chatgpt.ts'
import { claudeAdapter } from './claude.ts'
import { geminiAdapter } from './gemini.ts'
import { grokAdapter } from './grok.ts'
import { markdownAdapter } from './markdown.ts'
import { notionAdapter } from './notion.ts'
import type { ImportAdapter } from './types.ts'

/** Built-in adapters. Grok sniffs only filenames that contain `grok`. */
export const IMPORT_ADAPTERS: readonly ImportAdapter[] = [
  chatgptAdapter,
  claudeAdapter,
  geminiAdapter,
  notionAdapter,
  markdownAdapter,
  grokAdapter,
]
