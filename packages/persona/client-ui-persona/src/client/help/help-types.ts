/** Help/Novidades document model (built by scripts/persona/gen-help-docs.mjs; never raw HTML). */

export type HelpInline =
  | { readonly t: 'text'; readonly v: string }
  | { readonly t: 'strong'; readonly c: readonly HelpInline[] }
  | { readonly t: 'em'; readonly c: readonly HelpInline[] }
  | { readonly t: 'code'; readonly v: string }
  | { readonly t: 'link'; readonly doc?: string; readonly anchor?: string; readonly href?: string; readonly c: readonly HelpInline[] }

export type HelpBlock =
  | { readonly t: 'h'; readonly level: number; readonly id: string; readonly c: readonly HelpInline[] }
  | { readonly t: 'p'; readonly c: readonly HelpInline[] }
  | { readonly t: 'ul' | 'ol'; readonly items: readonly (readonly HelpBlock[])[] }
  | { readonly t: 'code'; readonly v: string }
  | { readonly t: 'quote'; readonly c: readonly HelpBlock[] }
  | { readonly t: 'table'; readonly rows: readonly (readonly (readonly HelpInline[])[])[] }
  | { readonly t: 'hr' }

export interface HelpDoc {
  readonly id: string
  readonly title: string
  readonly summary: string
  readonly headings: readonly { readonly id: string; readonly text: string; readonly level: number }[]
  /** Lowercase, accent-free plain text (search). */
  readonly text: string
  readonly blocks: readonly HelpBlock[]
}
