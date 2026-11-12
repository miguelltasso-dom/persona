// P0-04 do Carbon (colheita-s1), escrito pelo Gauge como RED em 12/11 03:40 e verde com o conserto do Tally (03:48). Mantido como spec: casos adicionais e CONTROLES que o conserto não pode bloquear.
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isSecretPath, judgeCommand } from '../src/authority/command-policy.ts'
import type { ActionKind } from '../src/authority/authority-table.ts'

/**
 * P0-04 · bypass do porteiro de comandos. Cada caso abaixo foi MEDIDO contra `judgeCommand` de hoje (sonda 03:35) e é julgado como `draft-change` ou `read` (= `allow` sem perguntar),
 * mas escreve/lê FORA do rascunho ou escreve onde executa código:
 *  1-3. `isFlag` (command-policy.ts:290) trata todo argumento que começa com `-` como flag inofensiva: `-Destination:C:\…`, `-Path:C:\…` e `--target-directory=C:/…` somem da checagem de escopo;
 *  4.   `git worktree add "C:/Users/…/Meus Documentos/escape"`: caminho com ESPAÇO é ignorado em comando `git` (`!arg.text.includes(' ')`, ~581);
 *  5.   `type C:\Users\migue\.ssh.\id_rsa.`: ponto final de segmento Win32 (`.ssh.` = `.ssh`) escapa de SECRET_PATHS;
 *  6-7. escrita em `.git/hooks/*` (redirect ou Set-Content) é `draft-change`: o próximo `git commit` executa o hook = código arbitrário sem inspeção;
 *  8.   SEM rascunho (`draftRoot` ausente) `git add .` é `draft-change` (a regra diz: sem rascunho nada pode ser alterado).
 * Esperado: nada disso é `read`/`draft-change`; falha fechado (`outside-change`, `delete`, `secret`, `never` ou `unknown`). Os CONTROLES (que já passam hoje) garantem que o conserto não bloqueia o legítimo.
 */
let base = ''
let draft = ''
beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), 'persona-p004-'))
  draft = join(base, 'rascunho')
  mkdirSync(join(draft, 'sub'), { recursive: true })
  mkdirSync(join(draft, '.git', 'hooks'), { recursive: true })
})
afterAll(() => { rmSync(base, { recursive: true, force: true }) })

const kindOf = (command: string, withDraft = true): ActionKind => judgeCommand(command, withDraft ? { draftRoot: draft, cwd: draft } : {}).kind
const HARMLESS: ReadonlySet<ActionKind> = new Set<ActionKind>(['read', 'draft-change'])

describe('P0-04: o que escapa do rascunho NÃO é aprovado como read/draft-change', () => {
  it.each([
    ['PowerShell -Destination:C:\\… (valor colado ao parâmetro)', 'Copy-Item rascunho.txt -Destination:C:\\Users\\migue\\Desktop\\fora.txt'],
    ['PowerShell -Path:C:\\… + build', 'Remove-Item -Path:C:\\Users\\migue\\Documents\\importante.docx build'],
    ['cp --target-directory=C:/… (valor colado à opção)', 'cp --target-directory=C:/Users/migue/Desktop a b'],
    ['git worktree add com espaço no caminho', 'git worktree add "C:/Users/migue/Meus Documentos/escape"'],
    ['escrita em .git/hooks por redirecionamento', 'echo evil > .git/hooks/pre-commit'],
    ['escrita em .git/hooks por Set-Content', 'Set-Content .git/hooks/pre-commit "evil"'],
  ])('%s', (_name, command) => {
    expect(HARMLESS.has(kindOf(command)), `${command} → ${kindOf(command)}`).toBe(false)
  })

  it('sem rascunho nada pode ser alterado: "git add ." é recusado/pergunta, não draft-change', () => {
    expect(HARMLESS.has(kindOf('git add .', false)), `git add . sem rascunho → ${kindOf('git add .', false)}`).toBe(false)
  })
})

describe('P0-04: segredos com ponto final de segmento Win32', () => {
  it('"type C:\\Users\\migue\\.ssh.\\id_rsa." não é leitura inofensiva', () => {
    expect(HARMLESS.has(kindOf('type C:\\Users\\migue\\.ssh.\\id_rsa.'))).toBe(false)
  })
  it('isSecretPath normaliza ponto/espaço final do segmento (.ssh. = .ssh)', () => {
    expect(isSecretPath('C:\\Users\\migue\\.ssh.\\id_rsa.')).toBe(true)
    expect(isSecretPath('C:/Users/migue/.ssh./id_rsa')).toBe(true)
  })
})

describe('CONTROLES: o legítimo continua funcionando depois do conserto (estes já passam hoje)', () => {
  it.each([
    ['escrever dentro do rascunho', 'Set-Content notas.txt "oi"', 'draft-change'],
    ['-Destination dentro do rascunho', 'Copy-Item a.txt -Destination:sub/b.txt', 'draft-change'],
    ['--target-directory dentro do rascunho', 'cp --target-directory=sub a b', 'draft-change'],
    ['ler um arquivo', 'cat README.md', 'read'],
    ['git status', 'git status', 'read'],
  ] as const)('%s', (_name, command, expected) => {
    expect(kindOf(command)).toBe(expected)
  })
})
