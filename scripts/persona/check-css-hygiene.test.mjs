// node --test scripts/persona/check-css-hygiene.test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { analyzeCss, applyBaseline, baselineFrom, collectDefinitions, isClickableSelector, keyOf, loadPostcss, parseArgs, renderText, resolveVar, runCheck } from './check-css-hygiene.mjs'

const CLI = join(dirname(fileURLToPath(import.meta.url)), 'check-css-hygiene.mjs')
const postcss = loadPostcss()
const DIR = 'packages/persona/client-ui-persona/src'
const tmp = () => mkdtempSync(join(tmpdir(), 'csshyg-'))
const put = (root, rel, text) => { const path = join(root, rel); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text) }

/** Analisa um CSS solto. defs = tokens definidos; src = textos de TS/TSX. */
function lint(css, { file = 'x.module.css', defs = {}, src = [] } = {}) {
  const extra = Object.entries(defs).map(([k, v]) => `:root{${k}:${v}}`).join('')
  const found = collectDefinitions({ cssFiles: [{ css: extra + css }], sourceFiles: src, postcss })
  return analyzeCss({ file, css, postcss, defs: found.defs, dynamicPrefixes: found.dynamicPrefixes })
}
const rules = (violations) => violations.map((v) => v.rule)

test('backdrop-filter: qualquer uso reprova (inclui -webkit-); none passa', () => {
  assert.deepEqual(rules(lint('.a{backdrop-filter:blur(8px)}')), ['backdrop-filter'])
  assert.deepEqual(rules(lint('.a{-webkit-backdrop-filter:blur(8px)}')), ['backdrop-filter'])
  assert.deepEqual(lint('.a{backdrop-filter:none}'), [])
})

test('controle-altura: clicável fora de 32/40/48 reprova; selo só de leitura e régua certa passam', () => {
  assert.deepEqual(rules(lint('.chip{height:22px}')), ['controle-altura'])
  assert.deepEqual(rules(lint('.saveButton{min-height:36px}')), ['controle-altura'])
  assert.deepEqual(rules(lint('button{height:28px}')), ['controle-altura'])
  assert.deepEqual(rules(lint('.card{cursor:pointer;height:24px}')), ['controle-altura']) // cursor:pointer = clicável
  assert.deepEqual(rules(lint('[role="tab"]{min-height:30px}')), ['controle-altura'])
  assert.deepEqual(lint('.chip{height:var(--control-h-m)}', { defs: { '--control-h-m': '40px' } }), []) // token da régua (o Quill o cria no :root)
  assert.deepEqual(rules(lint('.chip{height:var(--control-h-m)}')), ['token-indefinido']) // enquanto o token não existir, acusa
  for (const ok of ['.chip{height:32px}', '.chip{height:40px}', '.chip{min-height:48px}', '.badge{height:22px}', '.counter{height:24px}', '.chip svg{height:16px}', '.chip::before{height:20px}', '.tabUnderline::after{height:2px}', '.chip{height:100%}', '.row{cursor:pointer;min-height:56px}', '.chip{height:auto}']) assert.deepEqual(lint(ok), [], ok)
})

test('controle-altura: só o último compound conta (descendente não herda) e :not()/is() não enganam', () => {
  assert.equal(isClickableSelector('.toolbar .icon'), false)
  assert.equal(isClickableSelector('.toolbar .iconButton'), true)
  assert.equal(isClickableSelector('.list > .chip:hover'), true)
  assert.equal(isClickableSelector('.chip svg'), false)
  assert.equal(isClickableSelector('.chip::after'), false)
})

test('token-indefinido: var(--persona-*/--control-*) sem definição reprova; definido em CSS, TSX ou prefixo dinâmico passa', () => {
  const bad = lint('.a{color:var(--persona-nao-existe)} .b{height:var(--control-h-xl)}')
  assert.deepEqual(bad.map((v) => v.detail), ['--persona-nao-existe', '--control-h-xl'])
  assert.deepEqual(lint('.a{color:var(--persona-ok)}', { defs: { '--persona-ok': '#fff' } }), [])
  assert.deepEqual(lint('.a{color:var(--persona-runtime)}', { src: ["<div style={{ '--persona-runtime': tint }} />"] }), [])
  assert.deepEqual(lint('.a{color:var(--persona-tone-ok)}', { src: ['const k = `--persona-tone-${name}`'] }).length, 0)
  assert.deepEqual(lint('.a{color:var(--outro-token)}'), []) // só os dois prefixos da Persona
  assert.equal(lint('.a{color:var(--persona-x, red)}').length, 1) // fallback não conta como definição
})

