/**
 * GitHub Releases feed for Persona updates. Tests use a fake local server.
 * Never publishes. Unsigned builds keep `publish: null` in electron-builder.
 */

export const PERSONA_GITHUB_OWNER = 'miguelltasso-dom'
export const PERSONA_GITHUB_REPO = 'persona'

export type UpdateChannel = 'nightly' | 'stable'

export interface LatestYmlFile {
  url: string
  sha512: string
  size: number
}

export interface LatestYml {
  version: string
  path: string
  sha512: string
  releaseDate: string
  files: LatestYmlFile[]
}

/**
 * electron-updater GitHub provider for the Persona fork.
 * @param channel - nightly uses prereleases.
 */
export function personaGithubPublish(channel: UpdateChannel): {
  provider: 'github'
  owner: string
  repo: string
  releaseType: 'draft' | 'prerelease' | 'release'
} {
  return {
    provider: 'github',
    owner: PERSONA_GITHUB_OWNER,
    repo: PERSONA_GITHUB_REPO,
    releaseType: channel === 'nightly' ? 'prerelease' : 'release',
  }
}

/**
 * Generic feed URL (local fake or a static host). Channel file is `latest.yml`.
 * @param origin - `http://127.0.0.1:port` (no trailing slash).
 * @param channel - nightly | stable.
 */
export function personaGenericFeedUrl(origin: string, channel: UpdateChannel): string {
  return `${origin.replace(/\/$/u, '')}/${channel}`
}

/**
 * Render electron-updater `latest.yml` (generic provider).
 * @param input - Version, artifact name, sha512, size.
 */
export function renderLatestYml(input: {
  version: string
  path: string
  sha512: string
  size: number
  releaseDate?: string
}): string {
  const releaseDate = input.releaseDate ?? '2026-11-03T00:00:00.000Z'
  return [
    `version: ${input.version}`,
    'files:',
    `  - url: ${input.path}`,
    `    sha512: ${input.sha512}`,
    `    size: ${String(input.size)}`,
    `path: ${input.path}`,
    `sha512: ${input.sha512}`,
    `releaseDate: '${releaseDate}'`,
    '',
  ].join('\n')
}

/**
 * Parse a `latest.yml` written by {@link renderLatestYml}.
 * @param text - YAML text.
 */
export function parseLatestYml(text: string): LatestYml {
  const version = /^version:\s*(.+)$/mu.exec(text)?.[1]?.trim()
  const path = /^path:\s*(.+)$/mu.exec(text)?.[1]?.trim()
  const sha512 = /^sha512:\s*(.+)$/mu.exec(text)?.[1]?.trim()
  const sizeLine = /^\s+size:\s*(\d+)$/mu.exec(text)?.[1]
  const url = /^\s+- url:\s*(.+)$/mu.exec(text)?.[1]?.trim()
  const releaseDate = /^releaseDate:\s*'?([^'\n]+)'?/mu.exec(text)?.[1]?.trim()
  if (version === undefined || path === undefined || sha512 === undefined || sizeLine === undefined || url === undefined) {
    throw new Error('latest.yml incomplete')
  }
  return {
    version,
    path,
    sha512,
    releaseDate: releaseDate ?? '',
    files: [{ url, sha512, size: Number(sizeLine) }],
  }
}
