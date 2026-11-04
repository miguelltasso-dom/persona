/** Third-party lines for Persona About / legal (D-017) plus the bundled notices file. */

import { access } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

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
  {
    name: 'T3 Code (T3 Tools Inc.)',
    license: 'MIT',
    note: 'T3 Code snippets used in the Persona desktop shell.',
  },
]

/** Names that must not appear as desktop runtime dependencies. */
export const EDGE_ONLY_NOTICES = ['wrangler', 'miniflare', 'workerd'] as const

/**
 * Path to THIRD_PARTY_NOTICES.txt when present (packaged resources or dev tree).
 * @param resourcesPath - `process.resourcesPath` from Electron.
 * @param importMetaUrl - Main module `import.meta.url` for dev fallback.
 */
export async function resolveThirdPartyNoticesPath(
  resourcesPath: string,
  importMetaUrl: string,
): Promise<string | undefined> {
  const candidates = [
    join(resourcesPath, 'THIRD_PARTY_NOTICES.txt'),
    fileURLToPath(new URL('../resources/THIRD_PARTY_NOTICES.txt', importMetaUrl)),
  ]
  for (const path of candidates) {
    try {
      await access(path)
      return path
    } catch (error) {
      void error
    }
  }
  return undefined
}

/**
 * Format the About credits block (no tokens).
 * @param notices - Desktop notice list.
 */
export function formatDesktopLegalNotices(
  notices: readonly ThirdPartyNotice[] = PERSONA_DESKTOP_NOTICES,
): string {
  return notices.map(item => `${item.name} (${item.license})`).join(' · ')
}

/**
 * About-box legal block: bundled notices when present, else the static list.
 * @param text - File body, if resolved.
 */
export function aboutLegalText(text?: string): string {
  if (text !== undefined && text.trim() !== '') return text.trim()
  return formatDesktopLegalNotices()
}

/**
 * @param name - Dependency identity.
 * @returns true when the name is an edge-only Cloudflare tool.
 */
export function isEdgeOnlyNotice(name: string): boolean {
  const lower = name.toLowerCase()
  return EDGE_ONLY_NOTICES.some(item => lower.includes(item))
}
