// Testes do PRÉ-ACEITE MECÂNICO: regras puras (lib), leitor dos logs antigos, linha de comando de ponta a ponta e a sonda numa página de verdade.
//   node --test scripts/persona/preaccept.test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer as createHttpServer } from 'node:http'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { renderMarkdown } from './preaccept-lib.mjs'
import { articleBeforePersona, buildReport, describeAnimation, evaluateScene, fileNameFor, findAtTitles, findExampleChips, findPessoaInSpeech, findProhibited, focusedWarning, gpuGate, gpuIdleVerdict, groupAnimations, minBytesFor, parseLegacyLog, parseLegacyReportJson, plan, stripLicenseCredit, verdictOf, CHECKS, MIN_PNG_BYTES } from './preaccept-lib.mjs'
import { gpuIdleFromPerfRun, gpuIdleReport, gpuUtilizationFromRows, parseGpuEngineName } from './preaccept-gpu.mjs'

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
  // sonda v3 (D-103c): o que ela mede além do resto
  initialsAvatars: [],
  personaSpeech: [],
  composerDuplicates: [],
  popoverCovers: [],
  exampleChips: [],
  // sonda v4 (DESIGN-01 §2.7 regra 6, preaccept-gpu): com foco pode haver animação (≤ 2), sem foco tem de ser 0
  gpu: { focusedRunning: 2, afterBlur: { count: 0, items: [] }, settleMs: 800 },
  ...extra,
})
const row = (extra = {}) => ({ scene: 'aprovacoes', scheme: 'light', viewport: '1440x900', file: 'aprovacoes-light-1440x900', allowCurrency: false, expectFoliage: true, ...extra })
const failing = (checks) => checks.filter(item => item.status === 'falhou').map(item => item.check)

test('cena limpa passa nas 19 checagens', () => {
  const checks = evaluateScene(row(), { png: PNG, probe: cleanProbe() })
  assert.equal(verdictOf(checks), 'PASSOU', JSON.stringify(checks.filter(item => item.status !== 'ok')))
  assert.equal(checks.length, 19)
  assert.deepEqual(checks.map(item => item.check).sort(), [...CHECKS].sort(), 'cada checagem da lista aparece uma vez')
})

// ---- D-103c (Keel 11/11 11:26): cada regra tem um caso RED (reprova) e um GREEN (passa). ----
const checkOf = (checks, name) => checks.find(item => item.check === name)
const runD103c = (probeExtra, rowExtra = {}) => evaluateScene(row(rowExtra), { png: PNG, probe: cleanProbe(probeExtra) })

test('D-103c RED/GREEN · "NOVA VERSÃO:" cru e RealTurnCapError reprovam na checagem `proibidos`', () => {
  for (const text of ['Vou trocar o título.\nNOVA VERSÃO: Compre hoje e leve dois', 'nova versao: Compre hoje', 'NOVA  VERSÃO :Cartaz']) {
    assert.ok(rules(text).includes('nova-versao-cru'), `RED: ${text}`)
    assert.deepEqual(failing(runD103c({ text })), ['proibidos'], text)
  }
  for (const text of ['RealTurnCapError: cap_reached', 'Erro RealTurnCapError no turno']) {
    assert.ok(rules(text).includes('real-turn-cap-error'), `RED: ${text}`)
    assert.deepEqual(failing(runD103c({ text })), ['proibidos'], text)
  }
  // GREEN: a mesma conversa sem o marcador (o host o tira) e a frase sem os dois pontos.
  for (const text of ['Troquei o título. Nada mais mudou, então não há nova versão do texto.', 'A nova versão do cartaz está no rascunho', 'Precisa de você: o teto de turnos de hoje acabou']) {
    assert.deepEqual(rules(text).filter(rule => rule === 'nova-versao-cru' || rule === 'real-turn-cap-error'), [], `GREEN: ${text}`)
  }
  assert.deepEqual(failing(runD103c({ text: 'Troquei o título. Fica a nova versão no rascunho.' })), [])
})

