// Testes do PRÉ-ACEITE MECÂNICO: regras puras (lib), leitor dos logs antigos, linha de comando de ponta a ponta e a sonda numa página de verdade.
//   node --test scripts/persona/preaccept.test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { renderMarkdown } from './preaccept-lib.mjs'
import { articleBeforePersona, buildReport, evaluateScene, fileNameFor, findAtTitles, findProhibited, minBytesFor, parseLegacyLog, parseLegacyReportJson, plan, verdictOf, MIN_PNG_BYTES } from './preaccept-lib.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const rules = (text, options) => findProhibited(text, options).map(item => item.rule)

test('proibidos: cada item da lista da Muse é pego', () => {
  const cases = {
    maestro: 'Fale com o Maestro agora',
    mcp: 'Conector MCP ligado',
    allowlist: 'Edite a allowlist',
    runner: 'O runner caiu',
    harness: 'Modo harness',
    slug: 'o slug da persona',
    undefined: 'Olá undefined',
    null: 'valor null aqui',
    nan: 'Total: NaN itens',
    object: 'Resposta [object Object]',
    todo: 'TODO escrever',
    lorem: 'Lorem ipsum dolor',
    mock: 'dados mock',
    fixture: 'uma fixture qualquer',
    'cota-nao-medida': 'Cota não medida',
    'skill-ensinada': 'Skill ensinada: copywriting',
    marcador: 'texto [[task-proposal:{}]]',
    'persona-tool': 'chamou persona_create_task',
    'em-andamento-avulso': 'Em andamento: Campanha',
    'us-dolar': 'Custa US$ 4,00',
    dolar: 'Gastou $ 12 hoje',
    'autor-com-dois-pontos': 'Dividi assim team:split pronto',
    'id-hex': 'tarefa 9ba441c2dc9e feita',
  }
  for (const [rule, text] of Object.entries(cases)) assert.ok(rules(text).includes(rule), `${rule} deveria bater em: ${text}`)
})

test('proibidos: texto normal não dispara (horas, URLs, palavras comuns, números)', () => {
  const ok = [
    'Hoje às 12:30 a Nina terminou',
    'Veja https://exemplo.com/ajuda',
    'Aprovações · 3 pendentes',
    'Em andamento · 2 tarefas',
    'Pedi ajuda à Nina: revisar o texto',
    'Fachada do prédio decade 1998 abcdef',
    'R$ 12,50 no mês',
    'Documento nulo e indefinido',
    'Conversa com a equipe sobre 20261105',
  ]
  for (const text of ok) assert.deepEqual(rules(text, { allowCurrency: false }).filter(rule => rule !== 'dolar'), [], `não deveria bater: ${text}`)
  assert.deepEqual(rules('R$ 12,50 no mês'), [], 'R$ não é "$ + número"')
})

test('proibidos: "$" solto só passa quando a cena mostra dinheiro de verdade', () => {
  assert.ok(rules('Plano $ 20 por mês').includes('dolar'))
  assert.ok(!rules('Plano $ 20 por mês', { allowCurrency: true }).includes('dolar'))
  assert.ok(rules('Plano US$ 20', { allowCurrency: true }).includes('us-dolar'), 'US$ nunca passa')
})

test('id hex: precisa de letra e de dígito, e de 8 ou mais caracteres', () => {
  assert.ok(rules('id 3f9a1c0b7e usado').includes('id-hex'))
  assert.ok(!rules('feedbeef não é id').includes('id-hex'), 'só letras: palavra')
  assert.ok(!rules('telefone 11987654321').includes('id-hex'), 'só dígitos: número')
  assert.ok(!rules('id 3f9a1c0 curto').includes('id-hex'), '7 caracteres')
})

test("'@nome' no começo de título de tarefa", () => {
  assert.equal(findAtTitles(['@Nina revisar texto', 'Revisar texto com @Nina']).length, 1)
  assert.equal(findAtTitles(['Campanha de lançamento']).length, 0)
  // O subtítulo do cartão da persona ("@handle · cargo · setor", PERSONA-CARD-SPEC) não é título de tarefa (Prism 05:00).
  assert.equal(findAtTitles(['@atlas · Coordenação', '@nina · Redação · Marketing']).length, 0)
  assert.equal(findAtTitles(['@atlas revisar o plano']).length, 1)
})

