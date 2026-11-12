/**
 * P0-B reaberto (S3, Mend, decisão do Keel 18:42): a ferramenta Write/Edit/MultiEdit/NotebookEdit do CLI é julgada só por `insideRoot` (`permission-gate.ts`, decideWrite), então escrevia no
 * `.git` do rascunho (`.git/config` com `filter.x.clean`, `diff.external`, um gancho) ou criava um `.git` ARQUIVO (`sub/.git` = `gitdir: ../evil`) por fora do julgamento de shell: é a mesma
 * classe do P0-B (o config de um repositório da persona executa programa no próximo `git add`/`git diff`). Esperado: o alvo cujo caminho relativo ao rascunho tem um segmento `.git` (arquivo
 * ou pasta, sem diferenciar maiúscula, com ponto/espaço final ou fluxo NTFS) ou o nome 8.3 `GIT~N` é NEGADO; a escrita comum e um rascunho que já É um repositório (feito pelo produto
 * ou pelo git, fora da ferramenta) continuam funcionando.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { judgeCommand } from '../src/authority/command-policy.ts'
import { GATE_TOKEN_HEADER, PermissionGate } from '../src/resolve/permission-gate.ts'

const gates: PermissionGate[] = []
const dirs: string[] = []
afterEach(async () => {
  await Promise.all(gates.splice(0).map(async gate => gate.close()))
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A draft that is already a repository, as the product (or `git init`) leaves it before the turn: `.git/` with HEAD, objects and refs. */
async function armedRepositoryDraft(): Promise<{ gate: PermissionGate; root: string }> {
  const base = mkdtempSync(join(tmpdir(), 'gate-git-'))
  dirs.push(base)
  const root = join(base, 'rascunho')
  mkdirSync(join(root, '.git', 'objects'), { recursive: true })
  mkdirSync(join(root, '.git', 'refs', 'heads'), { recursive: true })
  mkdirSync(join(root, '.git', 'hooks'), { recursive: true })
  writeFileSync(join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n')
  writeFileSync(join(root, '.git', 'config'), '[core]\n\trepositoryformatversion = 0\n')
  mkdirSync(join(root, 'sub'), { recursive: true })
  const gate = await PermissionGate.start({ token: 'tok-1' })
  gates.push(gate)
  gate.arm({ draftRoot: root })
  return { gate, root }
}

async function permission(gate: PermissionGate, tool: string, input: unknown, cwd: string): Promise<string | undefined> {
  const response = await fetch(gate.url, {
    method: 'POST', headers: { 'content-type': 'application/json', [GATE_TOKEN_HEADER]: 'tok-1' },
    body: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: tool, tool_input: input, cwd }),
  })
  const body = (await response.json()) as { hookSpecificOutput?: { permissionDecision?: string } }
  return body.hookSpecificOutput?.permissionDecision
}

describe('P0-B (S3): a ferramenta de escrita do CLI não escreve no `.git` de um repositório', () => {
  it.each([
    ['Write .git/config (absoluto)', 'Write', (root: string) => ({ file_path: join(root, '.git', 'config'), content: '[filter "x"]\n\tclean = calc\n' })],
    ['Write .git/config (relativo)', 'Write', () => ({ file_path: '.git/config', content: 'x' })],
    ['Edit .git/config', 'Edit', () => ({ file_path: '.git/config', old_string: 'a', new_string: 'b' })],
    ['Write .git/hooks/pre-commit', 'Write', (root: string) => ({ file_path: join(root, '.git', 'hooks', 'pre-commit'), content: '#!/bin/sh\ncalc\n' })],
    ['Write sub/.git/hooks/x', 'Write', () => ({ file_path: 'sub/.git/hooks/x', content: 'x' })],
    ['Write sub/.git (o `.git` ARQUIVO: gitdir: evil)', 'Write', () => ({ file_path: 'sub/.git', content: 'gitdir: ../evil\n' })],
    ['Write .git (na raiz, arquivo)', 'Write', (root: string) => ({ file_path: join(root, '.git'), content: 'gitdir: evil\n' })],
    ['MultiEdit .git/HEAD', 'MultiEdit', () => ({ file_path: '.git/HEAD', edits: [] })],
    ['NotebookEdit .git/x.ipynb', 'NotebookEdit', () => ({ notebook_path: '.git/x.ipynb' })],
    ['Write sub\\.GIT\\config (maiúscula, barra invertida)', 'Write', () => ({ file_path: 'sub\\.GIT\\config', content: 'x' })],
    ['Write .git./config (ponto final)', 'Write', () => ({ file_path: '.git./config', content: 'x' })],
    ['Write GIT~1/config (8.3)', 'Write', () => ({ file_path: 'GIT~1/config', content: 'x' })],
    ['Write sub/git~2/hooks/x (8.3)', 'Write', () => ({ file_path: 'sub/git~2/hooks/x', content: 'x' })],
  ])('%s é negado', async (_name, tool, input) => {
    const { gate, root } = await armedRepositoryDraft()
    expect(await permission(gate, tool, input(root), root)).toBe('deny')
  })

  it('controles: a escrita comum e os arquivos com "git" no nome continuam (sem opinião do portão)', async () => {
    const { gate, root } = await armedRepositoryDraft()
    for (const file of ['cartaz.svg', 'sub/a.txt', '.gitignore', 'sub/.gitattributes', '.github/workflows/ci.yml', 'notes/git-notes.md', 'sub/digit~1.txt', 'mygit/x.txt']) {
      expect(await permission(gate, 'Write', { file_path: file, content: 'x' }, root), file).toBeUndefined()
    }
    expect(await permission(gate, 'Edit', { file_path: join(root, 'cartaz.svg'), old_string: 'a', new_string: 'b' }, root)).toBeUndefined()
  })

  it('controle: o rascunho que JÁ é repositório (feito fora da ferramenta) segue usável pelo git sem a pessoa', async () => {
    const { root } = await armedRepositoryDraft()
    expect(judgeCommand('git status', { draftRoot: root, cwd: root }).kind).toBe('read')
    expect(judgeCommand('git add sub/a.txt', { draftRoot: root, cwd: root }).kind).toBe('draft-change')
  })
})
