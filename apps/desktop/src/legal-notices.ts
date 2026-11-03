/**
 * Third-party lines for Persona About / legal (D-017).
 * wrangler/miniflare/workerd stay in apps/persona-edge only.
 */

export interface ThirdPartyNotice {
  readonly name: string
  readonly license: string
  readonly note: string
}

/** Notices that ship with the desktop app. */
export const PERSONA_DESKTOP_NOTICES: readonly ThirdPartyNotice[] = [
  {
    name: 'DeepSeek Harness',
    license: 'MIT',
    note: 'Persona is based on DeepSeek Harness. Internal dsh-* ids stay.',
  },
  {
    name: '@botiverse/oar',
    license: 'Apache-2.0',
    note: 'CLI runtime adapter (Claude, Codex, OpenCode, Cursor) via persona-runners.',
  },
  {
    name: 'dsh-superagent-prototype (engine core)',
    license: 'MIT',
    note: 'Verbatim Super-agent core in persona-engine. See packages/persona/persona-engine/NOTICE.',
  },
]

/** Names that must not appear as desktop runtime dependencies. */
export const EDGE_ONLY_NOTICES = ['wrangler', 'miniflare', 'workerd'] as const

/**
 * Format the About credits block (no tokens).
 * @param notices - Desktop notice list.
 */
export function formatDesktopLegalNotices(notices: readonly ThirdPartyNotice[] = PERSONA_DESKTOP_NOTICES): string {
  return notices.map(item => `${item.name} (${item.license})`).join(' · ')
}

/**
 * @param name - Dependency identity.
 * @returns true when the name is an edge-only Cloudflare tool.
 */
export function isEdgeOnlyNotice(name: string): boolean {
  const lower = name.toLowerCase()
  return EDGE_ONLY_NOTICES.some(item => lower.includes(item))
}