test('artigo antes de nome de persona em texto gerado pelo app: o que é artigo sem dúvida reprova', () => {
  const roster = ['Nina', 'Atlas', 'Bia']
  for (const text of ['Dividi com a Nina', 'Peça ao o Atlas', 'A Bia terminou', 'pediu para o Atlas revisar', '(a Nina) respondeu', 'Atlas e a Bia', 'Pedi para a Nina', 'Resumo\na Nina terminou', 'Equipe: o Atlas']) {
    const found = articleBeforePersona(text, roster)
    assert.ok(found.length >= 1 && found.every(item => item.severity === 'falhou'), text)
  }
  for (const text of ['Nina terminou', 'Pedi ajuda à Nina', 'a Ninazinha', 'a sala do Atlas', 'Revisado por Bia', 'Sobre a Ninaa']) {
    assert.equal(articleBeforePersona(text, roster).length, 0, text)
  }
})

test('"a" depois de verbo ou substantivo ("pediu a Téo", "Ensinar a Nina") é preposição na maioria dos casos: aviso, não reprova', () => {
  const roster = ['Nina', 'Téo', 'Bia']
  for (const text of ['Bia pediu a Téo “Arte da home”', 'Bia pediu ajuda a Téo: revisar', 'Ensinar a Nina']) {
    const found = articleBeforePersona(text, roster)
    assert.equal(found.length, 1, text)
    assert.equal(found[0].severity, 'aviso', text)
  }
  const checks = evaluateScene(row({ expectFoliage: false }), { png: PNG, probe: cleanProbe({ text: 'Liberar o Gmail para Téo\nBia pediu a Téo “Arte da home”' }) }, { roster })
  assert.deepEqual(failing(checks), [], 'não reprova')
  const artigo = checks.find(item => item.check === 'artigo')
  assert.equal(artigo.status, 'ok')
  assert.match(artigo.detail, /^aviso:/u)
  const manifest = { owner: 'T', scenes: ['s'], shell: false, viewports: ['1440x900'] }
  const rows = plan(manifest)
  const results = new Map(rows.map(item => [item.file, { checks: evaluateScene(item, { png: PNG, probe: cleanProbe({ darkTheme: item.scheme === 'dark', text: 'Bia pediu a Téo tudo' }) }, { roster }), verdict: 'PASSOU' }]))
  const report = buildReport(manifest, rows, results)
  assert.equal(report.warnings.length, 1, 'uma linha por cena + checagem + texto, nos dois temas')
  assert.deepEqual(report.readyForMuse.map(item => item.scene), ['s'], 'aviso não tira a cena do "pronto"')
})

test('plano: cena × tema × tamanho, com molde de nome por dono', () => {
  const manifest = { scenes: ['a', { id: 'b', allowCurrency: true }] }
  const rows = plan(manifest)
  assert.equal(rows.length, 12)
  assert.equal(rows[0].file, 'a-light-1440x900')
  assert.ok(rows.find(row => row.scene === 'b').allowCurrency)
  assert.equal(rows.filter(row => row.expectFoliage).length, 8, 'folhagem só a 1440 e 960')
  const prism = { fileTemplate: '{scheme}-{viewport}-{scene}', viewportNames: { '1440x900': '1440', '960x640': '960' }, scenes: ['geral'] }
  assert.equal(fileNameFor(prism, 'geral', 'dark', '1440x900'), 'dark-1440-geral')
  assert.equal(plan({ ...prism, shell: false })[0].expectFoliage, false)
  const gauge = { fileTemplate: 'dia-{scene}-{scheme}', schemeNames: { light: 'claro', dark: 'escuro' }, viewports: ['unico'], scenes: ['01'] }
  assert.deepEqual(plan(gauge).map(row => row.file), ['dia-01-claro', 'dia-01-escuro'])
})

const PNG = { bytes: MIN_PNG_BYTES + 1, width: 1440, height: 900 }
const cleanProbe = (extra = {}) => ({
  text: 'Aprovações\nTudo certo por aqui',
  taskTitles: ['Aprovações'],
  brokenImages: [],
  emptyIcons: [],
  smallTargets: [],
  dialogs: [],
  foliageVisible: true,
  foliageImages: 2,
  darkTheme: false,
  overflowX: 0,
  consoleErrors: [],
  axe: [],
  focus: { visible: true, element: 'button “Aceitar”' },
  ...extra,
})
const row = (extra = {}) => ({ scene: 'aprovacoes', scheme: 'light', viewport: '1440x900', file: 'aprovacoes-light-1440x900', allowCurrency: false, expectFoliage: true, ...extra })
const failing = (checks) => checks.filter(item => item.status === 'falhou').map(item => item.check)

