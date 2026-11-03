/**
 * Production-dep notices for the packaged desktop About screen.
 */

export const KNOWN_LICENSES = ['MIT', 'Apache-2.0', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause'] as const

export type KnownLicense = (typeof KNOWN_LICENSES)[number]

export interface PackagedNotice {
  readonly name: string
  readonly license: string
  readonly text: string
}

const LICENSE_TEXT: Record<KnownLicense, string> = {
  MIT: 'MIT License. See the dependency LICENSE file.',
  'Apache-2.0': 'Apache License 2.0. See the dependency LICENSE file.',
  ISC: 'ISC License. See the dependency LICENSE file.',
  'BSD-2-Clause': 'BSD 2-Clause License. See the dependency LICENSE file.',
  'BSD-3-Clause': 'BSD 3-Clause License. See the dependency LICENSE file.',
}

export class UnknownLicenseError extends Error {
  readonly packageName: string
  readonly license: string

  /**
   * @param packageName - Package name.
   * @param license - Declared or missing license.
   */
  constructor(packageName: string, license: string) {
    super(`unknown license for ${packageName}: ${license}`)
    this.name = 'UnknownLicenseError'
    this.packageName = packageName
    this.license = license
  }
}

/**
 * Fail when a packaged production dep has no known SPDX license.
 * @param notices - Collected rows.
 */
export function assertKnownLicenses(notices: readonly PackagedNotice[]): void {
  for (const item of notices) {
    if (!KNOWN_LICENSES.includes(item.license as KnownLicense) || item.license.length === 0) {
      throw new UnknownLicenseError(item.name, item.license === '' ? '(missing)' : item.license)
    }
  }
}

export interface PackageJsonLicense {
  name?: string
  license?: string
  dependencies?: Record<string, string>
}

/**
 * Build notices from a package.json + resolved child manifests.
 * @param root - The packaged app manifest.
 * @param resolved - One manifest per production dependency name.
 */
export function collectProductionNotices(
  root: PackageJsonLicense,
  resolved: readonly PackageJsonLicense[],
): PackagedNotice[] {
  const wanted = new Set(Object.keys(root.dependencies ?? {}))
  const notices: PackagedNotice[] = []
  if (typeof root.name === 'string' && typeof root.license === 'string') {
    notices.push({
      name: root.name,
      license: root.license,
      text: LICENSE_TEXT[root.license as KnownLicense] ?? '',
    })
  }
  for (const pkg of resolved) {
    if (typeof pkg.name !== 'string' || !wanted.has(pkg.name)) continue
    const license = typeof pkg.license === 'string' ? pkg.license : ''
    notices.push({
      name: pkg.name,
      license,
      text: LICENSE_TEXT[license as KnownLicense] ?? '',
    })
  }
  assertKnownLicenses(notices)
  return notices
}

/**
 * Render the About / THIRD_PARTY_NOTICES file.
 * @param notices - Validated rows.
 */
export function formatThirdPartyNoticesFile(notices: readonly PackagedNotice[]): string {
  return notices.map(item => `${item.name}\n${item.license}\n${item.text}\n`).join('\n')
}
