// node --test scripts/persona/check-cleanroom.test.mjs
// Fixtures 100% sintéticas: o "clone" aqui é uma pasta inventada pelo teste; nenhum arquivo do agentes.chat é aberto.
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { collectTargets, fingerprints, hash53, isAllowed, isIgnoredPath, loadAllow, marksInText, namesInText, normalizeLine, parseAddedLines, parseArgs, renderText, runCheck, splitIdentifiers, stringLiterals, jsxTexts } from './check-cleanroom.mjs'

const CLI = join(dirname(fileURLToPath(import.meta.url)), 'check-cleanroom.mjs')
const tmp = () => mkdtempSync(join(tmpdir(), 'cleanroom-'))
const put = (dir, rel, text) => { const path = join(dir, rel); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text) }
const sh = (cwd, ...args) => execFileSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' })

// Três linhas inventadas pelo teste (não vêm de lugar nenhum).
const INVENTED = [
  'const quadroDeAvisos = montarQuadro(listaDeCartoes, ordemCombinada)',
  'const resultadoParcial = somarTudo(quadroDeAvisos.itens, pesoPadrao)',
  'return resultadoParcial.filter((item) => item.valor > limiteDoDia)',
].join('\n')

test('marcas: pega as 5 marcas e variações, sem falso positivo de palavra comum', () => {
  const ids = (text) => marksInText(text).map((m) => m.rule)
  assert.deepEqual(ids('veja agentes.chat'), ['agentes.chat'])
  assert.deepEqual(ids('AGENTES.CHAT'), ['agentes.chat'])
  assert.deepEqual(ids('import x from "agentes-chat/core"'), ['agentes.chat'])
  assert.deepEqual(ids('agenteschat'), ['agenteschat'])
  assert.deepEqual(ids('Codari Global'), ['Codari'])
  assert.deepEqual(ids('const jevClient = 1'), ['Jev'])
  assert.deepEqual(ids('chamar o Jev'), ['Jev'])
  assert.deepEqual(ids('fala com a Lodi'), ['Lodi'])
  assert.deepEqual(ids('LodiBox'), ['Lodi'])
  // português comum e palavras que só contêm as letras
  assert.deepEqual(ids('os agentes chat da equipe'), [])
  assert.deepEqual(ids('Jevons paradox'), [])
  assert.deepEqual(ids('melodia Lodine'), [])
  assert.deepEqual(ids('cojev codarita'), [])
})

test('nomes internos: avisa o vocabulário deles, não palavras vizinhas', () => {
  const ids = (text) => namesInText(text).map((m) => m.rule)
  assert.deepEqual(ids('const unbacked = true'), ['unbacked'])
  assert.deepEqual(ids('endsAsking(texto)'), ['endsAsking'])
  assert.deepEqual(ids('talker.start()'), ['talker'])
  assert.deepEqual(ids('stretch-goal e align-items: stretch'), [])
  assert.deepEqual(ids('findables untriedness'), [])
})

test('normalização e hash ignoram espaço extra, mas não o conteúdo', () => {
  assert.equal(normalizeLine('  a   b\t c  '), 'a b c')
  assert.equal(hash53('abc'), hash53('abc'))
  assert.notEqual(hash53('abc'), hash53('abd'))
})

test('impressões: janela de 3 linhas é igual com indentação/CRLF diferentes; import e linha curta não contam', () => {
  const a = fingerprints(`import { x } from 'y'\n\n${INVENTED}\n`)
  const b = fingerprints(INVENTED.split('\n').map((l) => `      ${l}`).join('\r\n'))
  const keysA = new Set(a.filter((f) => f.kind === 'trecho').map((f) => f.key))
  const keysB = new Set(b.filter((f) => f.kind === 'trecho').map((f) => f.key))
  assert.equal(keysA.size, 1)
  assert.deepEqual([...keysA], [...keysB])
  assert.equal(fingerprints('a\nb\nc\nd').length, 0)
  assert.equal(fingerprints("import { algumaCoisaMuitoLonga, outraCoisaMuitoLonga } from '../caminho/muito/longo'").length, 0)
})