test('avatar de retrato em inicial vira AVISO (D-069: persona nunca é letra); sem o campo (sonda antiga) não há aviso; imagem quebrada segue reprovando', () => {
  const checks = evaluateScene(row(), { png: PNG, probe: cleanProbe({ initialsAvatars: ['N', 'T', 'N'] }) })
  assert.deepEqual(failing(checks), [])
  assert.equal(verdictOf(checks), 'PASSOU')
  const imagens = checks.find(item => item.check === 'imagens')
  assert.match(imagens.detail, /^aviso: 3 avatar\(es\) de retrato em inicial/u)
  assert.match(imagens.detail, /“N” “T”/u)
  const report = buildReport({ owner: 'x' }, [row()], new Map([[row().file, { checks, verdict: 'PASSOU' }]]))
  assert.equal(report.warnings.length, 1)
  assert.equal(report.warnings[0].check, 'imagens')
  assert.equal(evaluateScene(row(), { png: PNG, probe: cleanProbe() }).find(item => item.check === 'imagens').detail, '')
  assert.equal(failing(evaluateScene(row(), { png: PNG, probe: cleanProbe({ brokenImages: ['sem pixels: x'], initialsAvatars: ['N'] }) })).includes('imagens'), true)
})

test('cena limpa passa nas 13 checagens', () => {
  const checks = evaluateScene(row(), { png: PNG, probe: cleanProbe() })
  assert.equal(verdictOf(checks), 'PASSOU', JSON.stringify(checks.filter(item => item.status !== 'ok')))
  assert.equal(checks.length, 13)
})

test('cena rejeitada pela Muse (manifesto `rejected`) nunca volta como pronta, mesmo com as 13 checagens limpas (Quill 06:15)', () => {
  const manifest = { owner: 'T', scenes: ['boa', { id: 'ruim', rejected: 'mostra a barra de regra 1 sobre a própria lista' }], shell: false, viewports: ['1440x900'] }
  const rows = plan(manifest)
  assert.ok(rows.filter(item => item.scene === 'ruim').every(item => item.rejected !== undefined))
  assert.ok(rows.filter(item => item.scene === 'boa').every(item => item.rejected === undefined))
  const results = new Map(rows.map((item) => {
    const checks = evaluateScene(item, { png: PNG, probe: cleanProbe({ darkTheme: item.scheme === 'dark' }) })
    return [item.file, { checks, verdict: verdictOf(checks) }]
  }))
  const report = buildReport(manifest, rows, results)
  assert.deepEqual(report.readyForMuse.map(item => item.scene), ['boa'])
  assert.deepEqual(report.notReady.map(item => [item.scene, item.verdict]), [['ruim', 'FALHOU']])
  const md = renderMarkdown(report)
  assert.match(md, /ruim.*rejeitada: mostra a barra de regra 1/su)
})

test('diálogo: a caixa inteira e o rodapé cabem na janela (Quill 06:00); sonda v1 só avisa', () => {
  const cutDialog = { label: 'Adicionar conta', cut: ['base 120 px abaixo da janela', 'último controle “Continuar” fora da janela'] }
  const checks = evaluateScene(row({ expectFoliage: false }), { png: PNG, probe: cleanProbe({ dialogs: [cutDialog] }) })
  assert.deepEqual(failing(checks), ['dialogo'])
  assert.match(checks.find(item => item.check === 'dialogo').detail, /Adicionar conta.*base 120 px.*Continuar/u)
  assert.deepEqual(failing(evaluateScene(row({ expectFoliage: false }), { png: PNG, probe: cleanProbe({ dialogs: [{ label: 'Ok', cut: [] }] }) })), [])
  // Sidecar antigo (sem `dialogs`): não bloqueia, vira um aviso único do lote.
  const { dialogs: _omit, ...v1 } = cleanProbe()
  const old = evaluateScene(row({ expectFoliage: false }), { png: PNG, probe: v1 })
  assert.deepEqual(failing(old), [])
  assert.match(old.find(item => item.check === 'dialogo').detail, /^aviso: sidecar da sonda v1/u)
  const manifest = { owner: 'T', scenes: ['a', 'b'], shell: false, viewports: ['1440x900'] }
  const rows = plan(manifest)
  const results = new Map(rows.map(item => [item.file, { checks: evaluateScene(item, { png: PNG, probe: { ...v1, darkTheme: item.scheme === 'dark' } }), verdict: 'PASSOU' }]))
  const report = buildReport(manifest, rows, results)
  assert.equal(report.warnings.filter(item => item.check === 'dialogo').length, 1, 'um aviso para o lote, não um por cena')
  assert.match(report.warnings[0].scene, /2 cena/u)
})