test('D-103c RED/GREEN · fala de persona com "a pessoa" reprova; só vale dentro do balão da persona', () => {
  for (const speech of ['Avisei a pessoa que o cartaz saiu.', 'A pessoa precisa aprovar antes.', 'Vou pedir para a pessoa escolher a cor', 'Confirmei com a  pessoa', 'Mandei à pessoa o arquivo', 'o pedido da pessoa já está na fila']) {
    const checks = runD103c({ personaSpeech: ['Oi!', speech] })
    assert.deepEqual(failing(checks), ['fala'], `RED: ${speech}`)
    assert.match(checkOf(checks, 'fala').detail, /a pessoa" na fala de persona/u)
  }
  // GREEN: você, o nome, "uma/essa/cada pessoa", plural, e a expressão fora da fala (cromo da tela: o texto geral nunca é a fala).
  for (const speech of ['Você aprova o cartaz?', 'Miguel, o cartaz saiu.', 'Era uma pessoa difícil de agradar', 'Essa pessoa já respondeu', 'Cada pessoa vê uma versão', 'As pessoas gostaram', 'Conversa com a equipe']) {
    assert.deepEqual(failing(runD103c({ personaSpeech: [speech] })), [], `GREEN: ${speech}`)
  }
  assert.deepEqual(failing(runD103c({ text: 'Pedido da pessoa\nAprovações', personaSpeech: ['Pronto, Miguel.'] })), [], 'o cromo da tela não é fala de persona')
  // A dispensa `allowPessoa` (persona escrevendo texto para um cliente) passa e aparece no relatório.
  assert.deepEqual(failing(runD103c({ personaSpeech: ['Compre hoje: a pessoa que levar dois ganha o terceiro.'] }, { allowPessoa: true })), [])
  assert.deepEqual(findPessoaInSpeech(['a pessoa', 'você']).map(item => item.rule), ['a-pessoa'])
})

test('D-103c RED/GREEN · chip "Exemplo" numa captura de aceite reprova; `allowExample` dispensa; sem a sonda v3 vale a linha do texto', () => {
  const red = runD103c({ exampleChips: ['Exemplo'] })
  assert.deepEqual(failing(red), ['exemplo'])
  assert.match(checkOf(red, 'exemplo').detail, /chip “Exemplo”.*amostra do dev-seed/u)
  assert.deepEqual(failing(runD103c({ exampleChips: ['Example', 'Exemplo'] })), ['exemplo'], 'en também')
  assert.match(checkOf(runD103c({ exampleChips: ['Example', 'Exemplo'] }), 'exemplo').detail, /x2/u)
  assert.deepEqual(failing(runD103c({ exampleChips: [] })), [], 'GREEN: nenhum selo')
  assert.deepEqual(failing(runD103c({ exampleChips: ['Exemplo'] }, { allowExample: true })), [], 'a cena que existe para mostrar o selo')
  // Palavra solta no meio de frase NÃO é o selo.
  assert.deepEqual(failing(runD103c({ text: 'Time de exemplo\nVeja um exemplo de equipe\nExemplo: Padaria Lua', exampleChips: undefined })), [])
  assert.deepEqual(failing(runD103c({ text: 'Liberar para Bia\nExemplo\nEnviar', exampleChips: undefined })), ['exemplo'], 'a linha que é só o selo')
  assert.deepEqual(findExampleChips({ chips: ['Exemplos', 'exemplo'] }), ['exemplo'])
})

test('D-103c RED/GREEN · iniciais no lugar do rosto ([SR], "E") reprovam; deixou de ser aviso', () => {
  const red = runD103c({ initialsAvatars: ['SR', 'E', 'SR'] })
  assert.deepEqual(failing(red), ['rosto'])
  assert.match(checkOf(red, 'rosto').detail, /^3 avatar\(es\) com inicial no lugar do rosto.*“SR” “E”/u)
  assert.equal(verdictOf(red), 'FALHOU')
  assert.deepEqual(failing(runD103c({ initialsAvatars: [] })), [], 'GREEN: rosto de animal em todo lugar')
  assert.equal(checkOf(runD103c({ initialsAvatars: [] }), 'imagens').detail, '', 'nada de aviso na checagem de imagens')
  assert.equal(failing(runD103c({ brokenImages: ['sem pixels: x'], initialsAvatars: ['N'] })).join(), 'imagens,rosto', 'as duas coisas reprovam, cada uma na sua')
})

test('D-103c RED/GREEN · chip/controle duplicado no composer reprova', () => {
  const red = runD103c({ composerDuplicates: [{ label: 'Decide o rotineiro', count: 2 }] })
  assert.deepEqual(failing(red), ['composer'])
  assert.match(checkOf(red, 'composer').detail, /“Decide o rotineiro” aparece 2× no composer/u)
  assert.deepEqual(failing(runD103c({ composerDuplicates: [] })), [], 'GREEN: o chip clicável só uma vez (o conserto do Flint)')
})

test('D-103c RED/GREEN · popover cobrindo mensagens reprova; `allowPopover` dispensa', () => {
  const covers = [{ popover: 'A Coordenação distribui o pedido', message: 'Oi! Vou dividir o pedido', w: 280, h: 96 }]
  const red = runD103c({ popoverCovers: covers })
  assert.deepEqual(failing(red), ['popover'])
  assert.match(checkOf(red, 'popover').detail, /“A Coordenação distribui o pedido” cobre a mensagem “Oi! Vou dividir o pedido” \(280×96 px\)/u)
  assert.deepEqual(failing(runD103c({ popoverCovers: [] })), [], 'GREEN: nenhum popover sobre mensagem')
  assert.deepEqual(failing(runD103c({ popoverCovers: covers }, { allowPopover: true })), [], 'popover aberto de propósito')
})

test('D-103c · sidecar anterior à sonda v3 é INCOMPLETO (nunca PASSOU); `--legacy-ok` o dispensa; sem sonda nenhuma, as 5 ficam sem verificar', () => {
  const { initialsAvatars: _a, personaSpeech: _b, composerDuplicates: _c, popoverCovers: _d, exampleChips: _e, gpu: _f, ...v2 } = cleanProbe({ version: 2 })
  const old = evaluateScene(row(), { png: PNG, probe: v2 })
  assert.equal(verdictOf(old), 'INCOMPLETO')
  assert.deepEqual(failing(old), [])
  assert.deepEqual(old.filter(item => item.status === 'nao-verificado').map(item => item.check).sort(), ['composer', 'fala', 'gpu', 'popover', 'rosto'])
  assert.match(checkOf(old, 'rosto').detail, /sidecar da sonda v2, sem os rostos das personas: recapture com a sonda nova \(D-103c\)/u)
  assert.equal(checkOf(old, 'exemplo').status, 'ok', 'o chip "Exemplo" também se lê do texto visível de sidecar antigo')
  const none = evaluateScene(row(), { png: PNG })
  for (const name of ['fala', 'rosto', 'composer', 'popover', 'gpu']) assert.equal(checkOf(none, name).status, 'nao-verificado', name)
  assert.equal(checkOf(none, 'exemplo').status, 'nao-verificado')
  assert.equal(verdictOf(none), 'INCOMPLETO')
})

test('D-103c · as dispensas do manifesto vão para o plano e aparecem no relatório (a 2ª leitura olha estas cenas)', () => {
  const manifest = { owner: 'T', shell: false, viewports: ['1440x900'], scenes: ['boa', { id: 'amostra', allowExample: true, allowPopover: true }, { id: 'cliente', allowPessoa: true }] }
  const rows = plan(manifest)
  assert.ok(rows.filter(item => item.scene === 'amostra').every(item => item.allowExample === true && item.allowPopover === true && item.allowPessoa === undefined))
  assert.ok(rows.filter(item => item.scene === 'boa').every(item => item.allowExample === undefined && item.allowPopover === undefined && item.allowPessoa === undefined))
  assert.ok(plan({ ...manifest, allowExample: true }).every(item => item.allowExample === true), 'o manifesto inteiro também pode dispensar (galeria de estados)')
  const results = new Map(rows.map((item) => {
    const checks = evaluateScene(item, { png: PNG, probe: cleanProbe({ darkTheme: item.scheme === 'dark', exampleChips: ['Exemplo'], popoverCovers: [{ popover: 'p', message: 'm', w: 20, h: 20 }], personaSpeech: ['a pessoa'] }) })
    return [item.file, { checks, verdict: verdictOf(checks) }]
  }))
  const report = buildReport(manifest, rows, results)
  assert.deepEqual(report.waivers, [{ scene: 'amostra', rule: 'exemplo' }, { scene: 'amostra', rule: 'popover' }, { scene: 'cliente', rule: 'fala' }])
  assert.deepEqual(report.notReady.map(item => item.scene).sort(), ['amostra', 'boa', 'cliente'], 'cada uma ainda reprova no que NÃO dispensou')
  const md = renderMarkdown(report)
  assert.match(md, /## Dispensas do manifesto/u)
  assert.match(md, /\*\*amostra\*\*: exemplo, popover/u)
  assert.match(md, /\*\*cliente\*\*: fala/u)
  assert.doesNotMatch(renderMarkdown(buildReport({ owner: 'x' }, [row()], new Map([[row().file, { checks: [], verdict: 'FALHOU' }]]))), /Dispensas/u)
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

test('D-103c · linha de comando: sidecar da sonda v2 = INCOMPLETO (código 1); `--legacy-ok` dispensa só as 5 novas; uma regra nova reprovada = FALHOU e o relatório diz qual', () => {
  const dir = mkdtempSync(join(tmpdir(), 'preaccept-d103c-'))
  try {
    const png = Buffer.alloc(MIN_PNG_BYTES + 100)
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]).copy(png)
    png.writeUInt32BE(1440, 16)
    png.writeUInt32BE(900, 20)
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ owner: 'Teste', bundle: 'd103c', shell: false, viewports: ['1440x900'], scenes: ['velha', 'composer-duplicado'] }))
    const { initialsAvatars: _a, personaSpeech: _b, composerDuplicates: _c, popoverCovers: _d, exampleChips: _e, gpu: _f, ...v2 } = cleanProbe({ version: 2 })
    for (const scheme of ['light', 'dark']) {
      writeFileSync(join(dir, `velha-${scheme}-1440x900.png`), png)
      writeFileSync(join(dir, `velha-${scheme}-1440x900.probe.json`), JSON.stringify({ ...v2, darkTheme: scheme === 'dark' }))
      writeFileSync(join(dir, `composer-duplicado-${scheme}-1440x900.png`), png)
      writeFileSync(join(dir, `composer-duplicado-${scheme}-1440x900.probe.json`), JSON.stringify(cleanProbe({ version: 3, darkTheme: scheme === 'dark', composerDuplicates: [{ label: 'Decide o rotineiro', count: 2 }] })))
    }
    const args = [join(here, 'preaccept.mjs'), '--manifest', join(dir, 'manifest.json'), '--dir', dir]
    const strict = spawnSync(process.execPath, args, { encoding: 'utf8' })
    assert.equal(strict.status, 1, strict.stdout + strict.stderr)
    assert.match(strict.stdout, /INCOMPLETO\s+velha.*sem verificar: fala, rosto, composer, popover, gpu/u)
    assert.match(strict.stdout, /FALHOU\s+composer-duplicado.*composer \(“Decide o rotineiro” aparece 2× no composer\)/u)
    const lenient = spawnSync(process.execPath, [...args, '--legacy-ok'], { encoding: 'utf8' })
    assert.equal(lenient.status, 1, 'a cena com o composer duplicado continua reprovando')
    assert.doesNotMatch(lenient.stdout, /velha/u, 'a velha passa com --legacy-ok (as 5 novas dispensadas)')
    assert.match(lenient.stdout, /FALHOU\s+composer-duplicado/u)
    const report = JSON.parse(readFileSync(join(dir, 'preaccept-report.json'), 'utf8'))
    assert.deepEqual(report.readyForMuse.map(item => item.scene), ['velha'])
    assert.deepEqual(report.waivers, [])
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

// D-103c (Keel 11/11): a sonda v3 numa página de verdade, com o DOM do app (mesmas marcas: data-persona-area="composer", data-persona-bubble, role="dialog" do balão, classes avatar/initials/chip).
// RED = o que o Carbon viu (chip duplicado, balão sobre a mensagem, "Exemplo", [SR], fala com "a pessoa", marcador cru); GREEN = o conserto do Flint (um chip só, balão fora das mensagens, rosto de animal).
test('D-103c · sonda v3 no Chrome: RED (composer duplicado, balão sobre mensagem, "Exemplo", [SR]/"E", "a pessoa", marcador cru) e GREEN (o conserto)', async (context) => {
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
    const page = await browser.newPage({ viewport: { width: 900, height: 620 } })
    const scene = ({ header = '', face, personaSpeech, composerChips, balloons, rail = '' }) => `<!doctype html><html lang="pt-BR"><head><style>
      body{margin:0;font:16px sans-serif;background:#fff;color:#111}
      main{position:relative;width:700px;height:620px;margin:0 auto}
      ol{list-style:none;margin:0;padding:12px;height:400px;overflow:hidden}
      li{margin:0 0 12px;padding:0}
      [data-persona-bubble]{display:inline-block;padding:12px 16px;border:1px solid #888;border-radius:12px;max-width:420px}
      form{position:absolute;left:0;right:0;bottom:0;height:150px;padding:12px;border-top:1px solid #aaa;background:#fff}
      .chip{display:inline-flex;gap:4px;padding:2px 10px;border:1px solid #666;border-radius:99px;font-size:13px}
      button{min-width:40px;min-height:40px} .autonomyButton{border:0;background:none;padding:0}
      .avatar{display:inline-flex;width:32px;height:32px;border-radius:8px;border:1px solid #444;align-items:center;justify-content:center;overflow:hidden}
      .balloon{position:absolute;z-index:40;width:280px;padding:12px;background:#ffd;border:1px solid #333}
    </style></head><body>${header}<main>
      <ol>
        <li data-author="user" data-message-id="m1"><span class="avatar person" data-tone="2"><span class="initials">MA</span></span><div data-persona-bubble data-author="user"><p>Pode fazer o cartaz da loja?</p></div></li>
        <li data-author="persona" data-message-id="m2">${face}<div data-persona-bubble data-author="persona"><div data-persona-markdown>${personaSpeech}</div></div></li>
        <li data-author="persona" data-message-id="m3"><div data-persona-bubble data-author="persona"><div data-persona-markdown><p>Deixei a faixa maior no rascunho, Miguel.</p></div></div></li>
      </ol>
      ${balloons}
      <form data-persona-area="composer" aria-label="Escreva uma mensagem">
        <textarea aria-label="Mensagem" placeholder="Escreva uma mensagem"></textarea>
        <div><button type="button" aria-label="Quem responde"></button>
        <button type="button" class="autonomyButton" aria-label="Decide o rotineiro"><span class="chip"><svg width="13" height="13"><path d="M0 0h13v13z"/></svg><span>Decide o rotineiro</span></span></button>${composerChips}</div>
        <button type="submit" aria-label="Enviar"></button>
      </form></main>${rail}</body></html>`
    const balloon = (title, extra = '') => `<div role="dialog" class="balloon" aria-label="${title}" ${extra}><p>${title}</p><button type="button">Entendi</button></div>`
    // Põe o balão (o 1º com a classe .balloon) em cima do balão de mensagem m2, como o app o faz com a dica "Quem responde".
    const overMessage = async () => page.evaluate(() => {
      const bubble = document.querySelector('[data-message-id="m2"] [data-persona-bubble]').getBoundingClientRect()
      const host = document.querySelector('main').getBoundingClientRect()
      const el = document.querySelector('.balloon')
      el.style.top = `${bubble.top - host.top + 6}px`
      el.style.left = `${bubble.left - host.left + 20}px`
    })

    // ---- RED ----
    await page.setContent(scene({
      header: '<header><span class="chip">Exemplo</span></header>',
      face: '<span class="avatar portrait" data-tone="1"><span class="initials">SR</span></span><span class="avatar person" data-tone="3"><span class="initials">E</span></span>',
      personaSpeech: '<p>Avisei a pessoa que o cartaz saiu.</p><p>NOVA VERSÃO: Cartaz com faixa maior</p><p>RealTurnCapError</p>',
      composerChips: '<span class="chip autonomyChip">Decide o rotineiro</span>',
      balloons: balloon('A Coordenação distribui o pedido'),
      rail: '<nav><span class="avatar" data-persona-area="rail-face"><span class="initials">B</span></span></nav>',
    }))
    await overMessage()
    await page.waitForTimeout(200)
    const red = await collectProbe(page, { focus: false })
    assert.equal(red.version, 4)
    assert.deepEqual(red.initialsAvatars, ['SR', 'E', 'B'], 'retrato em inicial, círculo dentro da linha da persona e a inicial do trilho; o círculo da pessoa (MA) não')
    assert.equal(red.personaSpeech.length, 2, 'só os balões de persona (o da pessoa e o cromo ficam de fora)')
    assert.match(red.personaSpeech[0], /Avisei a pessoa que o cartaz saiu\./u)
    assert.deepEqual(red.composerDuplicates, [{ label: 'Decide o rotineiro', count: 2 }], JSON.stringify(red.composerDuplicates))
    assert.equal(red.popoverCovers.length, 1, JSON.stringify(red.popoverCovers))
    assert.equal(red.popoverCovers[0].popover, 'A Coordenação distribui o pedido')
    assert.match(red.popoverCovers[0].message, /Avisei a pessoa/u)
    assert.ok(red.popoverCovers[0].w >= 12 && red.popoverCovers[0].h >= 12)
    assert.deepEqual(red.exampleChips, ['Exemplo'])
    const redChecks = evaluateScene(row({ expectFoliage: false }), { png: PNG, probe: { ...red, text: `${red.text} ${'x'.repeat(20)}` } })
    for (const name of ['proibidos', 'fala', 'exemplo', 'rosto', 'composer', 'popover']) assert.ok(failing(redChecks).includes(name), `RED: ${name} deveria reprovar (reprovou: ${failing(redChecks).join(', ')})`)
    assert.equal(verdictOf(redChecks), 'FALHOU')
    assert.match(checkOf(redChecks, 'proibidos').detail, /NOVA VERSÃO|RealTurnCap/u)

    // ---- GREEN: o conserto ----
    await page.setContent(scene({
      face: `<span class="avatar portrait" data-tone="1"><img src="${goodPixel}" alt=""></span>`,
      personaSpeech: '<p>Você aprova o cartaz, Miguel? Já deixei a faixa maior no rascunho.</p>',
      composerChips: '',
      // um balão na altura do composer (não toca mensagem), um modal pequeno sobre a mensagem (cobre por desenho) e um balão POR BAIXO da mensagem (não cobre nada)
      balloons: `${balloon('Dica do composer', 'style="top:430px;left:200px"')}${balloon('Janela modal', 'aria-modal="true" style="top:30px;left:60px"')}${balloon('Atrás da mensagem', 'style="top:70px;left:40px;z-index:-1"')}`,
      rail: '<nav><span class="avatar portrait"><img src="' + goodPixel + '" alt=""></span></nav>',
    }))
    await page.waitForTimeout(200)
    const green = await collectProbe(page, { focus: false })
    assert.deepEqual(green.initialsAvatars, [], 'a pessoa pode ter iniciais; a persona tem rosto')
    assert.equal(green.personaSpeech.length, 2)
    assert.deepEqual(green.composerDuplicates, [], 'um chip clicável só (o conserto do Flint em ChannelComposer.tsx)')
    assert.deepEqual(green.popoverCovers, [], JSON.stringify(green.popoverCovers))
    assert.deepEqual(green.exampleChips, [])
    const greenChecks = evaluateScene(row({ expectFoliage: false }), { png: PNG, probe: { ...green, text: `${green.text} ${'x'.repeat(20)}` } })
    assert.deepEqual(failing(greenChecks), [], JSON.stringify(greenChecks.filter(item => item.status === 'falhou')))
    for (const name of ['fala', 'exemplo', 'rosto', 'composer', 'popover', 'proibidos']) assert.equal(checkOf(greenChecks, name).status, 'ok', name)

    // O balão sobre a mensagem sem o `aria-modal` é o RED; com o balão sobre a mensagem E `allowPopover` a cena passa e vira dispensa do relatório.
    await page.setContent(scene({ face: `<span class="avatar portrait"><img src="${goodPixel}" alt=""></span>`, personaSpeech: '<p>Oi, Miguel.</p>', composerChips: '', balloons: balloon('Menu aberto de propósito') }))
    await overMessage()
    const deliberate = await collectProbe(page, { focus: false })
    assert.ok(deliberate.popoverCovers.length >= 1, 'o balão tapa a mensagem m2 (e, com o balão baixo, também a m3)')
    assert.ok(deliberate.popoverCovers.every(item => item.popover === 'Menu aberto de propósito'))
    assert.deepEqual(failing(evaluateScene(row({ expectFoliage: false }), { png: PNG, probe: { ...deliberate, text: `${deliberate.text} ${'x'.repeat(20)}` } })), ['popover'])
    assert.deepEqual(failing(evaluateScene(row({ expectFoliage: false, allowPopover: true }), { png: PNG, probe: { ...deliberate, text: `${deliberate.text} ${'x'.repeat(20)}` } })), [])
    await page.close()
  } finally {
    await browser.close()
  }
})

// ---- Dispensa ESTREITA do crédito de licença MIT (Keel 11/11 14:24): o "Sobre" cita "DeepSeek Harness" por obrigação legal. ----
// O texto é o da captura real do Quill (bundle7, settings-3-sobre): innerText com quebra de linha entre os blocos do crédito.
const SOBRE_TEXT = 'Sobre\nA Persona roda no seu computador. Suas conversas, o Cofre e as chaves ficam aqui, a menos que você decida outra coisa.\n\nFeito sobre o trabalho de\nDeepSeek Harness\nLicença MIT\nA base do app: o que roda no seu computador, os plugins e a janela.\n© 2026 DeepSeek\nOAR\nLicença Apache-2.0\nComo as personas usam o Claude, o Codex e outras IAs.\nbotiverse\nt3code\nLicença MIT\nIdeias de atalhos de teclado e da caixa de mensagem.'

test('proibidos · crédito de licença MIT: RED sem a dispensa; GREEN com `allowCreditoLicenca` só no bloco do crédito; "harness" fora dele continua reprovando', () => {
  const sobre = (text, rowExtra = {}) => evaluateScene(row({ scene: 'settings-3-sobre', ...rowExtra }), { png: PNG, probe: cleanProbe({ text }) })
  const red = sobre(SOBRE_TEXT)
  assert.deepEqual(failing(red), ['proibidos'], 'sem a dispensa a cena Sobre reprova (a regra da Muse vale em todo o app)')
  assert.match(checkOf(red, 'proibidos').detail, /harness: “.*Harness/u)
  const green = sobre(SOBRE_TEXT, { allowCreditoLicenca: true })
  assert.deepEqual(failing(green), [], JSON.stringify(green.filter(item => item.status !== 'ok')))
  assert.equal(verdictOf(green), 'PASSOU')
  // a regex é FIXA: o mesmo nome fora do crédito, outra frase de abertura, outra licença, ou "harness" no resto do texto continuam reprovando mesmo com a dispensa
  for (const [name, text] of [
    ['harness solto no fim', `${SOBRE_TEXT}\nModo harness ativado`],
    ['o nome sem a frase do crédito', SOBRE_TEXT.replace('Feito sobre o trabalho de\n', '')],
    ['outra frase de abertura', SOBRE_TEXT.replace('Feito sobre o trabalho de', 'Powered by')],
    ['a licença errada', SOBRE_TEXT.replace('DeepSeek Harness\nLicença MIT', 'DeepSeek Harness\nLicença Apache-2.0')],
    ['o nome citado no meio de uma frase de produto', `${SOBRE_TEXT}\nUse o DeepSeek Harness para tudo`],
  ]) assert.deepEqual(failing(sobre(text, { allowCreditoLicenca: true })), ['proibidos'], `RED mesmo com a dispensa: ${name}`)
  // a dispensa só tira o bloco do crédito: as outras regras da lista seguem valendo na cena
  assert.deepEqual(failing(sobre(`${SOBRE_TEXT}\nO runner caiu`, { allowCreditoLicenca: true })), ['proibidos'])
  assert.equal(stripLicenseCredit(SOBRE_TEXT).includes('Harness'), false)
  assert.equal(stripLicenseCredit(SOBRE_TEXT).includes('A base do app'), true, 'o resto do texto fica intacto')
  assert.equal(stripLicenseCredit('Built on the work of DeepSeek Harness MIT License').trim(), '', 'a forma em inglês do mesmo crédito')
})

test('proibidos · `allowCreditoLicenca` vale só na cena que o pede (nunca no topo do manifesto) e vira linha em "Dispensas" para o Carbon', () => {
  const manifest = { owner: 'Quill', bundle: 'dispensa', shell: false, viewports: ['1440x900'], schemes: ['light'], allowCreditoLicenca: true, scenes: ['conexoes', { id: 'sobre', allowCreditoLicenca: true }] }
  const rows = plan(manifest)
  assert.equal(rows.find(item => item.scene === 'sobre').allowCreditoLicenca, true)
  assert.equal(rows.find(item => item.scene === 'conexoes').allowCreditoLicenca, undefined, 'a chave no topo do manifesto é ignorada: só por cena')
  const results = new Map(rows.map((item) => {
    const checks = evaluateScene(item, { png: PNG, probe: cleanProbe(item.scene === 'sobre' ? { text: SOBRE_TEXT } : {}) })
    return [item.file, { checks, verdict: verdictOf(checks) }]
  }))
  const report = buildReport(manifest, rows, results)
  assert.deepEqual(report.waivers.map(item => item.scene), ['sobre'])
  assert.match(report.waivers[0].rule, /^proibidos: só o crédito de licença MIT/u)
  assert.equal(report.totals.scenesReady, 2)
  assert.match(renderMarkdown(report), /## Dispensas do manifesto[\s\S]*- \*\*sobre\*\*: proibidos: só o crédito de licença MIT .*“harness” em outro lugar continua reprovando/u)
})

// ---- Paleta do Prism (11/11): "último controle fora da janela" com a caixa à vista é lista rolável interna; `skipChecks` por cena. ----
test('diálogo · só o "último controle fora da janela", com a caixa à vista, é lista rolável interna: aviso (a paleta em 1440/960); caixa cortada reprova (a paleta em 200%)', () => {
  const quiet = { png: PNG }
  const soft = evaluateScene(row({ expectFoliage: false }), { ...quiet, probe: cleanProbe({ dialogs: [{ label: 'Buscar', cut: ['último controle “Ajuda” fora da janela'] }] }) })
  assert.deepEqual(failing(soft), [])
  assert.match(checkOf(soft, 'dialogo').detail, /^aviso: “Buscar”: último controle “Ajuda” fora da janela — a caixa cabe na janela/u)
  const zoom = evaluateScene(row({ expectFoliage: false }), { ...quiet, probe: cleanProbe({ dialogs: [{ label: 'Buscar', cut: ['base 150 px abaixo da janela', 'último controle “Ajuda” fora da janela'] }] }) })
  assert.deepEqual(failing(zoom), ['dialogo'], 'a caixa passa da janela: o defeito é real')
  assert.match(checkOf(zoom, 'dialogo').detail, /base 150 px abaixo da janela/u)
  // um diálogo cortado e uma paleta com lista: reprova pelo cortado e o aviso da lista não esconde isso
  const mixed = evaluateScene(row({ expectFoliage: false }), { ...quiet, probe: cleanProbe({ dialogs: [{ label: 'Buscar', cut: ['último controle “Ajuda” fora da janela'] }, { label: 'Adicionar conta', cut: ['topo 10 px acima da janela'] }] }) })
  assert.deepEqual(failing(mixed), ['dialogo'])
  assert.match(checkOf(mixed, 'dialogo').detail, /Adicionar conta/u)
})

test('skipChecks por cena: a checagem some só daquela cena, vira linha em "Dispensas" e o resto da cena segue valendo; sem a dispensa a cena fica INCOMPLETO', () => {
  const manifest = { owner: 'T', bundle: 'skip', shell: false, viewports: ['1440x900'], schemes: ['light'], scenes: ['topo', { id: 'rolado', skipChecks: ['foco'] }] }
  const rows = plan(manifest)
  assert.deepEqual(rows.find(item => item.scene === 'rolado').skipChecks, ['foco'])
  assert.equal(rows.find(item => item.scene === 'topo').skipChecks, undefined)
  const dir = mkdtempSync(join(tmpdir(), 'preaccept-skip-'))
  try {
    const png = Buffer.alloc(MIN_PNG_BYTES + 100)
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]).copy(png)
    png.writeUInt32BE(1440, 16)
    png.writeUInt32BE(900, 20)
    const { focus: _focus, ...semFoco } = cleanProbe()
    for (const scene of ['topo', 'rolado']) {
      writeFileSync(join(dir, `${scene}-light-1440x900.png`), png)
      writeFileSync(join(dir, `${scene}-light-1440x900.probe.json`), JSON.stringify(scene === 'rolado' ? semFoco : cleanProbe()))
    }
    const run = (m) => {
      writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ ...m, dir }))
      return spawnSync(process.execPath, [join(here, 'preaccept.mjs'), '--manifest', join(dir, 'manifest.json'), '--dir', dir], { encoding: 'utf8' })
    }
    const without = run({ ...manifest, scenes: ['topo', 'rolado'] })
    assert.equal(without.status, 1, without.stdout)
    assert.match(without.stdout, /INCOMPLETO\s+rolado.*sem verificar: foco/u, 'focus:false sem a dispensa: nunca PASSOU')
    const withSkip = run(manifest)
    assert.equal(withSkip.status, 0, withSkip.stdout + withSkip.stderr)
    const report = JSON.parse(readFileSync(join(dir, 'preaccept-report.json'), 'utf8'))
    assert.deepEqual(report.readyForMuse.map(item => item.scene), ['topo', 'rolado'])
    assert.deepEqual(report.waivers.map(item => item.scene), ['rolado'])
    assert.match(report.waivers[0].rule, /^foco: NÃO conferida nesta cena/u)
    assert.match(readFileSync(join(dir, 'preaccept-report.md'), 'utf8'), /## Dispensas do manifesto[\s\S]*- \*\*rolado\*\*: foco: NÃO conferida nesta cena/u)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('sonda · diálogo com lista rolável interna: o último item abaixo da dobra não conta como rodapé cortado; o rodapé de verdade cortado reprova', async (context) => {
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
    const page = await browser.newPage({ viewport: { width: 800, height: 400 } })
    const items = Array.from({ length: 30 }, (_, index) => `<button type="button" role="option" style="display:block;min-width:80px;min-height:30px">Item ${String(index + 1)}</button>`).join('')
    // A paleta: caixa de 300 px dentro da janela de 400, lista rolável (overflow auto) com 30 itens, SEM rodapé: o último controle da caixa é um item lá embaixo.
    await page.setContent(`<!doctype html><body style="margin:0"><div role="dialog" aria-label="Buscar" style="position:fixed;top:20px;left:100px;width:600px;height:300px;background:#fff;border:1px solid #333"><input aria-label="Buscar" style="min-height:30px;min-width:200px" /><div style="overflow:auto;height:240px">${items}</div></div></body>`)
    const palette = await collectProbe(page, { focus: false, gpu: false })
    assert.deepEqual(palette.dialogs, [{ label: 'Buscar', cut: [] }], 'o item 30 está bem abaixo da janela, dentro de uma lista rolável: não é rodapé cortado')
    assert.deepEqual(failing(evaluateScene(row({ expectFoliage: false }), { png: PNG, probe: { ...palette, text: `${palette.text} ${'x'.repeat(20)}` } })), [])
    // O diálogo com rodapé de verdade: a caixa passa da janela e o "Continuar" some junto → reprova (mesmo com uma lista rolável dentro).
    await page.setContent(`<!doctype html><body style="margin:0"><div role="dialog" aria-label="Adicionar conta" style="position:fixed;top:20px;left:100px;width:600px;background:#fff;border:1px solid #333"><div style="overflow:auto;height:200px">${items}</div><div style="height:300px"></div><button type="button" style="min-width:80px;min-height:30px">Continuar</button></div></body>`)
    const tall = await collectProbe(page, { focus: false, gpu: false })
    assert.ok(tall.dialogs[0].cut.some(item => item.includes('abaixo da janela')), JSON.stringify(tall.dialogs))
    assert.ok(tall.dialogs[0].cut.some(item => item.includes('Continuar')), JSON.stringify(tall.dialogs))
    assert.deepEqual(failing(evaluateScene(row({ expectFoliage: false }), { png: PNG, probe: { ...tall, text: `${tall.text} ${'x'.repeat(20)}` } })), ['dialogo'])
    await page.close()
  } finally {
    await browser.close()
  }
})