test('impressões: texto de interface longo vira impressão "texto"; URL e caminho não', () => {
  const frase = 'const aviso = "Vou continuar de onde paramos assim que a janela da assinatura voltar."'
  assert.equal(fingerprints(frase).filter((f) => f.kind === 'texto').length, 1)
  assert.equal(fingerprints("const u = 'https://exemplo.com/um/caminho/bem/comprido/que/passa/de/cinquenta/caracteres'").filter((f) => f.kind === 'texto').length, 0)
  assert.equal(stringLiterals('x = `um texto com mais de cinquenta caracteres para o teste de crase aqui ok`').length, 1)
})

test('impressões: PNG em base64 / hash longo não é "texto" nem "linha" (falso positivo da 1ª rodada real)', () => {
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  assert.equal(fingerprints(`const PNG_B64 = '${png}'`).length, 0)
  assert.equal(fingerprints(`const A = '${png}'\nconst B = '${png}'\nconst C = '${png}'`).length, 0)
  assert.equal(fingerprints(`const hash = '${'a1b2c3d4'.repeat(8)}'`).length, 0)
  // frase com poucas palavras também não conta como texto
  assert.equal(fingerprints("const x = 'umapalavrasomuitocomprida-umapalavrasomuitocomprida-outra'").filter((f) => f.kind === 'texto').length, 0)
})

test('stringLiterals: número da linha certo em arquivo com várias linhas (busca binária)', () => {
  const lines = Array.from({ length: 300 }, (_, i) => `const v${i} = ${i}`)
  lines[149] = 'const aviso = "um texto comprido de verdade com bem mais de cinquenta caracteres aqui"'
  lines[250] = 'const outro = `outro texto comprido de verdade com bem mais de cinquenta caracteres\nem duas linhas`'
  const found = stringLiterals(lines.join('\n'))
  assert.deepEqual(found.map((f) => f.line), [150, 251])
})

test('desempenho: arquivo grande (20 mil linhas, 2 mil literais) fingerprints em < 2 s', () => {
  const body = Array.from({ length: 20000 }, (_, i) => (i % 10 === 0 ? `export const t${i} = "mensagem número ${i} com texto suficiente para virar um literal de cinquenta caracteres"` : `const linha${i} = calcular(${i}, outroValor${i}, maisUmArgumento${i})`)).join('\n')
  const started = Date.now()
  const result = fingerprints(body)
  assert.ok(result.length > 1000)
  assert.ok(Date.now() - started < 2000, `demorou ${Date.now() - started} ms`)
})

test('parseAddedLines: só linhas adicionadas, por arquivo', () => {
  const diff = [
    'diff --git a/a.ts b/a.ts', '--- a/a.ts', '+++ b/a.ts', '@@ -1,0 +2,2 @@', '+x', '+y', '@@ -9 +11 @@', '-z', '+w',
    'diff --git a/gone.ts b/gone.ts', '--- a/gone.ts', '+++ /dev/null', '@@ -1,3 +0,0 @@', '-a', '-b', '-c',
  ].join('\n')
  const map = parseAddedLines(diff)
  assert.deepEqual([...map.get('a.ts')].sort((x, y) => x - y), [2, 3, 11])
  assert.equal(map.has('gone.ts'), false)
})

test('caminhos fora do alcance: spec, .maestri, binário, o próprio script; código de persona-spec e do app entram', () => {
  for (const p of ['.tmp-host-results.json', 'packages/x/.tmp-saida.log', '.maestri/inbox/x.md', 'persona-spec/carbon/AGENTES-CHAT.md', 'persona-spec/PLANO-COLHEITA.md', 'node_modules/a/b.js', 'x/logo.png', 'scripts/persona/check-cleanroom.mjs', 'scripts/persona/check-cleanroom.test.mjs', 'scripts/persona/check-cleanroom.allow.json']) assert.equal(isIgnoredPath(p), true, p)
  for (const p of ['persona-spec/context.mjs', 'apps/desktop/src/main.ts', 'packages/persona/client-ui-persona/src/x.css', 'locales/pt-BR.json']) assert.equal(isIgnoredPath(p), false, p)
})

