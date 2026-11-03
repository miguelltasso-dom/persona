import { describe, expect, it } from 'vitest'
import {
  UnknownLicenseError,
  assertKnownLicenses,
  collectProductionNotices,
  formatThirdPartyNoticesFile,
} from '../src/third-party-notices.ts'

describe('THIRD_PARTY_NOTICES', () => {
  it('accepts known SPDX licenses and formats the About file', () => {
    const notices = collectProductionNotices(
      { name: '@deepseek-ai/dsh-desktop', license: 'MIT', dependencies: { semver: '^7', ws: '^8' } },
      [
        { name: 'semver', license: 'ISC' },
        { name: 'ws', license: 'MIT' },
      ],
    )
    expect(notices.map(item => item.name)).toEqual(['@deepseek-ai/dsh-desktop', 'semver', 'ws'])
    expect(formatThirdPartyNoticesFile(notices)).toMatch(/ISC/u)
  })

  it('fails when a production dep has no known license', () => {
    expect(() => assertKnownLicenses([{ name: 'mystery', license: '', text: '' }])).toThrow(UnknownLicenseError)
    expect(() => collectProductionNotices(
      { name: 'app', license: 'MIT', dependencies: { mystery: '1' } },
      [{ name: 'mystery', license: 'UNKNOWN-PROPRIETARY' }],
    )).toThrow(/unknown license for mystery/u)
  })
})