test('alvos < 24 px que o target-size aceita viram AVISO (o axe é o veredito); o que o axe reprova segue reprovando', () => {
  const accepted = [{ tag: 'a', label: 'Ver o comando', w: 80, h: 20 }]
  const ok = evaluateScene(row({ expectFoliage: false }), { png: PNG, probe: cleanProbe({ smallTargets: accepted }) })
  assert.deepEqual(failing(ok), [])
  assert.match(ok.find(item => item.check === 'alvos').detail, /^aviso: 1 alvo\(s\) < 24 px.*Ver o comando.*80×20/u)
  const bad = evaluateScene(row({ expectFoliage: false }), { png: PNG, probe: cleanProbe({ smallTargets: accepted, axe: [{ id: 'target-size', impact: 'serious', nodes: 1, sample: ['a.x'] }] }) })
  assert.deepEqual(failing(bad), ['alvos'])
})

test('cada falha aparece na checagem certa', () => {
  const run = (probeExtra, rowExtra, pngValue = PNG) => failing(evaluateScene(row(rowExtra), { png: pngValue === null ? undefined : pngValue, probe: cleanProbe(probeExtra) }))
  assert.deepEqual(run({}, {}, null), ['cobertura'])
  assert.deepEqual(run({}, {}, { bytes: 500 }), ['cobertura'])
  assert.deepEqual(run({ axe: [{ id: 'list', impact: 'serious', nodes: 1 }] }), ['axe'])
  assert.deepEqual(run({ axe: [{ id: 'color-contrast', impact: 'minor', nodes: 1 }] }), [], 'aviso não reprova')
  assert.deepEqual(run({ axe: [{ id: 'target-size', impact: 'serious', nodes: 2, sample: ['button.x'] }] }), ['alvos'])
  assert.deepEqual(run({ overflowX: 14 }), ['overflow'])
  assert.deepEqual(run({ consoleErrors: ['Failed to fetch'] }), ['console'])
  assert.deepEqual(run({ text: 'Bem-vindo, undefined' }), ['proibidos'])
  assert.deepEqual(run({ taskTitles: ['@Nina revisar'] }), ['proibidos'])
  assert.deepEqual(run({ text: 'Dividi com a Nina' }), ['artigo'])
  assert.deepEqual(run({ darkTheme: true }), ['tema'])
  assert.deepEqual(run({ foliageVisible: false }), ['folhagem'])
  assert.deepEqual(run({ foliageVisible: false }, { expectFoliage: false }), [], 'sem folhagem esperada a 200%')
  assert.deepEqual(run({ brokenImages: ['sem pixels: /x.png'] }), ['imagens'])
  assert.deepEqual(run({ emptyIcons: ['<svg> vazio'] }), ['icones'])
  assert.deepEqual(run({ focus: { visible: false, element: 'button' } }), ['foco'])
  assert.deepEqual(run({ text: '   ' }), ['cobertura'], 'tela sem texto é página em branco')
})

test('piso de "imagem em branco" cai com a área (cartão recortado comprime mais que a janela inteira)', () => {
  assert.equal(minBytesFor({ bytes: 1, width: 1440, height: 900 }), MIN_PNG_BYTES)
  assert.equal(minBytesFor({ bytes: 1, width: 640, height: 300 }), 1920)
  assert.equal(minBytesFor({ bytes: 1, width: 20, height: 20 }), 1500, 'nunca abaixo de 1500 B')
  assert.equal(minBytesFor({ bytes: 1 }), MIN_PNG_BYTES, 'sem dimensões: o piso cheio')
  const small = { bytes: 10_183, width: 640, height: 300 }
  assert.deepEqual(failing(evaluateScene(row(), { png: small, probe: cleanProbe() })), [])
  assert.deepEqual(failing(evaluateScene(row(), { png: { ...small, bytes: 900 }, probe: cleanProbe() })), ['cobertura'])
})

test('tema escuro confere com o body', () => {
  assert.deepEqual(failing(evaluateScene(row({ scheme: 'dark' }), { png: PNG, probe: cleanProbe({ darkTheme: true }) })), [])
  assert.deepEqual(failing(evaluateScene(row({ scheme: 'dark' }), { png: PNG, probe: cleanProbe({ darkTheme: false }) })), ['tema'])
})

test('sem sonda e sem log: INCOMPLETO, nunca PASSOU; com imagem faltando: FALHOU', () => {
  assert.equal(verdictOf(evaluateScene(row(), { png: PNG })), 'INCOMPLETO')
  assert.equal(verdictOf(evaluateScene(row(), { png: undefined })), 'FALHOU')
})