test('runCheck: marca só reprova se estiver numa linha ADICIONADA; arquivo novo vale inteiro', () => {
  const files = { 'a.ts': 'const x = 1 // herdado do Jev\nconst y = 2 // nosso\nconst z = 3 // veja agentes.chat\n', 'novo.ts': '// copiei do Lodi\n' }
  const targets = new Map([['a.ts', new Set([3])], ['novo.ts', 'tudo']])
  const result = runCheck({ targets, readFile: (rel) => files[rel], clone: false })
  assert.equal(result.ok, false)
  assert.deepEqual(result.findings.map((f) => `${f.file}:${f.line}:${f.rule}`), ['a.ts:3:agentes.chat', 'novo.ts:1:Lodi'])
  assert.match(renderText(result), /FALHOU \[marca\] a\.ts:3 — contém "agentes\.chat"/u)
})

test('runCheck: nome do arquivo com marca reprova; ignorados não acusam a si mesmos', () => {
  const targets = new Map([['src/agentes-chat-copia.ts', 'tudo'], ['persona-spec/carbon/AGENTES-CHAT.md', 'tudo'], ['.maestri/inbox/Gauge/x.md', 'tudo']])
  const result = runCheck({ targets, readFile: () => 'agentes.chat Codari Jev Lodi\n', clone: false })
  assert.equal(result.findings.some((f) => f.file === 'src/agentes-chat-copia.ts' && f.onde === 'nome do arquivo'), true)
  assert.equal(result.findings.some((f) => f.file.startsWith('persona-spec') || f.file.startsWith('.maestri')), false)
  assert.equal(result.stats.ignorados, 2)
})

test('runCheck: nome interno é aviso (passa); com --strict-names reprova', () => {
  const targets = new Map([['a.ts', 'tudo']])
  const readFile = () => 'const unbacked = detectar(resposta)\n'
  const soft = runCheck({ targets, readFile, clone: false })
  assert.equal(soft.ok, true)
  assert.equal(soft.warnings.length, 1)
  assert.match(renderText(soft), /^aviso \[nome interno\] a\.ts:1/mu)
  const strict = runCheck({ targets, readFile, clone: false, strictNames: true })
  assert.equal(strict.ok, false)
})

test('allow-list: só vale com motivo; por arquivo exato, por pasta e por regra', () => {
  const item = { file: 'a.ts', kind: 'marca', rule: 'Jev' }
  assert.equal(isAllowed([{ file: 'a.ts' }], item), false) // sem motivo
  assert.equal(isAllowed([{ file: 'a.ts', motivo: ' ' }], item), false)
  assert.equal(isAllowed([{ file: 'a.ts', motivo: 'citação de licença' }], item), true)
  assert.equal(isAllowed([{ file: 'docs/', motivo: 'x' }], { ...item, file: 'docs/b.md' }), true)
  assert.equal(isAllowed([{ file: 'a.ts', regra: 'trecho', motivo: 'x' }], item), false)
  assert.equal(isAllowed([{ file: 'a.ts', regra: 'marca', motivo: 'x' }], item), true)
  assert.equal(isAllowed([{ file: 'a.ts', regra: 'Jev', motivo: 'x' }], item), true)
  const result = runCheck({ targets: new Map([['a.ts', 'tudo']]), readFile: () => 'Jev\n', clone: false, allow: [{ file: 'a.ts', regra: 'marca', motivo: 'teste' }] })
  assert.equal(result.ok, true)
  assert.equal(result.allowed.length, 1)
})

