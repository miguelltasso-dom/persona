/** Isolated runner homes must not hide native CLI login. */

import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import type { CliKind } from '../contract.ts'

export interface IsolatedHomeIo {
  userHome?: string
  env?: NodeJS.ProcessEnv
  exists?: (path: string) => boolean
  mkdir?: (dir: string) => void
  copyFile?: (from: string, to: string) => void
}

export type IsolatedHomePlan =
  | { readonly kind: 'native' }
  | { readonly kind: 'isolated'; readonly dir: string }

interface CliAuthLayout {
  readonly envVar?: 'CLAUDE_CONFIG_DIR' | 'CODEX_HOME'
  readonly dirName: string
  readonly files: readonly string[]
  readonly userFiles: readonly string[]
}

const LAYOUT: Readonly<Record<CliKind, CliAuthLayout | undefined>> = {
  claude: {
    envVar: 'CLAUDE_CONFIG_DIR',
    dirName: '.claude',
    files: ['.credentials.json', 'credentials.json'],
    userFiles: ['.claude.json'],
  },
  codex: {
    envVar: 'CODEX_HOME',
    dirName: '.codex',
    files: ['auth.json', '.auth.json'],
    userFiles: [],
  },
  opencode: {
    dirName: '.opencode',
    files: ['auth.json'],
    userFiles: [],
  },
  cursor: undefined,
}

/**
 * Decide whether an optional isolated home can be used without dropping login.
 * Default (no home): native HOME. Isolated: copy allowlisted auth files, or
 * point at native (omit isolation vars). Never apply an empty isolated dir.
 * `PERSONA_ISOLATE_CLI_CONFIG=1` keeps the isolated path as-is (tests/spikes).
 * @param cli - CLI family.
 * @param isolated - Requested home; empty/omitted → native.
 * @param io - Injectable fs/env for tests.
 */
export function prepareIsolatedHome(
  cli: CliKind,
  isolated: string | undefined,
  io: IsolatedHomeIo = {},
): IsolatedHomePlan {
  const trimmed = isolated?.trim() ?? ''
  if (trimmed === '') return { kind: 'native' }
  const layout = LAYOUT[cli]
  if (layout === undefined) return { kind: 'native' }
  const env = io.env ?? process.env
  if (env.PERSONA_ISOLATE_CLI_CONFIG === '1') return { kind: 'isolated', dir: resolve(trimmed) }

  const dest = resolve(trimmed)
  const userHome = io.userHome ?? homedir()
  const exists = io.exists ?? existsSync
  const mkdir = io.mkdir ?? ((dir: string) => { mkdirSync(dir, { recursive: true }) })
  const copyFile = io.copyFile ?? copyFileSync
  const nativeDir = nativeAuthDir(layout, userHome, env, dest)
  const copied = seedAuth(layout, nativeDir, userHome, dest, exists, mkdir, copyFile)
  return copied > 0 ? { kind: 'isolated', dir: dest } : { kind: 'native' }
}

function nativeAuthDir(
  layout: CliAuthLayout,
  userHome: string,
  env: NodeJS.ProcessEnv,
  isolated: string,
): string {
  if (layout.envVar !== undefined) {
    const fromEnv = env[layout.envVar]?.trim()
    if (fromEnv !== undefined && fromEnv.length > 0 && resolve(fromEnv) !== isolated) {
      return resolve(fromEnv)
    }
  }
  return resolve(userHome, layout.dirName)
}

function seedAuth(
  layout: CliAuthLayout,
  nativeDir: string,
  userHome: string,
  dest: string,
  exists: (path: string) => boolean,
  mkdir: (dir: string) => void,
  copyFile: (from: string, to: string) => void,
): number {
  let copied = 0
  for (const name of layout.files) {
    if (copyOne(join(nativeDir, name), join(dest, name), nativeDir, dest, exists, mkdir, copyFile)) {
      copied += 1
    }
  }
  for (const name of layout.userFiles) {
    const from = join(userHome, name)
    if (copyOne(from, join(dest, name), userHome, dest, exists, mkdir, copyFile)) copied += 1
  }
  return copied
}

function copyOne(
  from: string,
  to: string,
  allowedRoot: string,
  destRoot: string,
  exists: (path: string) => boolean,
  mkdir: (dir: string) => void,
  copyFile: (from: string, to: string) => void,
): boolean {
  const src = resolve(from)
  const dest = resolve(to)
  if (!inside(allowedRoot, src) || !inside(destRoot, dest)) return false
  if (!exists(src) || src === dest) return false
  mkdir(dirname(dest))
  copyFile(src, dest)
  return true
}

function inside(root: string, candidate: string): boolean {
  const rel = relative(resolve(root), resolve(candidate))
  return rel === '' || rel.length > 0 && !rel.startsWith('..') && !isAbsolute(rel)
}