test('tamanho do PNG confere quando o manifesto diz', () => {
  const sizes = { '1440x900': [1440, 900] }
  assert.deepEqual(failing(evaluateScene(row(), { png: { ...PNG, width: 800 }, probe: cleanProbe() }, { sizes })), ['cobertura'])
  assert.deepEqual(failing(evaluateScene(row(), { png: PNG, probe: cleanProbe() }, { sizes })), [])
})

test('log antigo do Ember: axe, overflow e (por inferência) target-size', () => {
  const log = [
    '[thread-cards light 1440x900] axe=0 pageOverflow=0',
    '[axe thread-cards dark 1440x900] serious list x1 :: ol',
    '[thread-cards dark 1440x900] axe=1 pageOverflow=0',
    '[thread-cards dark 960x640] axe=0 pageOverflow=12',
  ].join('\n')
  const legacy = parseLegacyLog(log)
  const get = (scheme, vp) => legacy.get(`thread-cards|${scheme}|${vp}`)
  assert.equal(get('light', '1440x900').axeCount, 0)
  assert.deepEqual(failing(evaluateScene(row({ scheme: 'light' }), { png: PNG, legacy: get('light', '1440x900') })), [])
  assert.deepEqual(failing(evaluateScene(row({ scheme: 'dark' }), { png: PNG, legacy: get('dark', '1440x900') })), ['axe'])
  assert.deepEqual(failing(evaluateScene(row({ scheme: 'dark', viewport: '960x640' }), { png: PNG, legacy: get('dark', '960x640') })), ['overflow'])
})

test('log antigo do Prism: tema, sobra horizontal e axe por tela', () => {
  const log = [
    '[light 1440 geral] tema=null sobraHorizontal=0 fundo=rgb(255, 255, 255)',
    '[axe light 1440 geral] 0 violacao(oes)',
    '[dark 960 geral] tema=false sobraHorizontal=0 fundo=rgb(0, 0, 0)',
    '[axe dark 960 geral] 2 violacao(oes)',
    '[axe dark 960 geral]   serious color-contrast x3 :: .a',
    '[axe dark 960 geral]   minor region x1 :: body',
  ].join('\n')
  const legacy = parseLegacyLog(log)
  assert.equal(legacy.get('geral|light|1440').theme, 'null')
  assert.deepEqual(failing(evaluateScene(row({ scheme: 'light', viewport: '1440x900', expectFoliage: false }), { png: PNG, legacy: legacy.get('geral|light|1440') })), [])
  const dark = evaluateScene(row({ scheme: 'dark', viewport: '960x640', expectFoliage: false }), { png: PNG, legacy: legacy.get('geral|dark|960') })
  assert.deepEqual(failing(dark), ['axe', 'tema'], 'axe sério e tema=false numa cena escura')
  assert.match(dark.find(item => item.check === 'axe').detail, /serious color-contrast x3/u)
})

test('relatório: "pronto para a Muse" só traz cena que passou nos 6 modos', () => {
  const manifest = { owner: 'T', bundle: '9', scenes: ['boa', 'ruim'] }
  const rows = plan(manifest)
  const results = new Map()
  for (const item of rows) {
    const probe = cleanProbe({ darkTheme: item.scheme === 'dark', overflowX: item.scene === 'ruim' && item.viewport === 'zoom200' ? 5 : 0 })
    const checks = evaluateScene(item, { png: PNG, probe })
    results.set(item.file, { checks, verdict: verdictOf(checks) })
  }
  const report = buildReport(manifest, rows, results)
  assert.deepEqual(report.readyForMuse.map(item => item.scene), ['boa'])
  assert.deepEqual(report.notReady.map(item => [item.scene, item.verdict, item.failing.length]), [['ruim', 'FALHOU', 2]])
  assert.equal(report.totals.passou, 10)
  assert.equal(report.totals.falhou, 2)
})