test('clone sintético: trecho idêntico reprova, mostra NOSSO arquivo:linha e o nome do arquivo de lá, nunca o conteúdo', () => {
  const clone = tmp()
  try {
    put(clone, 'packages/engine/src/arquivo-de-la.ts', `import { a } from 'b'\n\n// cabeçalho\n    ${INVENTED.split('\n').join('\n    ')}\nexport const fim = 1\n`)
    put(clone, 'node_modules/x/ignorado.ts', INVENTED)
    put(clone, 'docs/adr/0001.md', INVENTED)
    const ours = { 'nosso.ts': `// intro curta\n${INVENTED}\n`, 'limpo.ts': 'export const total = calcularTotal(itens, desconto, frete, imposto)\n' }
    const result = runCheck({ targets: new Map([['nosso.ts', 'tudo'], ['limpo.ts', 'tudo']]), readFile: (rel) => ours[rel], clone })
    assert.equal(result.ok, false)
    const hit = result.findings.find((f) => f.kind === 'trecho')
    assert.equal(hit.file, 'nosso.ts')
    assert.equal(hit.line, 2)
    assert.equal(hit.clone, 'packages/engine/src/arquivo-de-la.ts')
    assert.equal(result.findings.some((f) => f.file === 'limpo.ts'), false)
    assert.equal(result.stats.cloneArquivos, 1) // só o .ts de fora de node_modules; .md (ADR) não entra
    const text = renderText(result)
    assert.match(text, /FALHOU \[trecho trecho\] nosso\.ts:2-4/u)
    assert.equal(text.includes('quadroDeAvisos'), false, 'o relatório não pode vazar o conteúdo')
  } finally { rmSync(clone, { recursive: true, force: true }) }
})

test('clone sintético: só linhas ADICIONADAS contam (trecho antigo no arquivo editado não acusa)', () => {
  const clone = tmp()
  try {
    put(clone, 'a.ts', INVENTED)
    const body = `${INVENTED}\nconst novidade = 1\n`
    // trecho nas linhas 1-3, adicionada só a 4
    const antigo = runCheck({ targets: new Map([['nosso.ts', new Set([4])]]), readFile: () => body, clone })
    assert.equal(antigo.ok, true)
    const tocado = runCheck({ targets: new Map([['nosso.ts', new Set([2])]]), readFile: () => body, clone })
    assert.equal(tocado.ok, false)
  } finally { rmSync(clone, { recursive: true, force: true }) }
})

test('clone sintético: frase de interface idêntica (texto) reprova; diferença de espaço não escapa', () => {
  const clone = tmp()
  try {
    put(clone, 'ui.tsx', "export const t = 'Seu trabalho continua assim que a janela renovar, sem perder nada.'\n")
    const nosso = "const msg = 'Seu  trabalho continua   assim que a janela renovar, sem perder nada.'\n"
    const result = runCheck({ targets: new Map([['x.ts', 'tudo']]), readFile: () => nosso, clone })
    assert.equal(result.findings.some((f) => f.kind === 'trecho' && f.rule === 'texto'), true)
  } finally { rmSync(clone, { recursive: true, force: true }) }
})

test('cache do índice: 1ª vez refaz, 2ª vem do cache, mudou o clone refaz; mesmos achados que sem cache; nada de conteúdo no disco', () => {
  const clone = tmp()
  const cache = tmp()
  try {
    put(clone, 'a.ts', `// cabeçalho\n${INVENTED}\n`)
    put(clone, 'b.ts', 'export const outra = coisaTotalmenteDiferente(comArgumentos, bemLongosParaPassar)\n')
    const ours = { 'nosso.ts': `${INVENTED}\n` }
    const go = () => runCheck({ targets: new Map([['nosso.ts', 'tudo']]), readFile: (rel) => ours[rel], clone, cacheDir: cache })
    const first = go()
    assert.match(first.stats.cloneStatus, /índice refeito/u)
    assert.equal(first.ok, false)
    const second = go()
    assert.match(second.stats.cloneStatus, /índice em cache/u)
    assert.deepEqual(second.findings.map((f) => `${f.file}:${f.line}:${f.clone}`), first.findings.map((f) => `${f.file}:${f.line}:${f.clone}`))
    const plain = runCheck({ targets: new Map([['nosso.ts', 'tudo']]), readFile: (rel) => ours[rel], clone })
    assert.deepEqual(plain.findings.map((f) => `${f.file}:${f.line}:${f.clone}`), first.findings.map((f) => `${f.file}:${f.line}:${f.clone}`))
    assert.match(plain.stats.cloneStatus, /sem cache/u)
    // o clone mudou (o trecho sumiu de a.ts): assinatura diferente, índice refeito, sem acerto
    writeFileSync(join(clone, 'a.ts'), 'export const agoraDiferente = algoQueNaoTemNadaAVer(emNenhumLugar, deNenhumJeito)\n')
    const third = go()
    assert.match(third.stats.cloneStatus, /índice refeito/u)
    assert.equal(third.ok, true)
    // cache corrompido: refaz em vez de quebrar ou passar em silêncio
    for (const dir of readdirSync(cache)) for (const file of readdirSync(join(cache, dir))) if (file.endsWith('.bin')) writeFileSync(join(cache, dir, file), 'lixo')
    assert.match(go().stats.cloneStatus, /índice refeito/u)
    // o cache guarda só números e nomes de arquivo
    for (const dir of readdirSync(cache)) {
      const meta = readFileSync(join(cache, dir, 'index.json'), 'utf8')
      assert.equal(meta.includes('quadroDeAvisos'), false)
      assert.equal(meta.includes('coisaTotalmenteDiferente'), false)
    }
  } finally { rmSync(clone, { recursive: true, force: true }); rmSync(cache, { recursive: true, force: true }) }
})

