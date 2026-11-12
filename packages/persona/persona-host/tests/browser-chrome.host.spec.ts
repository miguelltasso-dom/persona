import { describe, expect, it } from 'vitest'
import {
  chromeCandidates,
  chromeIsOlder,
  chromeLaunchArgs,
  chromeMajor,
  chromeVersionAt,
  findChrome,
} from '../src/browser/chrome.ts'

const ENV = {
  ProgramFiles: 'C:\\Program Files',
  'ProgramFiles(x86)': 'C:\\Program Files (x86)',
  LOCALAPPDATA: 'C:\\Users\\ana\\AppData\\Local',
} as NodeJS.ProcessEnv

describe('chromeCandidates', () => {
  it('looks machine-wide first, then the per-user install', () => {
    expect(chromeCandidates(ENV)).toEqual([
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Users\\ana\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
    ])
  })

  it('skips an empty root', () => {
    expect(chromeCandidates({ ProgramFiles: '' } as NodeJS.ProcessEnv)).toEqual([])
  })
})

describe('findChrome', () => {
  it('returns the first install that exists, with the version on disk', () => {
    const found = findChrome(ENV, path => path.startsWith('C:\\Program Files\\Google'))
    expect(found?.path).toBe('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
  })

  it('returns undefined when Chrome is not installed (no fallback browser)', () => {
    expect(findChrome(ENV, () => false)).toBeUndefined()
  })
})

describe('chromeVersionAt', () => {
  it('reads the newest version folder and ignores everything else', () => {
    const readdir = () => ['157.0.8103.51', '156.0.8078.80', 'PlatformExperienceHelper', 'chrome.exe']
    expect(chromeVersionAt('C:\\Chrome\\Application\\chrome.exe', readdir)).toBe('157.0.8103.51')
  })

  it('compares numerically, not as text', () => {
    expect(chromeVersionAt('C:\\c\\chrome.exe', () => ['99.0.1.1', '100.0.0.1'])).toBe('100.0.0.1')
  })

  it('returns undefined when the folder cannot be read', () => {
    expect(chromeVersionAt('C:\\c\\chrome.exe', () => { throw new Error('nope') })).toBeUndefined()
  })
})

describe('chromeIsOlder', () => {
  it('refuses a profile written by a newer major version', () => {
    expect(chromeIsOlder('156.0.1.1', '157.0.0.1')).toBe(true)
    expect(chromeIsOlder('157.0.1.1', '157.0.0.1')).toBe(false)
    expect(chromeIsOlder(undefined, '157.0.0.1')).toBe(false)
  })

  it('reads the major version', () => {
    expect(chromeMajor('157.0.8103.51')).toBe(157)
    expect(chromeMajor(undefined)).toBeUndefined()
  })
})

describe('chromeLaunchArgs', () => {
  const base = { profileDir: 'C:\\data\\browser-profiles\\p1', port: 9222, headless: true, version: '157.0.8103.51' }

  it('opens the product profile, on loopback, headless with a real user agent', () => {
    const args = chromeLaunchArgs({ ...base, platform: 'win32' })
    expect(args).toContain('--user-data-dir=C:\\data\\browser-profiles\\p1')
    expect(args).toContain('--remote-debugging-port=9222')
    expect(args).toContain('--remote-debugging-address=127.0.0.1')
    expect(args).toContain('--headless=new')
    expect(args.some(arg => arg.startsWith('--user-agent=') && arg.includes('Chrome/157.0.8103.51'))).toBe(true)
    expect(args).not.toContain('--test-type')
    expect(args.at(-1)).toBe('about:blank')
  })

  it('shows the window when headed and keeps the login key per platform', () => {
    const headed = chromeLaunchArgs({ ...base, headless: false, platform: 'win32' })
    expect(headed).toContain('--test-type')
    expect(headed).not.toContain('--headless=new')
    expect(headed.some(arg => arg.startsWith('--user-agent='))).toBe(false)
    expect(chromeLaunchArgs({ ...base, platform: 'linux' })).toContain('--password-store=basic')
    expect(chromeLaunchArgs({ ...base, platform: 'darwin' })).toContain('--use-mock-keychain')
    expect(chromeLaunchArgs({ ...base, platform: 'win32' })).not.toContain('--password-store=basic')
  })
})
