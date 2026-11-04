/** UI model aligned with persona-engine ReviewSummary (client-local). */

export interface ReviewFileChangeUi {
  readonly path: string
  readonly added: number
  readonly deleted: number
  /** SW-6 (optional): what the draft host knows per file — see contracts/simple-workspace-ui.md §2. */
  readonly kind?: 'new' | 'changed' | 'deleted' | undefined
  readonly before?: string | undefined
  readonly after?: string | undefined
  readonly cells?: readonly { readonly sheet: string; readonly cell: string; readonly before: string; readonly after: string }[] | undefined
  readonly beforeImage?: string | undefined
  readonly afterImage?: string | undefined
  readonly conflict?: boolean | undefined
  readonly truncated?: boolean | undefined
  readonly canOpenDraft?: boolean | undefined
}

export interface ReviewSummaryUi {
  readonly ticketId: string
  readonly files: readonly ReviewFileChangeUi[]
  readonly added: number
  readonly deleted: number
  readonly patch: string
  readonly patchTruncated: boolean
  readonly patchLimitBytes: number
  readonly secretsRedacted: boolean
  readonly testsClaimed: readonly string[]
}

export interface ReviewBlockedUi {
  readonly explanation: string
}

export const MOCK_REVIEW_SUMMARY: ReviewSummaryUi = {
  ticketId: 't-review-1',
  files: [
    { path: 'src/auth/login.ts', added: 12, deleted: 3 },
    { path: 'tests/auth/login.spec.ts', added: 8, deleted: 0 },
  ],
  added: 20,
  deleted: 3,
  patch: `--- a/src/auth/login.ts
+++ b/src/auth/login.ts
@@ -1,3 +1,4 @@
 export function login(token: string) {
+  // [redacted]
   return validate(token)
`,
  patchTruncated: false,
  patchLimitBytes: 32_768,
  secretsRedacted: true,
  testsClaimed: ['pnpm exec vitest run tests/auth/login.spec.ts'],
}