test('clone ausente: REPROVA por padrão (falha fechada); só passa quando se diz que é de propósito', () => {
  const targets = new Map([['a.ts', 'tudo']])
  const miss = join(tmpdir(), 'cleanroom-nao-existe')
  const closed = runCheck({ targets, readFile: () => 'ok\n', clone: miss })
  assert.equal(closed.ok, false)
  assert.match(closed.stats.cloneStatus, /clone não encontrado/u)
  assert.equal(closed.findings[0].kind, 'clone')
  const open = runCheck({ targets, readFile: () => 'ok\n', clone: miss, allowMissingClone: true })
  assert.equal(open.ok, true)
  assert.match(open.stats.cloneStatus, /clone não encontrado/u) // passa, mas o relatório continua dizendo que a regra de trecho não rodou
  assert.equal(runCheck({ targets, readFile: () => 'ok\n', clone: false }).ok, true) // --no-clone é a forma explícita de desligar
})

test('P2-03 pontos cegos: a marca dentro de um identificador camelCase (useJev, fetchLodiPlan, CodariClient) reprova; palavra comum continua livre', () => {
  const ids = (text) => marksInText(text).map((m) => m.rule)
  assert.deepEqual(ids('export function useJev() {}'), ['Jev'])
  assert.deepEqual(ids('await fetchLodiPlan(id)'), ['Lodi'])
  assert.deepEqual(ids('new CodariClient()'), ['Codari'])
  assert.deepEqual(ids('const v2Jev = 1'), ['Jev'])
  // continuam livres: as letras sem fronteira de palavra
  assert.deepEqual(ids('const projevento = 1 // Jevons'), [])
  assert.deepEqual(ids('Melodia e GlodiX são só letras'), [])
  assert.deepEqual(ids('subjectiveJevons'), [])
})

test('P2-03 pontos cegos: o nome interno em camelCase/snake/kebab e em qualquer caixa é acusado (answerAskChoices, AskChoices, ask-choices, StatusReply)', () => {
  const ids = (text) => namesInText(text).map((m) => m.rule)
  assert.deepEqual(ids('export async function answerAskChoices(id) {}'), ['ask_choices'])
  assert.deepEqual(ids('type AskChoices = string'), ['ask_choices'])
  assert.deepEqual(ids('const ask_choices = 1'), ['ask_choices'])
  assert.deepEqual(ids('import x from "./ask-choices"'), ['ask_choices'])
  assert.deepEqual(ids('const StatusReply = 1'), ['statusReply'])
  assert.deepEqual(ids('moveToBackground() && ThreadTalker.start()'), ['talker', 'moveToBackground'])
  assert.deepEqual(ids('whoHolds(x)'), ['whoholds'])
  // vizinhos que NÃO são o nome
  assert.deepEqual(ids('const taskChoices = 1; const askedChoices = 2'), [])
  assert.deepEqual(ids('const statusRepliesCount = 1; const talkers = 2'), [])
  assert.deepEqual(ids('askChoicesAside'), ['ask_choices']) // o nome seguido de outra palavra do identificador AINDA é o nome
  assert.equal(splitIdentifiers('answerAskChoices'), 'answer_ask_choices')
})

