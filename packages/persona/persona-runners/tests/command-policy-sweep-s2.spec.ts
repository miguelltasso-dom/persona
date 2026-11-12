/**
 * Varredura de CP em volta do P0-A/P0-B (Lumen, Keel 17:37; 311 comandos contra `judgeCommand` depois do delta S..S2 do auditor). Sobraram estas classes, todas `read`/`draft-change` (auto-permitido
 * para pessoa, rotina e quem age sem ninguém olhando) escrevendo FORA do rascunho ou executando um programa da persona:
 *  1. ABREVIAÇÃO de opção longa (getopt_long aceita qualquer prefixo único): `sort --out=FILE`, `tree --outp FILE`, `git diff --out=FILE`, `cp --target=DIR`: a regra só conhece o nome inteiro.
 *  2. `sort --compress PROG` (abreviação de `--compress-program`) executa um programa; `rg --hostname-bin PROG --hyperlink-format=default` também.
 *  3. Um `.git` ARQUIVO ("gitdir: evil") escrito por REDIRECIONAMENTO (`echo gitdir: evil > sub/.git`): a regra recusa o que está DENTRO de `.git/` e o `.git` como destino de cp/mv/ren, mas não o redirecionamento
 *     para o `.git` em si. Com uma pasta `evil` comum (HEAD, config com `filter.x.clean`) e `.gitattributes`, `git -C sub add` (draft-change) EXECUTA o programa mesmo com os 4 pares GIT_CONFIG_* do runner
 *     (prova com git de verdade: `.maestri/tmp/lumen/marco/prove-gitdir-filter.mjs`: marcador criado com e sem os pares).
 *  4. O nome curto 8.3 do `.git` no Windows (`GIT~1`): `echo x > GIT~1/hooks/pre-commit`, `cp -r tpl GIT~1/hooks`, `Set-Content GIT~1/config x` passam por fora da regra do `.git`.
 * Escrito VERMELHO primeiro; o conserto é do auditor (Keel 17:37) ou de quem o Keel designar.
 */
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ActionKind } from '../src/authority/authority-table.ts'
import { judgeCommand } from '../src/authority/command-policy.ts'

let base = ''
let draft = ''
beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), 'persona-cp-sweep-'))
  draft = join(base, 'draft')
  mkdirSync(join(draft, 'sub'), { recursive: true })
})
afterAll(() => { rmSync(base, { recursive: true, force: true }) })

const judged = (command: string): ActionKind => judgeCommand(command, { draftRoot: draft, cwd: draft }).kind
/** What the authority table lets through with nobody looking. */
const AUTO: readonly ActionKind[] = ['read', 'draft-change']

describe('opção longa ABREVIADA escreve/executa como a inteira', () => {
  it.each([
    'sort --o=../fora/x a', 'sort --ou ../fora/x a', 'sort --out ../fora/x a', 'sort --outp ../fora/x a', 'sort --outpu=../fora/x a',
    'tree --out ../fora/x', 'tree --outp ../fora/x',
    'git diff --out=../fora/x', 'git log --outp=../fora/x', 'git show --out=../fora/x HEAD', 'git archive --out=../fora/x HEAD',
    'cp --target=../fora a', 'cp --target-d=../fora a', 'mv --target=../fora a',
    'curl --out ../fora/x http://e/x', 'curl --output-d ../fora -O http://e/x',
    'wget --output-doc=../fora/x http://e/x', 'wget --direc=../fora http://e/x',
  ])('%s não é auto-permitido', (command) => {
    expect(AUTO).not.toContain(judged(command))
  })

  it.each([
    'sort --compress ./prog a', 'sort --compress-p=./prog a', 'sort --compress-program=./prog a',
    'rg --hostname-bin ./prog --hyperlink-format=default pat', 'rg --hostname-bin=./prog --hyperlink-format=default pat',
  ])('%s (executa um programa) não é auto-permitido', (command) => {
    expect(AUTO).not.toContain(judged(command))
  })

  it('controles: as leituras comuns continuam leituras', () => {
    expect(judged('sort a')).toBe('read')
    expect(judged('sort -u -k2 a')).toBe('read')
    expect(judged('sort --reverse --numeric-sort a')).toBe('read')
    expect(judged('git diff --stat')).toBe('read')
    expect(judged('git log --oneline')).toBe('read')
    expect(judged('cp a sub/b')).toBe('draft-change')
  })
})

describe('um `.git` ARQUIVO ou o nome curto do `.git` não entram por redirecionamento (P0-B, o resto)', () => {
  it.each([
    'echo gitdir: evil > sub/.git', 'echo gitdir: evil > .git', 'printf "gitdir: evil" > sub/.git', 'cat a > sub/.git', 'echo gitdir: evil >> sub/.git', 'echo x 1> sub/.git',
  ])('%s é outside-change (o repositório novo da persona vem de git init/clone, não de um arquivo dela)', (command) => {
    expect(AUTO).not.toContain(judged(command))
  })

  it.each([
    'echo x > GIT~1/hooks/pre-commit', 'echo x > GIT~1/config', 'echo x > ./GIT~1/hooks/post-commit', 'echo x > sub/GIT~1/config', 'echo x > GIT~2/config',
    'cp -r tpl GIT~1/hooks', 'cp a GIT~1/config', 'mv a GIT~1/hooks/pre-commit', 'mv sub GIT~1', 'Set-Content GIT~1/config x',
  ])('%s (o 8.3 do .git no Windows) é outside-change', (command) => {
    expect(AUTO).not.toContain(judged(command))
  })

  it('controles: arquivos com "git" no nome continuam rascunho', () => {
    expect(judged('echo x > notes/git-notes.md')).toBe('draft-change')
    expect(judged('echo x > sub/.gitignore')).toBe('draft-change')
    expect(judged('echo x > sub/.gitattributes')).toBe('draft-change')
    expect(judged('cp a sub/digit~1.txt')).toBe('draft-change')
  })
})
