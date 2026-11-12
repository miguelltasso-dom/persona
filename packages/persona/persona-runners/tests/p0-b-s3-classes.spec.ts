/**
 * P0-B reaberto (S3, Mend): o que o conserto fecha ALÉM da RED do Lumen (`command-policy-sweep-s2.spec.ts`), por CLASSE e não por caso:
 *  1. destino que ALCANÇA o `.git` pelo diretório de trabalho (`cd .git && echo x > config`) ou pelo 8.3 com hash (`GIxxxx~N`);
 *  2. opção longa pelo nome inteiro que o prefixo único representa (tabela por programa); desconhecida ou ambígua = `unknown`;
 *  3. opções que executam programa ou leem arquivos nomeados dentro de outro arquivo (`rg --hostname-bin`, `sort --files0-from`, `tree -R`, `zip -TT`, `git apply --unsafe-paths`);
 *  4. git só é auto-permitido no repositório do próprio rascunho (`gitRootOf` injetado: `.git` do rascunho, pasta ou arquivo de worktree do produto; nada de `.git` arquivo da persona,
 *     pasta que parece repositório ou repositório fora do rascunho).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ActionKind } from '../src/authority/authority-table.ts'
import { findGitRepository, judgeCommand, type GitRepositoryFound } from '../src/authority/command-policy.ts'

let base = ''
let draft = ''
beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), 'persona-s3-'))
  draft = join(base, 'draft')
  mkdirSync(join(draft, '.git', 'hooks'), { recursive: true })
  mkdirSync(join(draft, '.git', 'objects'), { recursive: true })
  mkdirSync(join(draft, '.git', 'refs', 'heads'), { recursive: true })
  writeFileSync(join(draft, '.git', 'HEAD'), 'ref: refs/heads/main\n')
  mkdirSync(join(draft, 'sub'), { recursive: true })
})
afterAll(() => { rmSync(base, { recursive: true, force: true }) })

const AUTO: readonly ActionKind[] = ['read', 'draft-change']
const judged = (command: string): ActionKind => judgeCommand(command, { draftRoot: draft, cwd: draft }).kind

describe('1. o destino alcança o `.git` pelo diretório de trabalho ou pelo 8.3 com hash', () => {
  it.each([
    'cd .git && echo x > config', 'cd .git/hooks && echo x > pre-commit', 'cd .git && tee config', 'cd sub && echo gitdir: ../evil > .git', 'cd .git && cp ../a config',
    'cd .git && Set-Content config x', 'echo x > GI1A2B~1/config', 'cp a sub/GIC0DE~2/hooks/x', 'cd .git && rm config',
  ])('%s não é auto-permitido', (command) => {
    expect(AUTO).not.toContain(judged(command))
  })
  it('controles', () => {
    expect(judged('cd .git && cat config')).toBe('read')
    expect(judged('cd sub && echo x > notas.md')).toBe('draft-change')
    expect(judged('echo x > sub/gi-notes~1.txt')).toBe('draft-change')
  })
})

describe('2. opção longa = o nome inteiro do prefixo; desconhecida ou ambígua = unknown', () => {
  it.each([
    'cp --t=../fora a', 'cp --target-dir ../fora a', 'cp --sym ../fora/x l', 'cp --li ../fora/x l', 'mv --ta=../fora a',
    'sort --r a', 'sort --frobnicate a', 'grep --frobnicate x a', 'rg --hostname=./prog x', 'uniq --nope a', 'date --se=2020-01-01', 'tree --output x',
  ])('%s não é auto-permitido', (command) => {
    expect(AUTO).not.toContain(judged(command))
  })
  it('controles: abreviações e nomes inteiros inofensivos seguem como eram', () => {
    expect(judged('sort --rev a')).toBe('read')
    expect(judged('grep --ignore-case x a')).toBe('read')
    expect(judged('grep --ignore x a')).toBe('read')
    expect(judged('rg --hidden --glob=*.ts x')).toBe('read')
    expect(judged('uniq --count a')).toBe('read')
    expect(judged('date --iso')).toBe('read')
    expect(judged('cp --recursive a sub/b')).toBe('draft-change')
    expect(judged('mv --verbose a sub/b')).toBe('draft-change')
    expect(judged('ls --all')).toBe('read')
  })
})

describe('3. opções que executam programa ou leem arquivos nomeados em outro arquivo', () => {
  it.each([
    'sort --files0-from=list', 'sort --fil list', 'tree -R -L 2 -H . .', 'tree -LR 2 .', 'zip -T -TT ./prog out.zip a', 'zip --unzip-command ./prog out.zip a',
    'tar -I ./prog -cf x.tar a', 'tar --to-command=./prog -xf x.tar', 'tar --use-compress-program=./prog -cf x.tar a',
    'git apply --unsafe-paths x.patch', 'git apply --unsafe x.patch', 'git apply --build=../fora/idx x.patch', 'git grep --open=./prog x', 'git grep --open-files x',
    'git format-patch --output-d=../fora HEAD~1',
  ])('%s não é auto-permitido', (command) => {
    expect(AUTO).not.toContain(judged(command))
  })
  it('controles', () => {
    expect(judged('tree -r -L 2 .')).toBe('read')
    expect(judged('zip -r out.zip sub')).toBe('draft-change')
    expect(judged('git log --oneline')).toBe('read')
    expect(judged('git checkout --ours a.txt')).toBe('draft-change')
    expect(judged('git diff --stat')).toBe('read')
    expect(judged('git apply x.patch')).toBe('draft-change')
  })
})

describe('4. git só no repositório do próprio rascunho (gitRootOf injetado)', () => {
  // Calculado na coleta (antes do beforeAll): uma pasta que não precisa existir.
  const fakeBase = join(tmpdir(), 'persona-s3-injected')
  const root = join(fakeBase, 'draft')
  const withRepo = (found: GitRepositoryFound | undefined, command: string, seen: string[] = []): ActionKind =>
    judgeCommand(command, { draftRoot: root, cwd: root, gitRootOf: (dir) => { seen.push(dir); return found } }).kind

  it('o `.git` do rascunho (pasta) e o `.git` arquivo de worktree feito pelo produto: auto', () => {
    expect(withRepo({ entry: join(root, '.git'), kind: 'dir' }, 'git status')).toBe('read')
    expect(withRepo({ entry: join(root, '.git'), kind: 'dir' }, 'git commit -m x')).toBe('draft-change')
    expect(withRepo({ entry: join(root, '.git'), kind: 'file', gitdir: join(fakeBase, 'projeto', '.git', 'worktrees', 'draft') }, 'git add .')).toBe('draft-change')
  })
  it('sem repositório o git só erra: segue como era; sem rascunho nada foi escrito pela persona', () => {
    expect(withRepo(undefined, 'git status')).toBe('read')
    const seen: string[] = []
    expect(judgeCommand('git status', { gitRootOf: (dir) => { seen.push(dir); return { entry: dir, kind: 'other' } } }).kind).toBe('read')
    expect(seen).toEqual([])
  })
  it.each([
    ['`.git` arquivo da raiz apontando para pasta da persona', { entry: join(root, '.git'), kind: 'file', gitdir: join(root, 'evil') }],
    ['`.git` arquivo aninhado (gitdir: ../evil)', { entry: join(root, 'sub', '.git'), kind: 'file', gitdir: join(root, 'evil') }],
    ['pasta da persona que parece repositório', { entry: join(root, 'evil'), kind: 'other' }],
    ['repositório FORA do rascunho (acima dele)', { entry: join(fakeBase, '.git'), kind: 'dir' }],
    ['`.git` da raiz que não é repositório válido', { entry: join(root, '.git'), kind: 'other' }],
  ] as const)('%s: unknown', (_name, found) => {
    expect(withRepo(found, 'git add a.txt')).toBe('unknown')
    expect(withRepo(found, 'git status')).toBe('unknown')
    expect(withRepo(found, 'git diff --stat')).toBe('unknown')
  })
  it('o repositório é procurado a partir de onde o git roda (-C / cd); init/help/version não precisam dele; o pior achado vence', () => {
    const seen: string[] = []
    withRepo(undefined, 'git -C sub status', seen)
    expect(seen).toEqual([join(root, 'sub')])
    seen.length = 0
    withRepo(undefined, 'cd sub && git log', seen)
    expect(seen).toEqual([join(root, 'sub')])
    const foreign: GitRepositoryFound = { entry: join(fakeBase, '.git'), kind: 'dir' }
    expect(withRepo(foreign, 'git init')).toBe('draft-change')
    expect(withRepo(foreign, 'git --version')).toBe('read')
    expect(withRepo(foreign, 'git push')).toBe('send')
    expect(withRepo(foreign, 'git reset --hard')).toBe('delete')
  })
})

describe('findGitRepository (a descoberta no disco, como o git faz)', () => {
  it('acha o `.git` pasta válido, segue um `.git` arquivo, pula um `.git` inválido e reconhece a pasta que parece repositório', () => {
    expect(findGitRepository(join(draft, 'sub'))).toEqual({ entry: join(draft, '.git'), kind: 'dir' })
    const fake = join(base, 'fake')
    mkdirSync(join(fake, '.git', 'hooks'), { recursive: true }) // inválido: o git o pula e sobe
    mkdirSync(join(fake, 'w'), { recursive: true })
    writeFileSync(join(fake, 'w', '.git'), 'gitdir: ../evil\n')
    expect(findGitRepository(join(fake, 'w'))).toEqual({ entry: join(fake, 'w', '.git'), kind: 'file', gitdir: join(fake, 'evil') })
    mkdirSync(join(fake, 'evil', 'objects'), { recursive: true })
    writeFileSync(join(fake, 'evil', 'HEAD'), 'ref: refs/heads/main\n')
    expect(findGitRepository(join(fake, 'evil'))).toEqual({ entry: join(fake, 'evil'), kind: 'other' })
    expect(findGitRepository(fake)?.entry).not.toBe(join(fake, '.git'))
  })
})