test('P2-03 pontos cegos: texto SOLTO de JSX (sem aspas, também em várias linhas) entra nas impressões de texto', () => {
  const FRASE = 'Aqui a equipe decide em conjunto o que fazer com cada pedido que chegou'
  const solto = `<p className="x">${FRASE}.</p>`
  assert.equal(jsxTexts(solto).some((item) => item.value.startsWith('Aqui a equipe')), true)
  const multi = `<div>\n  <p>\n    ${FRASE},\n    sempre com a pessoa por perto.\n  </p>\n</div>`
  assert.equal(jsxTexts(multi).length > 0, true)
  // a impressão do JSX é a MESMA de uma string com a mesma frase: um arquivo nosso com `<p>frase</p>` casa com `const t = "frase"` do clone
  const asJsx = fingerprints(`export const A = () => <p>${FRASE}.</p>\n`).filter((fp) => fp.kind === 'texto').map((fp) => fp.key)
  const asString = fingerprints(`const t = "${FRASE}."\n`).filter((fp) => fp.kind === 'texto').map((fp) => fp.key)
  assert.equal(asJsx.some((key) => asString.includes(key)), true)
  // expressão `{...}` e atributo não viram texto; frase curta também não
  assert.deepEqual(jsxTexts('<p>{valor}</p><b>oi</b>'), [])
})

test('P2-03 pontos cegos: o texto JSX idêntico ao do clone reprova de ponta a ponta (clone sintético)', () => {
  const clone = mkdtempSync(join(tmpdir(), 'cleanroom-jsx-clone-'))
  const FRASE = 'Aqui a equipe decide em conjunto o que fazer com cada pedido que chegou ate agora'
  try {
    mkdirSync(join(clone, 'src'), { recursive: true })
    writeFileSync(join(clone, 'src', 'Tela.tsx'), `export const T = () => (\n  <section>\n    <p>${FRASE}.</p>\n  </section>\n)\n`)
    const targets = new Map([['nosso/Aviso.tsx', 'tudo']])
    const nosso = `export const Aviso = () => <p>${FRASE}.</p>\n`
    const result = runCheck({ targets, readFile: () => nosso, clone })
    assert.equal(result.ok, false)
    assert.equal(result.findings.some((item) => item.kind === 'trecho' && item.rule === 'texto'), true)
    const limpo = runCheck({ targets, readFile: () => 'export const Aviso = () => <p>Outro texto inteiramente diferente e proprio da nossa tela de avisos.</p>\n', clone })
    assert.equal(limpo.ok, true)
  } finally { rmSync(clone, { recursive: true, force: true }) }
})

test('git de verdade: pega modificado, staged e novo; ignora apagado e linha antiga', () => {
  const repo = tmp()
  try {
    sh(repo, 'init', '-q')
    put(repo, 'velho.ts', 'const legado = 1 // já tinha Jev aqui antes\n')
    put(repo, 'apagado.ts', 'x\n')
    sh(repo, 'add', '-A'); sh(repo, 'commit', '-q', '-m', 'base')
    put(repo, 'velho.ts', 'const legado = 1 // já tinha Jev aqui antes\nconst nova = 2 // agora com Codari\n')
    sh(repo, 'rm', '-q', 'apagado.ts')
    put(repo, 'src/novo.ts', '// do Lodi\n')
    put(repo, 'persona-spec/doc.md', 'agentes.chat é só citação aqui\n')
    sh(repo, 'add', 'velho.ts') // staged
    const targets = collectTargets({ root: repo })
    assert.deepEqual([...targets.keys()].sort(), ['persona-spec/doc.md', 'src/novo.ts', 'velho.ts'])
    const result = runCheck({ root: repo, clone: false })
    assert.deepEqual(result.findings.map((f) => `${f.file}:${f.line}:${f.rule}`).sort(), ['src/novo.ts:1:Lodi', 'velho.ts:2:Codari'])
  } finally { rmSync(repo, { recursive: true, force: true }) }
})