test('tempo-solto: ms/s/cubic-bezier soltos só em *.module.css; tokens, fallback de var e 0 passam', () => {
  assert.deepEqual(rules(lint('.a{transition:opacity 200ms}')), ['tempo-solto'])
  assert.deepEqual(rules(lint('.a{transition:opacity .2s ease}')), ['tempo-solto'])
  assert.deepEqual(rules(lint('.a{animation:x 1.2s ease-in-out}')), ['tempo-solto'])
  assert.deepEqual(rules(lint('.a{animation-delay:530ms}')), ['tempo-solto'])
  assert.deepEqual(rules(lint('.a{transition-timing-function:cubic-bezier(.2,.8,.2,1)}')), ['tempo-solto'])
  for (const ok of ['.a{transition:opacity var(--motion-base) var(--ease-standard)}', '.a{transition:opacity var(--motion-base, 220ms) var(--ease-standard, ease)}', '.a{transition:none}', '.a{animation-duration:0s}', '.a{transition:opacity 0ms}']) assert.deepEqual(lint(ok), [], ok)
  assert.deepEqual(lint('.a{transition:opacity 200ms}', { file: 'persona-palette.css' }), []) // tokens vivem fora dos módulos
  assert.deepEqual(lint('@media (prefers-reduced-motion: reduce){.a{animation-duration:0.01ms;transition-duration:.01ms}}'), [])
  assert.equal(lint('@media (prefers-reduced-motion: reduce){.a{animation-duration:300ms}}').length, 1)
})

test('animacao-infinita: infinite fora da lista permitida reprova', () => {
  assert.deepEqual(rules(lint('.a{animation:persona-spin var(--m) linear infinite}')), ['animacao-infinita'])
  assert.deepEqual(rules(lint('.a{animation-iteration-count:infinite}')), ['animacao-infinita'])
  assert.deepEqual(lint('.a{animation:persona-rail-pulse var(--m) ease infinite}'), []) // a bolinha de quem trabalha
  assert.deepEqual(lint('.a{animation:persona-rec-pulse var(--m) ease infinite}'), []) // o ponto de gravação (item 20)
  assert.deepEqual(lint('.a{animation:x var(--m) ease 2}'), [])
  assert.deepEqual(lint('.a{animation:x var(--m) ease infinite}', { file: 'x.css' }).map((v) => v.rule), ['animacao-infinita']) // vale também fora de módulo
})

test('texto-pequeno: < 13px reprova (px, rem, font curto, var resolvida); 13px+ passa', () => {
  assert.deepEqual(rules(lint('.a{font-size:12px}')), ['texto-pequeno'])
  assert.deepEqual(rules(lint('.a{font-size:0.75rem}')), ['texto-pequeno'])
  assert.deepEqual(rules(lint('.a{font:800 11px/16px sans-serif}')), ['texto-pequeno'])
  assert.deepEqual(rules(lint('.a{font-size:var(--persona-text-xs)}', { defs: { '--persona-text-xs': '11px' } })), ['texto-pequeno'])
  for (const ok of ['.a{font-size:13px}', '.a{font-size:0.8125rem}', '.a{font-size:1rem}', '.a{font:600 14px/1.4 sans-serif}', '.a{font-size:inherit}', '.a{font-size:var(--x)}']) assert.deepEqual(lint(ok), [], ok)
  assert.equal(resolveVar('var(--a)', new Map([['--a', '11px']])), '11px')
})

test('higiene-ignore: comentário com regra e motivo libera só aquele nó; sem motivo ou regra errada não vale', () => {
  assert.deepEqual(lint('.chip{\n/* higiene-ignore: controle-altura — selo clicável só de leitura em hover */\nheight:22px}'), [])
  assert.deepEqual(lint('/* higiene-ignore: backdrop-filter — vidro do overlay aceito pela Muse */\n.a{backdrop-filter:blur(8px)}'), [])
  assert.equal(lint('.chip{\n/* higiene-ignore: controle-altura */\nheight:22px}').length, 1)
  assert.equal(lint('.chip{\n/* higiene-ignore: texto-pequeno — x */\nheight:22px}').length, 1)
  assert.equal(lint('.chip{height:22px;\nwidth:22px}').length, 1)
})

test('CSS inválido vira achado (não passa em silêncio)', () => {
  assert.deepEqual(rules(lint('.a{color:red')), ['css-invalido'])
})

test('baseline: a dívida antiga é coberta por quantidade; o que passa dela é novo; o que sumiu encolhe', () => {
  const v = (selector, detail = 'd') => ({ rule: 'texto-pequeno', file: 'a.css', line: 1, selector, detail })
  const old = [v('.a'), v('.a'), v('.b')]
  const baseline = baselineFrom(old)
  assert.equal(baseline[keyOf(v('.a'))], 2)
  const same = applyBaseline(old, baseline)
  assert.equal(same.fresh.length, 0)
  assert.equal(same.old.length, 3)
  const more = applyBaseline([...old, v('.a'), v('.c')], baseline)
  assert.deepEqual(more.fresh.map((x) => x.selector), ['.a', '.c'])
  const fewer = applyBaseline([v('.a')], baseline)
  assert.equal(fewer.fresh.length, 0)
  assert.equal(fewer.fixed, 2) // sobraram 1 de .a e 1 de .b no baseline
  assert.equal(applyBaseline([v('.z')], undefined).fresh.length, 1)
})

