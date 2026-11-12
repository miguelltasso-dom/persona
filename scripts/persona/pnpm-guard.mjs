#!/usr/bin/env node
// GUARDA DO PNPM NO WORKTREE (Gauge, Keel 12/11): o gate-on-head põe este script na frente do `pnpm` (um shim no PATH). Os node_modules do worktree são JUNÇÕES para os do repositório
// ORIGINAL; um `pnpm install/add/update/...` lá dentro escreveria através delas. Este guarda RECUSA qualquer comando que muda node_modules/lockfile/loja (exit 99) e repassa o resto
// (`run`, `exec`, `--filter X run ...`, `dlx` não) ao pnpm de verdade (caminho absoluto em GATE_REAL_PNPM, para não cair de novo no shim).
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Comandos do pnpm que mudam node_modules, o lockfile, a loja ou o que está publicado. */
export const MUTATING = new Set([
  'install', 'i', 'add', 'remove', 'rm', 'uninstall', 'un', 'update', 'up', 'upgrade', 'import', 'dedupe', 'prune', 'rebuild', 'rb', 'patch', 'patch-commit', 'patch-remove',
  'link', 'ln', 'unlink', 'fetch', 'store', 'approve-builds', 'publish', 'self-update', 'setup', 'env', 'dlx', 'create', 'init', 'deploy', 'install-test', 'it', 'ci', 'clean', 'purge',
])
/** Opções globais que levam o valor no argumento seguinte (as de `--opcao=valor` não precisam). */
const VALUE_OPTIONS = new Set(['--filter', '-F', '--filter-prod', '--dir', '-C', '--config', '--reporter', '--workspace-concurrency', '--test-pattern', '--changed-files-ignore-pattern'])

/** O comando do pnpm (o primeiro argumento que não é opção); `undefined` se não houver. */
export function pnpmCommand(args) {
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg.startsWith('-')) { if (VALUE_OPTIONS.has(arg)) i += 1; continue }
    return arg
  }
  return undefined
}

export const isMutating = (args) => MUTATING.has(pnpmCommand(args) ?? '')

function main() {
  const args = process.argv.slice(2)
  if (isMutating(args)) {
    console.error(`[pnpm-guard] RECUSADO: \`pnpm ${args.join(' ')}\` muda node_modules/lockfile/loja, e aqui os node_modules são junções para o repositório ORIGINAL. Nada foi executado.`)
    process.exit(99)
  }
  const real = process.env.GATE_REAL_PNPM
  if (real === undefined || real === '') { console.error('[pnpm-guard] GATE_REAL_PNPM não definido: o gate-on-head monta o shim; não chame este arquivo à mão.'); process.exit(98) }
  const result = spawnSync(/\s/u.test(real) ? `"${real}"` : real, args, { stdio: 'inherit', shell: process.platform === 'win32' })
  process.exit(result.status ?? 1)
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main()