test('git de verdade: --base compara com a ref (inclui o já commitado)', () => {
  const repo = tmp()
  try {
    sh(repo, 'init', '-q', '-b', 'main')
    put(repo, 'a.ts', 'const a = 1\n')
    sh(repo, 'add', '-A'); sh(repo, 'commit', '-q', '-m', 'base')
    sh(repo, 'checkout', '-q', '-b', 'item')
    put(repo, 'a.ts', 'const a = 1\n// ideia do agenteschat\n')
    sh(repo, 'add', '-A'); sh(repo, 'commit', '-q', '-m', 'item')
    assert.equal(runCheck({ root: repo, clone: false }).ok, true, 'contra o HEAD não há mais nada')
    const result = runCheck({ root: repo, base: 'main', clone: false })
    assert.deepEqual(result.findings.map((f) => `${f.file}:${f.line}:${f.rule}`), ['a.ts:2:agenteschat'])
  } finally { rmSync(repo, { recursive: true, force: true }) }
})

test('CLI: saída 0 limpo, 1 reprovado, 2 uso errado; --report grava JSON; --files checa só o que foi pedido', () => {
  const repo = tmp()
  try {
    sh(repo, 'init', '-q')
    put(repo, 'ok.ts', 'const a = 1\n')
    sh(repo, 'add', '-A'); sh(repo, 'commit', '-q', '-m', 'base')
    const run = (...args) => spawnSync(process.execPath, [CLI, '--root', repo, '--no-clone', ...args], { encoding: 'utf8' })
    const clean = run()
    assert.equal(clean.status, 0)
    assert.match(clean.stdout, /^PASSOU/mu)
    put(repo, 'sujo.ts', '// Codari\n')
    const report = join(repo, '..', `cleanroom-report-${Date.now()}.json`)
    const dirty = run('--report', report)
    assert.equal(dirty.status, 1)
    assert.match(dirty.stdout, /FALHOU \[marca\] sujo\.ts:1/u)
    assert.equal(JSON.parse(execFileSync(process.execPath, ['-e', `process.stdout.write(require('fs').readFileSync(${JSON.stringify(report)},'utf8'))`], { encoding: 'utf8' })).ok, false)
    rmSync(report, { force: true })
    assert.equal(run('--files', 'ok.ts').status, 0)
    assert.equal(run('--files', 'sujo.ts').status, 1)
    assert.equal(run('--quiet').status, 1)
    assert.equal(run('--json').status, 1)
    assert.equal(spawnSync(process.execPath, [CLI, '--root'], { encoding: 'utf8' }).status, 2)
    assert.equal(spawnSync(process.execPath, [CLI, 'solto'], { encoding: 'utf8' }).status, 2)
  } finally { rmSync(repo, { recursive: true, force: true }) }
})

test('--files aceita pasta (recursivo) e recusa caminho inexistente em vez de passar em silêncio', () => {
  const dir = tmp()
  try {
    put(dir, 'pasta/a.ts', 'const a = 1\n')
    put(dir, 'pasta/sub/b.ts', '// do Jev\n')
    put(dir, 'pasta/node_modules/x.js', '// Jev\n')
    const targets = collectTargets({ root: dir, files: ['pasta'] })
    assert.deepEqual([...targets.keys()].sort(), ['pasta/a.ts', 'pasta/sub/b.ts'])
    assert.equal(runCheck({ root: dir, files: ['pasta'], clone: false }).findings.length, 1)
    assert.throws(() => collectTargets({ root: dir, files: ['pasta/nao-existe.ts'] }), /não existe/u)
    const cli = spawnSync(process.execPath, [CLI, '--root', dir, '--no-clone', '--files', 'pasta/erro-de-digitacao'], { encoding: 'utf8' })
    assert.equal(cli.status, 2)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('parseArgs e loadAllow: tolerantes', () => {
  const args = parseArgs(['--files', 'a', 'b', '--base', 'x', '--json'])
  assert.deepEqual(args.files, ['a', 'b'])
  assert.equal(args.base, 'x')
  assert.equal(args.flags.has('json'), true)
  assert.deepEqual(loadAllow(join(tmpdir(), 'cleanroom-nao-existe.json')), [])
})