test('linha de comando de ponta a ponta: relatório .json/.md e código de saída', () => {
  const dir = mkdtempSync(join(tmpdir(), 'preaccept-'))
  try {
    const png = Buffer.alloc(MIN_PNG_BYTES + 100)
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]).copy(png)
    png.writeUInt32BE(1440, 16)
    png.writeUInt32BE(900, 20)
    const manifest = { owner: 'Teste', bundle: 'x', shell: false, viewports: ['1440x900'], scenes: ['ok', 'faltando'] }
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest))
    for (const scheme of ['light', 'dark']) {
      writeFileSync(join(dir, `ok-${scheme}-1440x900.png`), png)
      writeFileSync(join(dir, `ok-${scheme}-1440x900.probe.json`), JSON.stringify(cleanProbe({ darkTheme: scheme === 'dark' })))
    }
    const run = spawnSync(process.execPath, [join(here, 'preaccept.mjs'), '--manifest', join(dir, 'manifest.json'), '--dir', dir], { encoding: 'utf8' })
    assert.equal(run.status, 1, run.stdout + run.stderr)
    assert.match(run.stdout, /cenas prontas para a Muse: 1\/2/u)
    assert.match(run.stdout, /FALHOU\s+faltando/u)
    const report = JSON.parse(readFileSync(join(dir, 'preaccept-report.json'), 'utf8'))
    assert.deepEqual(report.readyForMuse.map(item => item.scene), ['ok'])
    const md = readFileSync(join(dir, 'preaccept-report.md'), 'utf8')
    assert.match(md, /## Pronto para a Muse/u)
    assert.match(md, /- ok/u)
    assert.match(md, /faltando.*FALHOU/su)
    const onlyReport = spawnSync(process.execPath, [join(here, 'preaccept.mjs'), '--manifest', join(dir, 'manifest.json'), '--dir', dir, '--report-only'], { encoding: 'utf8' })
    assert.equal(onlyReport.status, 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('--init esboça o manifesto a partir das imagens que existem', () => {
  const dir = mkdtempSync(join(tmpdir(), 'preaccept-init-'))
  try {
    mkdirSync(dir, { recursive: true })
    for (const name of ['a-b-light-1440x900.png', 'a-b-dark-960x640.png', 'c-light-zoom200.png', '_keyboard-open.png']) writeFileSync(join(dir, name), 'x')
    const run = spawnSync(process.execPath, [join(here, 'preaccept.mjs'), '--init', '--dir', dir, '--owner', 'Teste'], { encoding: 'utf8' })
    assert.equal(run.status, 0, run.stderr)
    assert.deepEqual(JSON.parse(run.stdout).scenes.map(item => item.id), ['a-b', 'c'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// A sonda numa página de verdade: o que ela vê tem de bater com o que está na tela.
test('sonda: texto, imagem quebrada, ícone vazio, folhagem, tema, alvo pequeno e foco', async (context) => {
  const requireFrom = createRequire(join(here, '..', '..', 'packages', 'persona', 'persona-e2e', 'package.json'))
  let browser
  try {
    const { chromium } = requireFrom('playwright')
    browser = await chromium.launch({ channel: 'chrome', headless: true })
  } catch (error) {
    context.skip(`sem navegador: ${String(error).slice(0, 80)}`)
    return
  }
  try {
    const { collectProbe } = await import('./preaccept-probe.mjs')
    const goodPixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    const html = (body, bodyAttr = '') => `<!doctype html><html lang="pt-BR"><head><style>
      body{margin:0;font:16px sans-serif;background:#fff;color:#111} nav{width:200px;height:300px;position:relative}
      .foliageLight{width:60px;height:60px;position:absolute;bottom:0} .foliageDark{display:none}
      button{min-width:40px;min-height:40px} button:focus-visible{outline:3px solid #06c} .tiny{width:10px;height:10px;padding:0;min-width:0;min-height:0}
      .icon{display:inline-block;width:16px;height:16px} .noring:focus-visible{outline:none}
    </style></head><body ${bodyAttr}>${body}</body></html>`
    const page = await browser.newPage({ viewport: { width: 800, height: 500 } })

    await page.setContent(html(`
      <nav data-persona-area="rail"><img class="foliageLight" src="${goodPixel}" alt=""><img class="foliageDark" src="${goodPixel}" alt=""></nav>
      <main><h2>@Nina revisar o texto</h2><p>Dividi com a Nina</p><input placeholder="Escreva aqui" />
      <img id="quebrada" src="http://127.0.0.1:9/nao-existe.png" width="20" height="20" alt="">
      <svg id="vazio" width="16" height="16"></svg><svg id="cheio" width="16" height="16"><path d="M0 0h16v16z"/></svg><span class="icon"></span>
      <button>Aceitar</button> <button class="tiny" aria-label="x"></button></main>`))
    await page.waitForTimeout(300)
    const dirty = await collectProbe(page, {})
    assert.match(dirty.text, /Dividi com a Nina/u)
    assert.match(dirty.text, /Escreva aqui/u, 'placeholder entra no texto visível')
    assert.ok(dirty.taskTitles.includes('@Nina revisar o texto'))
    assert.ok(dirty.brokenImages.some(item => item.includes('nao-existe')), JSON.stringify(dirty.brokenImages))
    assert.ok(dirty.emptyIcons.some(item => item.includes('svg')), JSON.stringify(dirty.emptyIcons))
    assert.ok(dirty.emptyIcons.some(item => item.includes('ícone sem desenho')), JSON.stringify(dirty.emptyIcons))
    assert.equal(dirty.emptyIcons.length, 2, 'o svg com path não conta')
    assert.equal(dirty.foliageVisible, true)
    assert.equal(dirty.darkTheme, false)
    assert.ok(dirty.smallTargets.some(item => item.w === 10), JSON.stringify(dirty.smallTargets))
    assert.equal(dirty.overflowX, 0)
    assert.equal(dirty.focus.visible, true, 'o 1º Tab cai num botão com outline')
    const dirtyChecks = evaluateScene(row(), { png: PNG, probe: dirty })
    assert.ok(failing(dirtyChecks).includes('imagens') && failing(dirtyChecks).includes('icones') && failing(dirtyChecks).includes('proibidos') && failing(dirtyChecks).includes('artigo'))

    await page.setContent(html(`<nav data-persona-area="rail"><img class="foliageLight" src="${goodPixel}" alt=""><img class="foliageDark" src="${goodPixel}" alt=""></nav>
      <main><h2>Aprovações</h2><button class="noring" style="outline:none">Aceitar</button></main>`, 'data-ds-dark-theme="true"'))
    await page.waitForTimeout(200)
    const clean = await collectProbe(page, {})
    assert.equal(clean.darkTheme, true)
    assert.deepEqual(clean.brokenImages, [])
    assert.deepEqual(clean.emptyIcons, [])
    assert.equal(clean.focus.visible, false, 'botão sem anel de foco: o 1º Tab não aparece')
    assert.match(clean.focus.element, /Aceitar/u)

    // Quill 06:00: a 200% a janela tem 360 px de altura; um diálogo mais alto, com o rodapé fora da janela, reprova; um que cabe passa.
    await page.setViewportSize({ width: 640, height: 360 })
    await page.setContent(html('<main><h2>Contas</h2></main><div role="dialog" aria-label="Adicionar conta" style="position:fixed;top:20px;left:20px;width:400px;height:520px;background:#fff;border:1px solid #333"><h2>Adicionar conta</h2><p>Escolha como entrar.</p><div style="position:absolute;bottom:8px"><button>Cancelar</button> <button>Continuar</button></div></div>'))
    const tall = await collectProbe(page, { focus: false })
    assert.equal(tall.dialogs.length, 1)
    assert.ok(tall.dialogs[0].cut.some(item => item.includes('abaixo da janela')), JSON.stringify(tall.dialogs))
    assert.ok(tall.dialogs[0].cut.some(item => item.includes('Continuar')), JSON.stringify(tall.dialogs))
    assert.deepEqual(failing(evaluateScene(row({ expectFoliage: false }), { png: PNG, probe: { ...tall, text: `${tall.text} ${'x'.repeat(20)}` } })), ['dialogo'])
    await page.setContent(html('<main><h2>Contas</h2></main><div role="dialog" aria-label="Remover conta" style="position:fixed;top:10px;left:10px;width:400px;height:300px;background:#fff;border:1px solid #333"><h2>Remover conta</h2><div style="position:absolute;bottom:8px"><button>Cancelar</button> <button>Remover</button></div></div>'))
    const fits = await collectProbe(page, { focus: false })
    assert.deepEqual(fits.dialogs.map(item => item.cut), [[]], JSON.stringify(fits.dialogs))
    await page.setViewportSize({ width: 800, height: 500 })

    // Prism 05:00: o foco já estava no ÚLTIMO elemento; o 1º Tab da cena tem de começar no topo (não sair da página). E "@handle · cargo" (subtitle) não é título.
    await page.setContent(html('<main><h2>Cartão</h2><p class="subtitle">@atlas · Coordenação</p><button id="primeiro" class="noring" style="outline:none">Primeiro</button><button id="meio">Meio</button><button id="ultimo">Último</button></main>'))
    await page.focus('#meio')
    const fromLast = await collectProbe(page, {})
    assert.match(fromLast.focus.element, /Primeiro/u, `o Tab parte do topo, não do meio: ${fromLast.focus.element}`)
    // A sonda devolve a página ao que era: quem tinha o foco o recupera e o elemento do Tab não fica com o anel (a próxima imagem não leva ruído).
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'meio')
    // Foco por MOUSE (sem anel) antes da sonda: depois dela a região da imagem tem de ser idêntica (sem anel de teclado deixado para trás).
    await page.click('#meio')
    const regionOf = async () => page.screenshot({ clip: { x: 0, y: 0, width: 400, height: 200 }, animations: 'disabled' })
    const beforeProbe = await regionOf()
    await collectProbe(page, {})
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'meio')
    assert.ok(beforeProbe.equals(await regionOf()), 'a sonda não deixa anel de foco na imagem seguinte')
    await page.evaluate(() => { document.activeElement?.blur() })
    const afterPlain = await collectProbe(page, {})
    assert.equal(await page.evaluate(() => document.activeElement === document.body), true, 'sem foco antes, sem foco depois')
    assert.ok(afterPlain.focus.element.includes('Primeiro'))
    assert.ok(!fromLast.taskTitles.some(title => title.startsWith('@atlas')), JSON.stringify(fromLast.taskTitles))

    await page.setContent(html('<main><h2>Resposta enviada</h2><p>Nada para fazer aqui, só ler.</p></main>'))
    const staticScene = await collectProbe(page, {})
    assert.equal(staticScene.focusableCount, 0)
    assert.equal(staticScene.focus.none, true, 'cena sem nada focável: não há foco para mostrar, não é falha')
    assert.deepEqual(failing(evaluateScene(row({ expectFoliage: false }), { png: PNG, probe: { ...staticScene, text: `${staticScene.text}   mais texto` } })), [])

    await page.setContent(html('<nav data-persona-area="rail"><div>sem folhagem</div></nav><main><h2>Oi</h2></main>'))
    const noFoliage = await collectProbe(page, { focus: false })
    assert.equal(noFoliage.foliageVisible, false)
    assert.equal(noFoliage.focus, undefined)

    // D-069 (Muse 07/11): avatar de RETRATO em inicial entra (o `data-tone` só existe nesse modo); o círculo da pessoa e o retrato com imagem não.
    await page.setContent(html(`<main><h2>Aprovações</h2><span class="avatar_portrait_x" data-tone="2"><span class="initials_x">N</span></span><span class="avatar_person_x" data-tone="1"><span class="initials_x">MA</span></span><span class="avatar_portrait_x"><img src="${goodPixel}" alt=""></span></main>`))
    const letters = await collectProbe(page, { focus: false })
    assert.deepEqual(letters.initialsAvatars, ['N'])
    await page.close()
  } finally {
    await browser.close()
  }
})

// App INSTALADO (varredura final da Muse): a CSP do app bloqueia <script> inline e o `addScriptTag` do Playwright é inline. O axe tem de entrar pela
// avaliação do CDP (a CSP não a pega) e a sonda não pode sujar o console da cena seguinte com "Refused to execute inline script".
test('sonda: o axe entra numa página com CSP que bloqueia script inline e não suja o console', async (context) => {
  const requireFrom = createRequire(join(here, '..', '..', 'packages', 'persona', 'persona-e2e', 'package.json'))
  const axePath = join(here, '..', '..', 'node_modules', '.pnpm', 'axe-core@4.13.0', 'node_modules', 'axe-core', 'axe.min.js')
  if (!existsSync(axePath)) {
    context.skip(`sem o axe pinado em ${axePath}`)
    return
  }
  let browser
  try {
    const { chromium } = requireFrom('playwright')
    browser = await chromium.launch({ channel: 'chrome', headless: true })
  } catch (error) {
    context.skip(`sem navegador: ${String(error).slice(0, 80)}`)
    return
  }
  try {
    const { collectProbe } = await import('./preaccept-probe.mjs')
    const page = await browser.newPage({ viewport: { width: 800, height: 500 } })
    const consoleErrors = []
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
    await page.setContent(`<!doctype html><html lang="pt-BR"><head><meta http-equiv="Content-Security-Policy" content="script-src 'none'"><title>Aprovações</title></head><body><main><h1>Aprovações</h1><button>Aceitar</button></main></body></html>`)
    const probe = await collectProbe(page, { axePath, focus: false })
    assert.equal(probe.axeError, undefined, `o axe não entrou: ${String(probe.axeError)}`)
    assert.ok(Array.isArray(probe.axe), 'o axe devolve a lista de violações (vazia ou não)')
    assert.deepEqual(consoleErrors, [], 'a sonda não gera erro de console (CSP) que iria para a cena seguinte')
    // A cena seguinte, na mesma página: reaproveita o axe que já está carregado.
    const again = await collectProbe(page, { axePath, focus: false })
    assert.equal(again.axeError, undefined)
    assert.ok(Array.isArray(again.axe))
    await page.close()
  } finally {
    await browser.close()
  }
})
