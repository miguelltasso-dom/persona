/**
 * Validate a project folder and report git status. The OS dialog is Rivet's
 * (`pickDirectory` → path | null); this module only admits or refuses the path.
 */

import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, resolve, sep } from 'node:path'
import { spawnSync } from 'node:child_process'
import type { ProductRepos } from '@deepseek-ai/dsh-persona-store'

/** Result of {@link validateProjectRoot}. */
export type ProjectRootDecision =
  | { ok: true; path: string }
  | { ok: false; status: 'invalid'; message: string }

/** Git facts for the Revisar / pasta panel. */
export interface ProjectGitView {
  readonly isRepo: boolean
  readonly defaultBranch: string
  readonly dirty: boolean
}

const WINDOWS_ROOT = /^[A-Za-z]:[\\/]?$/u

/**
 * Refuse system roots, the whole home, UNC, missing paths, files, and overlap
 * with another project's folder.
 * @param raw - Absolute path from the picker or the user.
 * @param product - Projects already rooted.
 * @param projectId - Tenant being set (may replace its own root).
 */
export function validateProjectRoot(
  raw: string,
  product: ProductRepos,
  projectId: string,
): ProjectRootDecision {
  const trimmed = raw.trim()
  if (trimmed === '') return { ok: false, status: 'invalid', message: 'Informe a pasta do projeto.' }
  if (trimmed.startsWith('\\\\') || trimmed.startsWith('//')) {
    return { ok: false, status: 'invalid', message: 'Caminho de rede (UNC) não é permitido.' }
  }
  if (!isAbsolute(trimmed)) {
    return { ok: false, status: 'invalid', message: 'A pasta precisa ser um caminho absoluto.' }
  }
  let path: string
  try {
    path = resolve(trimmed)
  } catch {
    return { ok: false, status: 'invalid', message: 'Caminho inválido.' }
  }
  if (WINDOWS_ROOT.test(path) || path === '/' || path === sep) {
    return { ok: false, status: 'invalid', message: 'Não use a raiz do sistema como pasta do projeto.' }
  }
  const home = resolve(homedir())
  if (path === home) {
    return { ok: false, status: 'invalid', message: 'Não use a pasta pessoal inteira como projeto.' }
  }
  if (!existsSync(path)) {
    return { ok: false, status: 'invalid', message: 'Esta pasta não existe.' }
  }
  try {
    if (!statSync(path).isDirectory()) {
      return { ok: false, status: 'invalid', message: 'O caminho não é uma pasta.' }
    }
  } catch {
    return { ok: false, status: 'invalid', message: 'Não consegui ler esta pasta.' }
  }
  for (const project of product.listProjects(product.getProject(projectId)?.workspaceId ?? '')) {
    const other = project.rootPath
    if (other === undefined || other === '' || project.id === projectId) continue
    const rooted = resolve(other)
    if (path === rooted) {
      return { ok: false, status: 'invalid', message: 'Esta pasta já é de outro projeto.' }
    }
    if (isUnder(rooted, path) || isUnder(path, rooted)) {
      return { ok: false, status: 'invalid', message: 'A pasta não pode ficar dentro de outro projeto (nem o contrário).' }
    }
  }
  return { ok: true, path }
}

/**
 * @param projectRoot - Validated folder.
 */
export function detectProjectGit(projectRoot: string): ProjectGitView {
  const probe = git(['rev-parse', '--is-inside-work-tree'], projectRoot)
  if (probe.status !== 0 || !/true/i.test(probe.stdout)) {
    return { isRepo: false, defaultBranch: '', dirty: false }
  }
  const branch = git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], projectRoot)
  let defaultBranch = branch.stdout.replace(/^origin\//u, '').trim()
  if (defaultBranch === '' || defaultBranch === 'HEAD') {
    const named = git(['symbolic-ref', '--short', 'HEAD'], projectRoot)
    defaultBranch = named.stdout.trim()
  }
  if (defaultBranch === 'HEAD') defaultBranch = ''
  const dirty = git(['status', '--porcelain'], projectRoot).stdout.trim() !== ''
  return { isRepo: true, defaultBranch, dirty }
}

function isUnder(root: string, candidate: string): boolean {
  const prefix = root.endsWith(sep) ? root : root + sep
  return candidate.startsWith(prefix)
}

function git(args: string[], cwd: string): { status: number; stdout: string } {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, timeout: 4_000 })
  return { status: result.status ?? 1, stdout: result.stdout ?? '' }
}
