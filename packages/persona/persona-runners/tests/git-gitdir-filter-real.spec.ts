import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { ActionKind } from '../src/authority/authority-table.ts'
import { judgeCommand } from '../src/authority/command-policy.ts'
import { nativeSessionEnv } from '../src/oar/native-cli-env.ts'

/**
 * Auditoria final da Colheita S1, delta do Lumen (sweep S2), git de VERDADE (Gauge, 12/11 18:0x): os 4 pares de config do ambiente do runner (`nativeSessionEnv`: hooksPath, fsmonitor, bareRepository)
 * NÃO cobrem o que o `config` de um repositório pode mandar rodar por OUTRO caminho: um `.git` ARQUIVO (`gitdir: ../evil`, escrito por `echo ... > sub/.git`, julgado draft-change) aponta para uma
 * pasta comum `evil/` da persona cujo `config` tem `filter.x.clean = <programa>`; um `.gitattributes` com `* filter=x` faz o `git add` rodar o programa.
 * Programa inofensivo: só grava um marcador DENTRO da pasta temporária. O CONTROLE (sem os pares) prova que o ataque é real nesta máquina, senão "o marcador não apareceu" não prova nada.
 *
 * S3 (Mend, 12/11): o ambiente SOZINHO não fecha isto (os nomes `filter.<x>`, `diff.<x>.textconv`, `merge.<x>.driver` são livres: não há par GIT_CONFIG_* que os desligue), então o
 * antigo `it.fails` (só ambiente) virou a prova da defesa que existe: o JULGAMENTO do runner. (1) escrever o `.git` (arquivo ou pasta, ou o 8.3 `GIT~1`) não é auto-permitido;
 * (2) com o `.git` arquivo já no disco (a ferramenta Write do CLI o escreve fora do julgamento de shell), o `git add` que o usaria não é auto-permitido (`gitRootOf`: só o
 * repositório do próprio rascunho); (3) a cadeia como o runner a roda sem ninguém olhando (só o que é read/draft-change) não executa o programa. Controles reais: o repositório que
 * o git fez no rascunho e o rascunho que é um worktree do projeto (como o produto o cria) continuam auto-permitidos.
 */
let base = ''
const gitOk = (): boolean => { try { execFileSync('git', ['--version'], { stdio: 'ignore', timeout: 20_000, windowsHide: true }); return true } catch { return false } }
/** What the authority table lets through with nobody looking. */
const AUTO: ReadonlySet<ActionKind> = new Set<ActionKind>(['read', 'draft-change'])

beforeAll(() => { base = mkdtempSync(join(tmpdir(), 'persona-gitdir-real-')) })
afterAll(() => { rmSync(base, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 }) })

interface Attack { readonly draft: string; readonly sub: string; readonly marker: string }

/** Monta o ataque numa pasta nova (o `.git` arquivo escrito direto no disco, como a ferramenta Write do CLI o escreveria). */
function build(name: string): Attack {
  const draft = join(base, name, 'draft')
  const evil = join(draft, 'evil')
  const sub = join(draft, 'sub')
  mkdirSync(join(evil, 'objects'), { recursive: true })
  mkdirSync(join(evil, 'refs', 'heads'), { recursive: true })
  mkdirSync(sub, { recursive: true })
  const marker = join(base, name, 'MARKER').replace(/\\/gu, '/')
  writeFileSync(join(evil, 'HEAD'), 'ref: refs/heads/main\n')
  writeFileSync(join(evil, 'config'), `[core]\n\trepositoryformatversion = 0\n[filter "x"]\n\tclean = sh -c "echo ran > ${marker}; cat"\n`)
  writeFileSync(join(sub, '.git'), 'gitdir: ../evil\n')
  writeFileSync(join(sub, '.gitattributes'), '* filter=x\n')
  writeFileSync(join(sub, 'a.txt'), 'hello\n')
  return { draft, sub, marker }
}

/** `git -C sub add a.txt` de verdade; devolve se o programa da persona executou. */
function gitAdd(attack: Attack, env: NodeJS.ProcessEnv): boolean {
  try { execFileSync('git', ['-C', attack.sub, 'add', 'a.txt'], { env, stdio: 'ignore', timeout: 30_000, windowsHide: true }) } catch { /* o git pode terminar com erro depois de rodar o filtro: o que conta é o marcador */ }
  return existsSync(attack.marker)
}

const cleanEnv = (): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const key of Object.keys(env)) if (/^GIT_/iu.test(key)) delete env[key]
  return env
}
const runnerEnv = (): NodeJS.ProcessEnv => {
  const env = cleanEnv()
  for (const [key, value] of Object.entries(nativeSessionEnv())) {
    if (value === null) delete env[key]
    else env[key] = value
  }
  return env
}
const git = (cwd: string, ...args: string[]): void => {
  execFileSync('git', ['-c', 'user.name=persona-test', '-c', 'user.email=persona-test@example.invalid', '-c', 'init.defaultBranch=main', ...args], { cwd, env: runnerEnv(), stdio: 'ignore', timeout: 30_000, windowsHide: true })
}

