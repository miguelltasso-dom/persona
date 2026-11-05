import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  assertNoRuntimeDrift,
  assertRuntimeLockfileWithinWorkspace,
  findRuntimeDrift,
  installedPackagesIn,
  lockedVersionsOf,
  lockfileDrift,
} from '../scripts/runtime-lockfile-drift.ts'

const workspaceLock = `lockfileVersion: '9.0'
packages:
  '@earendil-works/pi-ai@1.3.0':
    resolution: {integrity: sha512-a}
  '@earendil-works/pi-coding-agent@1.3.0':
    resolution: {integrity: sha512-b}
  '@earendil-works/pi-agent-core@1.3.0':
    resolution: {integrity: sha512-c}
  zod@3.25.76:
    resolution: {integrity: sha512-d}
  zod@4.4.3:
    resolution: {integrity: sha512-e}
  'lodash@file:vendor/lodash.tgz':
    resolution: {tarball: file:vendor/lodash.tgz}
`

/** The H2 #3 runtime lockfile: the provider stack floated to 1.5.0 except pi-ai (the only pinned one). */
const floatingRuntimeLock = `lockfileVersion: '9.0'
packages:
  '@earendil-works/pi-ai@1.3.0':
    resolution: {integrity: sha512-a}
  '@earendil-works/pi-coding-agent@1.5.0':
    resolution: {integrity: sha512-x}
  '@earendil-works/pi-agent-core@1.5.0':
    resolution: {integrity: sha512-y}
  zod@4.4.3:
    resolution: {integrity: sha512-e}
  '@deepseek-ai/dsh-persona-host@0.2.2-alpha.3':
    resolution: {integrity: sha512-z}
`

describe('runtime lockfile drift (ENG-1: the installed app ran code the workspace never tested)', () => {
  it('reads every registry version the workspace locks, and ignores link/file/git keys', () => {
    const locked = lockedVersionsOf(workspaceLock)
    expect([...locked.get('zod') ?? []].sort()).toEqual(['3.25.76', '4.4.3'])
    expect([...locked.get('@earendil-works/pi-coding-agent') ?? []]).toEqual(['1.3.0'])
    expect(locked.has('lodash')).toBe(false)
  })

  it('flags the exact H2 #3 drift: provider packages at 1.5.0 next to pi-ai 1.3.0', () => {
    const drift = lockfileDrift(floatingRuntimeLock, workspaceLock)
    expect(drift.diverging.map(row => `${row.name}@${row.version}`).sort()).toEqual([
      '@earendil-works/pi-agent-core@1.5.0',
      '@earendil-works/pi-coding-agent@1.5.0',
    ])
    expect(drift.diverging[0]?.locked).toEqual(['1.3.0'])
    // names the workspace does not know are runtime-only: reported, not an error by themselves
    expect(drift.runtimeOnlyNames).toEqual(['@deepseek-ai/dsh-persona-host'])
    expect(() => assertRuntimeLockfileWithinWorkspace(floatingRuntimeLock, workspaceLock)).toThrow(/2 package\(s\) drifted from the workspace lockfile/u)
  })

  it('passes a runtime lockfile that resolves only locked versions (several versions of one name are fine)', () => {
    const faithful = workspaceLock.replace(/ {2}'lodash[\s\S]*$/u, '')
    const proof = assertRuntimeLockfileWithinWorkspace(`${faithful}  '@deepseek-ai/dsh-persona-host@0.2.2-alpha.3':\n    resolution: {integrity: sha512-z}\n`, workspaceLock)
    expect(proof).toEqual({ checked: 5, runtimeOnly: 1 })
  })

  describe('installed tree', () => {
    const roots: string[] = []
    afterEach(() => { for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true }) })

    function tree(packages: Record<string, string>): string {
      const root = mkdtempSync(join(tmpdir(), 'runtime-drift-'))
      roots.push(root)
      for (const [where, version] of Object.entries(packages)) {
        const name = where.split('node_modules/').at(-1) ?? where
        const dir = join(root, where)
        mkdirSync(dir, { recursive: true })
        writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version }))
      }
      return root
    }

    it('finds packages at the top level, in scopes and in nested node_modules, and reports the drifted ones with where they are', () => {
      const root = tree({
        '@earendil-works/pi-ai': '1.3.0',
        '@earendil-works/pi-coding-agent': '1.5.0',
        '@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-agent-core': '1.5.0',
        'zod': '4.4.3',
        'left-pad': '1.0.0',
      })
      const installed = installedPackagesIn(root)
      expect(installed.map(item => item.where).sort()).toEqual([
        '@earendil-works/pi-ai',
        '@earendil-works/pi-coding-agent',
        '@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-agent-core',
        'left-pad',
        'zod',
      ])
      const report = findRuntimeDrift(installed, lockedVersionsOf(workspaceLock))
      expect(report.diverging.map(row => row.where).sort()).toEqual([
        '@earendil-works/pi-coding-agent',
        '@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-agent-core',
      ])
      expect(report.runtimeOnly.map(item => item.name)).toEqual(['left-pad'])
      expect(() => assertNoRuntimeDrift(report)).toThrow(/pi-coding-agent@1\.5\.0 \(lockfile: 1\.3\.0\)/u)
    })

    it('an install that matches the lockfile passes', () => {
      const root = tree({ '@earendil-works/pi-ai': '1.3.0', 'zod': '3.25.76' })
      expect(() => assertNoRuntimeDrift(findRuntimeDrift(installedPackagesIn(root), lockedVersionsOf(workspaceLock)))).not.toThrow()
    })
  })
})