// ---- `avisos` por cena (Keel 11/11 14:43): nota do manifesto que o Carbon lê em "Avisos"; não muda o veredito. ----
test('avisos por cena: a nota do manifesto vai para "Avisos" do relatório (uma vez por cena) e NÃO muda o veredito', () => {
  const nota = 'O “Recomendado” de Conexões é do Zinc, não do Quill'
  const manifest = { owner: 'Quill', bundle: 'nota', shell: false, viewports: ['1440x900'], schemes: ['light', 'dark'], scenes: [{ id: 'conexoes', avisos: [nota, '  ', 7] }, 'sobre'] }
  const rows = plan(manifest)
  assert.deepEqual(rows.find(item => item.scene === 'conexoes').avisos, [nota], 'só texto não vazio')
  assert.equal(rows.find(item => item.scene === 'sobre').avisos, undefined)
  const results = new Map(rows.map((item) => {
    const checks = evaluateScene(item, { png: PNG, probe: cleanProbe({ darkTheme: item.scheme === 'dark' }) })
    return [item.file, { checks, verdict: verdictOf(checks) }]
  }))
  const report = buildReport(manifest, rows, results)
  assert.equal(report.totals.scenesReady, 2, 'a nota não reprova nada')
  assert.deepEqual(report.warnings.map(item => [item.scene, item.check, item.detail]), [['conexoes', 'nota', nota]], 'uma linha, não uma por tema')
  assert.match(renderMarkdown(report), /## Avisos[\s\S]*- \*\*conexoes\*\* \(nota do manifesto\): O “Recomendado” de Conexões é do Zinc/u)
})

// ---- Imagens (Quill bundle10, 11/11): imagem à vista ainda carregando ganha até 1,5 s; preguiçosa fora da janela não conta; a que nunca chega e a quebrada reprovam. ----
test('sonda · imagem à vista ainda carregando ganha tempo; lazy fora da janela não conta; a que nunca chega e a quebrada (404) reprovam', async (context) => {
  const requireFrom = createRequire(join(here, '..', '..', 'packages', 'persona', 'persona-e2e', 'package.json'))
  let browser
  try {
    const { chromium } = requireFrom('playwright')
    browser = await chromium.launch({ channel: 'chrome', headless: true })
  } catch (error) {
    context.skip(`sem navegador: ${String(error).slice(0, 80)}`)
    return
  }
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
  const server = createHttpServer((request, response) => {
    if (request.url === '/slow.png') setTimeout(() => { response.writeHead(200, { 'content-type': 'image/png' }); response.end(pixel) }, 700)
    else if (request.url === '/hang.png') { /* nunca responde */ }
    else if (request.url === '/missing.png') { response.writeHead(404); response.end() }
    else { response.writeHead(200, { 'content-type': 'image/png' }); response.end(pixel) }
  })
  await new Promise((resolveListen) => { server.listen(0, '127.0.0.1', resolveListen) })
  const base = `http://127.0.0.1:${String(server.address().port)}`
  try {
    const { collectProbe } = await import('./preaccept-probe.mjs')
    const page = await browser.newPage({ viewport: { width: 800, height: 400 } })
    const show = (html) => page.setContent(`<!doctype html><body style="margin:0">${html}</body>`, { waitUntil: 'domcontentloaded' })
    const probeOf = async () => (await collectProbe(page, { focus: false, gpu: false })).brokenImages

    // GREEN 1: o servidor local demora 700 ms; na hora da sonda a imagem ainda não completou, mas está à vista: a sonda espera e ela chega.
    await show(`<img src="${base}/slow.png" width="40" height="40" alt="">`)
    assert.deepEqual(await probeOf(), [], 'imagem lenta que chega dentro do prazo não é quebrada')
    // GREEN 2: preguiçosa abaixo da dobra (a seção "Figurinhas" do Quill): o navegador nem a buscou e ela não está nesta captura.
    await show(`<div style="height:1500px"></div><img loading="lazy" src="${base}/hang.png" width="40" height="40" alt="">`)
    assert.deepEqual(await probeOf(), [], 'lazy fora da janela não conta')
    // RED 1: imagem à vista que nunca chega (passou o prazo): "não carregou".
    await show(`<img src="${base}/hang.png" width="40" height="40" alt="">`)
    const hung = await probeOf()
    assert.equal(hung.length, 1)
    assert.match(hung[0], /^não carregou: .*\/hang\.png$/u)
    // RED 2: 404: completa, sem pixels.
    await show(`<img src="${base}/missing.png" width="40" height="40" alt="">`)
    const missing = await probeOf()
    assert.equal(missing.length, 1)
    assert.match(missing[0], /^sem pixels: .*\/missing\.png$/u)
    // O mesmo lazy fora da janela, mas visível (sem a dobra), e preso: aí conta.
    await show(`<img loading="lazy" src="${base}/hang.png" width="40" height="40" alt="">`)
    assert.equal((await probeOf()).length, 1, 'lazy à vista e que não chega conta')
    await page.close()
  } finally {
    server.closeAllConnections()
    await new Promise((resolveClose) => { server.close(resolveClose) })
    await browser.close()
  }
})

// ---- Regra 5 do §2.7 (Keel 11/11 16:54 + ajuste 16:55): com foco, mais de 2 infinitas CONTÍNUAS é AVISO (não reprova); as infinitas em steps(...) não contam; a sonda lista todas. ----
test('gpu · regra 5: mais de 2 infinitas CONTÍNUAS com foco vira AVISO agrupado; as em steps ficam de fora; sem classificação não avisa; a falha do repouso continua falha', () => {
  const anim = (name, easing, target = 'div.figure', iterations = 'Infinity', durationMs = 4600) => ({ kind: 'css', name, target, iterations, durationMs, easing })
  const gpu = (extra) => ({ focusedRunning: 10, afterBlur: { count: 0, items: [] }, settleMs: 800, ...extra })
  const many = (count, build) => Array.from({ length: count }, build)
  // GREEN (o caso real do Prism): 5 personaBlinkFrame + 5 personaTailFrame, TODAS em steps (troca de frame, 0,0% de GPU): nenhuma contínua, sem aviso
  const stepsOnly = [...many(5, () => anim('personaBlinkFrame', 'steps', 'img.poseBlink', 'Infinity', 5500)), ...many(5, () => anim('personaTailFrame', 'steps', 'img.poseTail', 'Infinity', 7000))]
  const quiet = gpuGate(gpu({ focusedInfinite: 10, focusedSteps: 10, focusedContinuous: 0, focusedItems: stepsOnly }))
  assert.deepEqual(quiet, { ok: true, detail: '0 animações rodando sem foco (com foco: 10 · 10 infinitas em steps)' })
  // RED (aviso): 5 personaBreathe CONTÍNUAS (scale) + 4 em steps: passa o gate do repouso, com o aviso agrupado e a nota dos steps
  const mixed = [...many(5, () => anim('personaBreathe', 'continua')), ...many(4, () => anim('personaBlinkFrame', 'steps', 'img.poseBlink', 'Infinity', 5500)), { kind: 'transition', name: 'opacity', target: 'p#t', iterations: 1, durationMs: 150, easing: 'continua' }]
  const warned = gpuGate(gpu({ focusedInfinite: 9, focusedSteps: 4, focusedContinuous: 5, focusedItems: mixed }))
  assert.equal(warned.ok, true, 'o gate do repouso (regra 6) passa: 0 depois do blur')
  assert.match(warned.detail, /^aviso: 5 animações infinitas CONTÍNUAS rodando COM foco \(a regra 5 manda no máximo 2; as 4 em steps \(troca de frame\) ficam de fora\): personaBreathe em div\.figure \(∞ · 4600 ms\) ×5 — 0 animações rodando sem foco \(com foco: 10 · 4 infinitas em steps\)$/u)
  assert.doesNotMatch(warned.detail, /personaBlinkFrame|opacity/u, 'steps e finitas não entram na lista das contínuas')
  // o limite é 2: 2 contínuas + 8 steps = sem aviso; 3 contínuas = aviso
  assert.doesNotMatch(gpuGate(gpu({ focusedInfinite: 10, focusedSteps: 8, focusedContinuous: 2, focusedItems: [anim('cursor', 'continua'), anim('lampBreathe', 'continua')] })).detail, /^aviso/u)
  assert.match(gpuGate(gpu({ focusedInfinite: 3, focusedSteps: 0, focusedContinuous: 3, focusedItems: many(3, () => anim('x', 'continua')) })).detail, /^aviso: 3 animações infinitas CONTÍNUAS/u)
  // sidecar sem a classificação (sonda de antes): não tem como separar steps de contínua: sem aviso, detalhe simples
  assert.equal(gpuGate(gpu({})).detail, '0 animações rodando sem foco (com foco: 10)')
  // a falha da regra 6 não leva aviso junto: continua sendo falha com a causa
  const failed = gpuGate(gpu({ focusedInfinite: 9, focusedSteps: 4, focusedContinuous: 5, focusedItems: mixed, afterBlur: { count: 1, items: [anim('lampBreathe', 'continua')] } }))
  assert.equal(failed.ok, false)
  assert.doesNotMatch(failed.detail, /^aviso/u)
  assert.equal(describeAnimation(anim('personaBlinkFrame', 'steps', 'img.poseBlink', 'Infinity', 5500)), 'personaBlinkFrame em img.poseBlink (∞ · 5500 ms · steps)')
  assert.equal(describeAnimation(anim('personaBreathe', 'continua')), 'personaBreathe em div.figure (∞ · 4600 ms)')
  assert.deepEqual(groupAnimations([anim('a', 'continua'), anim('a', 'continua'), anim('b', 'continua')]), ['a em div.figure (∞ · 4600 ms) ×2', 'b em div.figure (∞ · 4600 ms)'])
  // na checagem da cena: status ok, o veredito não muda e o aviso chega ao relatório (uma linha por cena, não uma por modo)
  const manifest = { owner: 'T', bundle: 'regra5', shell: false, viewports: ['1440x900'], schemes: ['light', 'dark'], scenes: ['geral-topo'] }
  const rows = plan(manifest)
  const results = new Map(rows.map((item) => {
    const checks = evaluateScene(item, { png: PNG, probe: cleanProbe({ darkTheme: item.scheme === 'dark', gpu: gpu({ focusedInfinite: 9, focusedSteps: 4, focusedContinuous: 5, focusedItems: mixed }) }) })
    return [item.file, { checks, verdict: verdictOf(checks) }]
  }))
  const report = buildReport(manifest, rows, results)
  assert.equal(report.totals.scenesReady, 1, 'o aviso não reprova')
  assert.equal(report.warnings.filter(item => item.check === 'gpu').length, 1, 'uma linha por cena')
  assert.match(report.warnings.find(item => item.check === 'gpu').detail, /^5 animações infinitas CONTÍNUAS rodando COM foco/u)
  assert.equal(report.warnings.find(item => item.check === 'gpu').otherModes, 1, 'o outro tema só conta')
})

test('sonda · classifica cada animação rodando com foco como steps ou contínua (CSS e WAAPI) e conta as infinitas; a finita não conta', async (context) => {
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
    const { collectGpuIdle } = await import('./preaccept-probe.mjs')
    const page = await browser.newPage({ viewport: { width: 800, height: 400 } })
    // 3 contínuas CSS (ease, linear, sem curva), 2 em steps CSS (as do piscar/rabo), 1 WAAPI em steps, 1 WAAPI contínua, 1 CSS FINITA contínua (3 iterações) e uma transição
    await page.goto(`data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><style>
      @keyframes breathe{from{transform:scale(1)}to{transform:scale(1.01)}} @keyframes frame{50%{opacity:.3}}
      .a{animation:breathe 4s ease infinite alternate} .b{animation:breathe 5s linear infinite} .c{animation:breathe 6s infinite}
      .s1{animation:frame 5.5s steps(1,end) infinite} .s2{animation:frame 7s steps(2,start) infinite} .fin{animation:breathe 30s linear 3}
      #t{transition:opacity 5s}</style>
      <i class="a">a</i><i class="b">b</i><i class="c">c</i><i class="s1">1</i><i class="s2">2</i><i class="fin">f</i><p id="t">t</p>
      <script>
        getComputedStyle(document.getElementById('t')).opacity
        document.getElementById('t').style.opacity = '0.3'
        document.querySelector('.a').animate([{ opacity: 1 }, { opacity: 0.5 }], { duration: 900, iterations: Infinity, easing: 'steps(1, end)', id: 'cursor-steps' })
        document.querySelector('.b').animate([{ opacity: 1 }, { opacity: 0.5 }], { duration: 900, iterations: Infinity, id: 'cursor-linear' })
      </script>`)}`)
    await page.waitForTimeout(100)
    const gpu = await collectGpuIdle(page, { settleMs: 50 })
    const byName = (name) => gpu.focusedItems.filter(item => item.name === name)
    assert.deepEqual(gpu.focusedItems.filter(item => item.name === 'breathe').map(item => item.easing), ['continua', 'continua', 'continua', 'continua'], 'ease, linear, sem curva e a finita (a finita é contínua, mas não infinita)')
    assert.deepEqual(byName('frame').map(item => item.easing), ['steps', 'steps'], 'steps(1,end) e steps(2,start) em CSS: a curva vive nas keyframes')
    assert.equal(byName('cursor-steps')[0].easing, 'steps', 'WAAPI com easing steps no efeito')
    assert.equal(byName('cursor-linear')[0].easing, 'continua')
    assert.equal(byName('opacity')[0].kind, 'transition')
    // 3 CSS contínuas infinitas + 1 WAAPI contínua = 4; steps: 2 CSS + 1 WAAPI = 3; infinitas = 7 (a finita e a transição ficam de fora)
    assert.equal(gpu.focusedInfinite, 7, JSON.stringify(gpu.focusedItems))
    assert.equal(gpu.focusedSteps, 3)
    assert.equal(gpu.focusedContinuous, 4)
    assert.match(focusedWarning(gpu), /^4 animações infinitas CONTÍNUAS rodando COM foco \(a regra 5 manda no máximo 2; as 3 em steps \(troca de frame\) ficam de fora\): /u)
    // só 2 contínuas: sem aviso, mesmo com steps rodando
    await page.goto(`data:text/html;charset=utf-8,${encodeURIComponent('<!doctype html><style>@keyframes b{to{opacity:.5}} i{animation:b 4s linear infinite} i.s{animation:b 4s steps(1,end) infinite}</style><i>1</i><i>2</i><i class="s">3</i><i class="s">4</i><i class="s">5</i>')}`)
    await page.waitForTimeout(100)
    const calm = await collectGpuIdle(page, { settleMs: 50 })
    assert.equal(calm.focusedContinuous, 2)
    assert.equal(calm.focusedSteps, 3)
    assert.equal(focusedWarning(calm), undefined, '2 contínuas + 3 steps está dentro da regra 5')
    await page.close()
  } finally {
    await browser.close()
  }
})

// ---- DESIGN-01 §2.7 regra 6 · preaccept-gpu (Keel 11/11 12:47): sem foco ou após 16 s sem turno ativo, ZERO animações rodando. ----
const looping = (name, target, iterations = 'Infinity', durationMs = 14000) => ({ kind: 'css', name, target, iterations, durationMs })

test('gpu · RED: animação rodando sem foco reprova e diz qual; GREEN: 0 sem foco passa (com foco pode haver)', () => {
  const lamp = looping('lampBreathe', 'div.lampLayer')
  const items = [lamp, looping('personaBreathe', 'img.figure', 'Infinity', 4000), looping('personaBlinkFrame', 'img.figure', 'Infinity', 5200), looping('persona-rail-pulse', 'span.dot', 'Infinity', 2400)]
  const red = evaluateScene(row(), { png: PNG, probe: cleanProbe({ gpu: { focusedRunning: 22, afterBlur: { count: 22, items }, settleMs: 800 } }) })
  assert.deepEqual(failing(red), ['gpu'])
  assert.equal(verdictOf(red), 'FALHOU')
  const detail = checkOf(red, 'gpu').detail
  assert.match(detail, /22 animação\(ões\) rodando com a janela sem foco \(o certo é 0\): lampBreathe em div\.lampLayer \(∞ · 14000 ms\)/u)
  assert.match(detail, /\(\+19\)/u, 'mostra 3 e conta o resto')
  const green = evaluateScene(row(), { png: PNG, probe: cleanProbe() })
  assert.deepEqual(failing(green), [])
  assert.equal(checkOf(green, 'gpu').status, 'ok')
  assert.equal(checkOf(green, 'gpu').detail, '0 animações rodando sem foco (com foco: 2)')
  // após 16 s sem turno ativo (a 2ª metade da regra): o blur zerou, mas a janela parada ainda tem animação rodando
  const idleRed = evaluateScene(row(), { png: PNG, probe: cleanProbe({ gpu: { focusedRunning: 2, afterBlur: { count: 0, items: [] }, afterIdle: { count: 1, items: [lamp], idleMs: 16000 }, settleMs: 800 } }) })
  assert.deepEqual(failing(idleRed), ['gpu'])
  assert.match(checkOf(idleRed, 'gpu').detail, /1 animação\(ões\) rodando após 16 s sem turno ativo \(o certo é 0\): lampBreathe/u)
  const idleGreen = gpuGate({ focusedRunning: 2, afterBlur: { count: 0, items: [] }, afterIdle: { count: 0, items: [], idleMs: 16000 } })
  assert.deepEqual(idleGreen, { ok: true, detail: '0 animações rodando sem foco e após 16 s parada (com foco: 2)' })
  assert.equal(describeAnimation({ name: 'fade', target: 'p#t', iterations: 1, durationMs: 300 }), 'fade em p#t (1× · 300 ms)')
  assert.equal(describeAnimation({ name: 'x', target: 'i', iterations: null, durationMs: null }), 'x em i')
})

test('gpu · sidecar sem a medida (v3) é INCOMPLETO; sonda que falhou também; sem sonda, não verificado', () => {
  const { gpu: _gpu, ...v3 } = cleanProbe({ version: 3 })
  const old = evaluateScene(row(), { png: PNG, probe: v3 })
  assert.equal(checkOf(old, 'gpu').status, 'nao-verificado')
  assert.match(checkOf(old, 'gpu').detail, /sidecar da sonda v3, sem a medida de animações sem foco: recapture com a sonda nova \(DESIGN-01 §2\.7\)/u)
  assert.equal(verdictOf(old), 'INCOMPLETO')
  const broken = evaluateScene(row(), { png: PNG, probe: cleanProbe({ gpu: undefined, gpuError: 'Execution context was destroyed' }) })
  assert.equal(checkOf(broken, 'gpu').status, 'nao-verificado')
  assert.match(checkOf(broken, 'gpu').detail, /a sonda de GPU falhou: Execution context was destroyed/u)
  assert.equal(checkOf(evaluateScene(row(), { png: PNG }), 'gpu').status, 'nao-verificado')
})

test('gpu · contador do Windows: soma por tipo de motor, vale o maior, média das amostras; processo sem motor = ocioso; sem linhas = sem medida', () => {
  assert.deepEqual(parseGpuEngineName('pid_100_luid_0x00000000_0x0000AB12_phys_0_eng_2_engtype_VideoDecode'), { pid: 100, engine: 'VideoDecode' })
  assert.equal(parseGpuEngineName('tick'), undefined)
  const name = (pid, eng, type) => `pid_${String(pid)}_luid_0x00000000_0x0000AB12_phys_0_eng_${String(eng)}_engtype_${type}`
  const rows = [
    { i: 0, n: name(100, 0, '3D'), v: 2 }, { i: 0, n: name(100, 1, '3D'), v: 1 }, { i: 0, n: name(100, 2, 'Copy'), v: 0.5 }, { i: 0, n: name(200, 0, '3D'), v: 40 }, { i: 0, n: 'tick', v: 0 },
    { i: 1, n: name(100, 0, '3D'), v: 1 }, { i: 1, n: 'tick', v: 0 },
  ]
  assert.deepEqual(gpuUtilizationFromRows(rows, [100]), { pct: 2, byEngine: { '3D': 2, Copy: 0.25 }, samples: 2, matched: 4 })
  assert.equal(gpuUtilizationFromRows(rows, [100, 200]).pct, 22, 'dois processos do app: 3D soma 43 e 1 → média 22 (o Persona.exe de outro agente fica de fora pela árvore de processos)')
  assert.deepEqual(gpuUtilizationFromRows(rows, [999]), { pct: 0, byEngine: {}, samples: 2, matched: 0 })
  assert.equal(gpuUtilizationFromRows([], [100]).pct, null)
})

test('gpu · a meta de GPU ociosa: ≤ 1,5 % com foco parado, ≤ 0,5 % sem foco e minimizada; sem número não há ok', () => {
  const rows = gpuIdleVerdict({ focused: 1.2, unfocused: 0.8, minimized: 0.2 })
  assert.deepEqual(rows.map(item => [item.state, item.status]), [['focused', 'ok'], ['unfocused', 'falhou'], ['minimized', 'ok']])
  assert.deepEqual(rows.map(item => item.limit), [1.5, 0.5, 0.5])
  assert.equal(gpuIdleVerdict({ focused: 1.5 })[0].status, 'ok', '1,5 passa (≤)')
  assert.equal(gpuIdleVerdict({ focused: 1.6 })[0].status, 'falhou')
  assert.equal(gpuIdleVerdict({ unfocused: null })[0].status, 'nao-medido')
  assert.deepEqual(gpuIdleVerdict({}), [])
})

// O formato é o do perf-probe-visible.mjs do Cobalt (idleCpu / idleCpuUnfocused / idleCpuMinimized = [{role, pid, rssMb, cpuPct}]).
const perfRun = (gpuFocused, gpuUnfocused, gpuMinimized, extra = {}) => ({
  run: 1, cold: true, marks: {}, readyState: 'complete', visibility: 'visible',
  idleCpu: [{ role: 'main', cpuPct: 1 }, { role: 'gpu', cpuPct: gpuFocused }, { role: 'renderer', cpuPct: 7 }],
  idleCpuUnfocused: [{ role: 'main', cpuPct: 0 }, { role: 'gpu', cpuPct: gpuUnfocused }],
  idleCpuMinimized: [{ role: 'gpu', cpuPct: gpuMinimized }],
  ...extra,
})

test('gpu · relata a GPU ociosa de uma rodada do perf-probe-visible (RED: a v1.1 com 23 %; GREEN: dentro da meta); o proxy diz que é proxy', () => {
  const v11 = perfRun(23, 9, 0)
  assert.deepEqual(gpuIdleFromPerfRun(v11), { source: 'cpu-do-processo-gpu (proxy, passos de 1 ponto)', focused: 23, unfocused: 9, minimized: 0 })
  const red = gpuIdleReport([v11])[0]
  assert.equal(red.ok, false)
  assert.deepEqual(red.rows.map(item => item.status), ['falhou', 'falhou', 'ok'])
  assert.equal(gpuIdleReport([perfRun(1, 0, 0)])[0].ok, true, '1 % com foco (≤ 1,5), 0 sem foco e minimizada')
  // com o número do contador do Windows na rodada, ele vale no lugar do proxy
  const counter = gpuIdleReport([perfRun(23, 9, 0, { gpuUtilization: { focused: 0.9, unfocused: 0.1 } })])[0]
  assert.equal(counter.source, 'contador-gpu')
  assert.equal(counter.ok, true)
  assert.deepEqual(counter.rows.map(item => item.state), ['focused', 'unfocused'], 'só o que foi medido')
  assert.equal(gpuIdleReport([{ run: 2, error: 'no dsh-app://app/ page' }])[0].ok, false, 'rodada com erro nunca passa')
})

test('gpu · linha de comando --perf: rodada acima da meta = código 1; dentro = 0', () => {
  const dir = mkdtempSync(join(tmpdir(), 'preaccept-gpu-perf-'))
  try {
    writeFileSync(join(dir, 'v11.json'), JSON.stringify([perfRun(23, 9, 0)]))
    writeFileSync(join(dir, 'ok.json'), JSON.stringify([perfRun(1, 0, 0)]))
    const red = spawnSync(process.execPath, [join(here, 'preaccept-gpu.mjs'), '--perf', join(dir, 'v11.json')], { encoding: 'utf8' })
    assert.equal(red.status, 1, red.stdout + red.stderr)
    assert.match(red.stdout, /com foco parado\s+23,0 %\s+meta ≤ 1,5 %\s+FALHOU/u)
    assert.match(red.stdout, /VEREDITO: FALHOU/u)
    const green = spawnSync(process.execPath, [join(here, 'preaccept-gpu.mjs'), '--perf', join(dir, 'ok.json')], { encoding: 'utf8' })
    assert.equal(green.status, 0, green.stdout + green.stderr)
    assert.match(green.stdout, /VEREDITO: PASSOU/u)
    assert.equal(spawnSync(process.execPath, [join(here, 'preaccept-gpu.mjs')], { encoding: 'utf8' }).status, 2, 'sem argumento: uso')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// O gate numa página de verdade: o que o `document.getAnimations()` diz tem de bater com o que o gate relata.
test('gpu · página de verdade: RED = animação infinita sem pausa no blur; GREEN = o app pausa no blur; transição finita não vaza; a sonda devolve a página; CLI --cdp', async (context) => {
  const requireFrom = createRequire(join(here, '..', '..', 'packages', 'persona', 'persona-e2e', 'package.json'))
  const userData = mkdtempSync(join(tmpdir(), 'preaccept-gpu-chrome-'))
  let chrome
  let port
  try {
    const { chromium } = requireFrom('playwright')
    port = await new Promise((resolvePort, reject) => {
      const server = createServer()
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => { const { port: free } = server.address(); server.close(() => { resolvePort(free) }) })
    })
    // Contexto persistente: o CLI --cdp (outro processo) enxerga a página no contexto padrão do Chrome.
    chrome = await chromium.launchPersistentContext(userData, { channel: 'chrome', headless: true, viewport: { width: 800, height: 500 }, args: [`--remote-debugging-port=${String(port)}`] })
  } catch (error) {
    rmSync(userData, { recursive: true, force: true })
    context.skip(`sem navegador: ${String(error).slice(0, 80)}`)
    return
  }
  try {
    const { collectGpuIdle, collectProbe } = await import('./preaccept-probe.mjs')
    const css = `@keyframes lampBreathe{from{opacity:.9}to{opacity:1}} @keyframes blink{50%{opacity:.2}}
      .lampLayer{position:absolute;inset:0;width:300px;height:200px;animation:lampBreathe 14s infinite alternate}
      .eye{display:inline-block;width:20px;height:20px;background:#444;animation:blink 2s steps(1,end) infinite}
      body[data-ambient-paused] *{animation-play-state:paused !important}`
    // Um "app" mínimo no molde do que o Cobalt vai entregar: pausa tudo no blur (CSS pelo atributo; WAAPI pelo pause()), volta no focus,
    // e (idle) pausa sozinho depois de `idleAfterMs` sem evento nenhum.
    const html = ({ pauseOnBlur, idleAfterMs }) => `<!doctype html><html><head><style>${css}</style></head><body>
      <div class="lampLayer"></div><i class="eye"></i><i class="eye"></i><p id="t" style="transition:opacity 300ms">Olá</p>
      <script>
        window.__events = []
        const pauseAll = () => { document.body.setAttribute('data-ambient-paused', ''); document.getAnimations().filter(a => a.id === 'cursor').forEach(a => a.pause()) }
        const resumeAll = () => { document.body.removeAttribute('data-ambient-paused'); document.getAnimations().filter(a => a.id === 'cursor').forEach(a => a.play()) }
        let timer
        const arm = () => { clearTimeout(timer); if (${String(idleAfterMs !== undefined)}) timer = setTimeout(pauseAll, ${String(idleAfterMs ?? 0)}) }
        getComputedStyle(document.getElementById('t')).opacity
        document.querySelector('.eye').animate([{ opacity: 1 }, { opacity: 0.5 }], { duration: 900, iterations: Infinity, id: 'cursor' })
        window.addEventListener('blur', () => { window.__events.push('blur'); if (${String(pauseOnBlur)}) { pauseAll(); document.getElementById('t').style.opacity = '0.3' } })
        window.addEventListener('focus', () => { window.__events.push('focus'); resumeAll(); arm() })
        arm()
      </script></body></html>`
    const page = chrome.pages()[0] ?? await chrome.newPage()
    // Cada cena é uma navegação nova: o setContent reaproveita o window (e o `const` do script da cena anterior já estaria declarado).
    const load = (options) => page.goto(`data:text/html;charset=utf-8,${encodeURIComponent(html(options))}`)
    const running = () => page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running').length)
    const grade = (probe) => evaluateScene(row({ expectFoliage: false }), { png: PNG, probe: { ...probe, text: `${probe.text} ${'x'.repeat(20)}` } })

    // ---- RED: a v1.1 de hoje (lampBreathe + olhos + cursor rodando, nada escuta o blur) ----
    await load({ pauseOnBlur: false })
    await page.waitForTimeout(150)
    const red = await collectProbe(page, { focus: false, gpu: { settleMs: 200 } })
    assert.equal(red.version, 4)
    assert.ok(red.gpu.focusedRunning >= 4, `lamp + 2 olhos + cursor rodando com foco (viu ${String(red.gpu.focusedRunning)})`)
    assert.equal(red.gpu.afterBlur.count, red.gpu.focusedRunning, 'o blur não pausou nada: tudo continua rodando')
    assert.ok(red.gpu.afterBlur.items.map(describeAnimation).includes('lampBreathe em div.lampLayer (∞ · 14000 ms)'), JSON.stringify(red.gpu.afterBlur.items))
    assert.ok(red.gpu.afterBlur.items.some(item => item.kind === 'waapi' && item.name === 'cursor'), 'a animação do WAAPI também conta')
    const redChecks = grade(red)
    assert.deepEqual(failing(redChecks), ['gpu'])
    assert.equal(verdictOf(redChecks), 'FALHOU')
    assert.match(checkOf(redChecks, 'gpu').detail, /animação\(ões\) rodando com a janela sem foco \(o certo é 0\)/u)

    // ---- GREEN: o app pausa no blur; a transição de 300 ms que ele dispara ainda está em voo no assentamento e acaba dentro do prazo ----
    await load({ pauseOnBlur: true })
    await page.waitForTimeout(150)
    const green = await collectProbe(page, { focus: false, gpu: { settleMs: 100 } })
    assert.ok(green.gpu.focusedRunning >= 4, JSON.stringify(green.gpu))
    assert.equal(green.gpu.afterBlur.count, 0, JSON.stringify(green.gpu.afterBlur.items))
    assert.deepEqual(failing(grade(green)), [])
    assert.equal(checkOf(grade(green), 'gpu').status, 'ok')
    // a sonda devolve a página como estava: blur e focus, nessa ordem; a pausa saiu e o que rodava volta a rodar
    assert.deepEqual(await page.evaluate(() => window.__events), ['blur', 'focus'])
    assert.ok(await running() >= 3, 'depois do gate a página volta a animar (a próxima cena da régua não herda a pausa)')
    assert.equal(await page.evaluate(() => document.body.hasAttribute('data-ambient-paused')), false)

    // ---- após N s sem turno ativo (a 2ª metade da regra) ----
    await load({ pauseOnBlur: true, idleAfterMs: 700 })
    const idleGreen = await collectGpuIdle(page, { settleMs: 100, idleMs: 1200 })
    assert.equal(idleGreen.afterBlur.count, 0)
    assert.equal(idleGreen.afterIdle.count, 0, 'o app se pausou sozinho depois de 700 ms parado')
    assert.equal(gpuGate(idleGreen).ok, true)
    await load({ pauseOnBlur: true })
    const idleRed = await collectGpuIdle(page, { settleMs: 100, idleMs: 1200 })
    assert.equal(idleRed.afterBlur.count, 0)
    assert.ok(idleRed.afterIdle.count >= 3, 'pausa no blur, mas parado com foco continua animando')
    const idleGate = gpuGate(idleRed)
    assert.equal(idleGate.ok, false)
    assert.match(idleGate.detail, /rodando após 1 s sem turno ativo \(o certo é 0\)/u)

    // ---- a linha de comando num Chrome aberto por CDP: o RED sai com 1; o GREEN com 0 ----
    await load({ pauseOnBlur: false })
    await page.waitForTimeout(150)
    const cliRed = spawnSync(process.execPath, [join(here, 'preaccept-gpu.mjs'), '--cdp', String(port), '--settle-ms', '200'], { encoding: 'utf8' })
    assert.equal(cliRed.status, 1, cliRed.stdout + cliRed.stderr)
    assert.match(cliRed.stdout, /sem foco \(blur \+ 200 ms\)\s*\.+\s*\d+\s+FALHOU/u)
    assert.match(cliRed.stdout, /lampBreathe em div\.lampLayer/u)
    assert.match(cliRed.stdout, /VEREDITO: FALHOU/u)
    await load({ pauseOnBlur: true })
    await page.waitForTimeout(150)
    const cliGreen = spawnSync(process.execPath, [join(here, 'preaccept-gpu.mjs'), '--cdp', String(port), '--settle-ms', '200'], { encoding: 'utf8' })
    assert.equal(cliGreen.status, 0, cliGreen.stdout + cliGreen.stderr)
    assert.match(cliGreen.stdout, /VEREDITO: PASSOU/u)
  } finally {
    await chrome.close()
    rmSync(userData, { recursive: true, force: true })
  }
})