it.skipIf(!gitOk())('CONTROLE: sem os pares do runner, o `.git` arquivo + filter.clean executa um programa da persona no `git add` (o ataque é real nesta máquina)', () => {
  expect(gitAdd(build('control'), cleanEnv()), 'o filtro deveria rodar sem os pares').toBe(true)
}, 60_000)

it.skipIf(!gitOk())('S3: com o julgamento do runner, o `.git` da persona não chega ao `git add` sem a pessoa e o programa NÃO executa', () => {
  const attack = build('gated')
  const judged = (command: string): ActionKind => judgeCommand(command, { draftRoot: attack.draft, cwd: attack.draft }).kind
  // (1) escrever o `.git` por qualquer caminho do shell não é auto-permitido
  for (const command of ['echo gitdir: ../evil > sub/.git', 'printf "gitdir: ../evil" > sub/.git', 'cp tpl sub/.git', 'mv tpl sub/.git', 'tee sub/.git', 'Set-Content sub/.git x', 'echo x > sub/GIT~1/config', 'cd sub && echo gitdir: ../evil > .git']) {
    expect(AUTO.has(judged(command)), command).toBe(false)
  }
  // (2) com o `.git` arquivo já no disco, o git que o usaria não é auto-permitido
  const add = judgeCommand('git -C sub add a.txt', { draftRoot: attack.draft, cwd: attack.draft })
  expect(add.kind).toBe('unknown')
  expect(add.reason).toBe('git-repository-not-draft')
  for (const command of ['cd sub && git add a.txt', 'git -C sub status', 'git -C evil log', 'cd evil && git status']) expect(AUTO.has(judged(command)), command).toBe(false)
  // (3) a cadeia como o runner a roda sem ninguém olhando: só o que é read/draft-change chega ao git
  const ran = AUTO.has(add.kind) ? gitAdd(attack, runnerEnv()) : existsSync(attack.marker)
  expect(ran, 'o programa da persona executou pelo caminho auto-permitido').toBe(false)
}, 60_000)

it.skipIf(!gitOk())('S3 controles reais: o repositório que o git fez no rascunho e o rascunho-worktree do produto seguem auto-permitidos', () => {
  // o rascunho com o próprio `.git` (git init) e um repositório aninhado feito pelo git
  const draft = join(base, 'own', 'draft')
  mkdirSync(draft, { recursive: true })
  git(draft, 'init', '-q')
  writeFileSync(join(draft, 'a.txt'), 'hello\n')
  git(draft, 'init', '-q', 'nested')
  const own = (command: string, cwd = draft): ActionKind => judgeCommand(command, { draftRoot: draft, cwd }).kind
  expect(own('git add a.txt')).toBe('draft-change')
  expect(own('git status')).toBe('read')
  expect(own('git -C nested status')).toBe('read')
  expect(own('git status', join(draft, '.git'))).toBe('read')
  expect(own('git init sub2')).toBe('draft-change')
  // o rascunho como o produto o cria: `git -C projeto worktree add rascunho -b persona/x HEAD` (o `.git` do rascunho é um ARQUIVO para dentro do projeto)
  const project = join(base, 'project')
  mkdirSync(project, { recursive: true })
  git(project, 'init', '-q')
  git(project, 'commit', '-q', '--allow-empty', '-m', 'init')
  const worktree = join(base, 'worktrees', 'draft')
  git(project, 'worktree', 'add', '-q', worktree, '-b', 'persona/x', 'HEAD')
  const inTree = (command: string): ActionKind => judgeCommand(command, { draftRoot: worktree, cwd: worktree }).kind
  expect(inTree('git status')).toBe('read')
  expect(inTree('git diff --stat')).toBe('read')
  expect(inTree('git add .')).toBe('draft-change')
  // ...mas um `.git` arquivo da persona DENTRO desse rascunho não
  mkdirSync(join(worktree, 'evil', 'objects'), { recursive: true })
  mkdirSync(join(worktree, 'evil', 'refs'), { recursive: true })
  writeFileSync(join(worktree, 'evil', 'HEAD'), 'ref: refs/heads/main\n')
  mkdirSync(join(worktree, 'sub'), { recursive: true })
  writeFileSync(join(worktree, 'sub', '.git'), 'gitdir: ../evil\n')
  expect(inTree('git -C sub add .')).toBe('unknown')
  // e um `.git` arquivo que imita um worktree do PRÓPRIO projeto (fora do rascunho) também não, quando não é o `.git` da raiz do rascunho
  writeFileSync(join(worktree, 'sub', '.git'), `gitdir: ${join(project, '.git', 'worktrees', 'draft').replace(/\\/gu, '/')}\n`)
  expect(inTree('git -C sub add .')).toBe('unknown')
}, 90_000)