test('runCheck numa árvore sintética: definições valem para a árvore toda; --files restringe; relatório mostra totais por regra', () => {
  const root = tmp()
  try {
    put(root, `${DIR}/theme/palette.css`, ':root{--persona-ink:#111;--control-h-m:40px}')
    put(root, `${DIR}/chat/A.module.css`, '.chip{height:22px;color:var(--persona-ink)}\n.x{font-size:11px}')
    put(root, `${DIR}/chat/B.module.css`, '.ok{height:32px;color:var(--persona-ink)}')
    put(root, `${DIR}/chat/C.tsx`, 'export const C = () => null')
    const all = runCheck({ root, postcss })
    assert.deepEqual(all.violations.map((x) => `${x.rule}@${x.file.split('/').pop()}`).sort(), ['controle-altura@A.module.css', 'texto-pequeno@A.module.css'])
    assert.equal(all.stats.arquivos, 3)
    const onlyB = runCheck({ root, postcss, files: [`${DIR}/chat/B.module.css`] })
    assert.equal(onlyB.ok, true)
    assert.match(renderText(all), /Totais por regra: controle-altura 1 · backdrop-filter 0 · token-indefinido 0 · tempo-solto 0 · animacao-infinita 0 · texto-pequeno 1/u)
    assert.match(renderText(all), /FALHOU \[controle-altura\] packages\/persona\/client-ui-persona\/src\/chat\/A\.module\.css:1 \.chip/u)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('CLI: baseline grava, depois só regressão nova reprova; baseline não cresce sem --force-baseline; uso errado = 2', () => {
  const root = tmp()
  try {
    put(root, `${DIR}/A.module.css`, '.x{font-size:11px}\n.y{backdrop-filter:blur(2px)}')
    const run = (...args) => spawnSync(process.execPath, [CLI, '--root', root, ...args], { encoding: 'utf8' })
    const baselineFile = join(root, 'scripts/persona/css-hygiene.baseline.json')
    // 1. sem baseline: estrito, tudo reprova
    const strict = run()
    assert.equal(strict.status, 1)
    assert.match(strict.stdout, /FALHOU \[backdrop-filter\]/u)
    // 2. grava a dívida de hoje
    const wrote = run('--write-baseline')
    assert.equal(wrote.status, 0, wrote.stderr)
    assert.equal(existsSync(baselineFile), true)
    assert.equal(Object.keys(JSON.parse(readFileSync(baselineFile, 'utf8')).entries).length, 2)
    // 3. com baseline: a dívida antiga passa
    const withBaseline = run()
    assert.equal(withBaseline.status, 0, withBaseline.stdout)
    assert.match(withBaseline.stdout, /^PASSOU .*0 novo\(s\), 2 de dívida antiga/mu)
    assert.match(run('--all').stdout, /dívida antiga \[backdrop-filter\]/u)
    // 4. regressão nova reprova e o baseline se recusa a crescer
    put(root, `${DIR}/B.module.css`, '.z{font-size:10px}')
    const regress = run()
    assert.equal(regress.status, 1)
    assert.match(regress.stdout, /FALHOU \[texto-pequeno\] .*B\.module\.css:1/u)
    const refuse = run('--write-baseline')
    assert.equal(refuse.status, 1)
    assert.match(refuse.stderr, /só pode ENCOLHER/u)
    assert.equal(run('--write-baseline', '--force-baseline').status, 0)
    // 5. corrigir dívida: continua passando e o baseline encolhe
    put(root, `${DIR}/A.module.css`, '.x{font-size:13px}\n.y{backdrop-filter:blur(2px)}')
    const fixed = run()
    assert.equal(fixed.status, 0)
    assert.match(fixed.stdout, /1 já corrigido/u)
    assert.equal(run('--write-baseline').status, 0)
    assert.equal(Object.keys(JSON.parse(readFileSync(baselineFile, 'utf8')).entries).length, 2) // .y + B.z
    // 6. --report e uso errado
    const reportPath = join(root, 'rel.json')
    run('--report', reportPath)
    assert.equal(JSON.parse(readFileSync(reportPath, 'utf8')).ok, true)
    assert.equal(spawnSync(process.execPath, [CLI, '--root'], { encoding: 'utf8' }).status, 2)
    assert.equal(spawnSync(process.execPath, [CLI, '--root', root, 'solto'], { encoding: 'utf8' }).status, 2)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('parseArgs: tolerante e estrito', () => {
  const args = parseArgs(['--files', 'a.css', 'b.css', '--dir', 'x', '--json', '--all'])
  assert.deepEqual(args.files, ['a.css', 'b.css'])
  assert.equal(args.dir, 'x')
  assert.equal(args.flags.has('json'), true)
  assert.throws(() => parseArgs(['--root']), /precisa de um valor/u)
  assert.throws(() => parseArgs(['solto']), /inesperado/u)
  assert.equal(existsSync(CLI), true)
  assert.equal(typeof readFileSync(CLI, 'utf8'), 'string')
})
