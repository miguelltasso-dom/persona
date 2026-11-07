// PRÉ-ACEITE MECÂNICO (Keel 05/11 03:27; critérios da Muse 03:27): tudo o que uma máquina confere numa captura ANTES de a Muse julgar o desenho.
// Este módulo é PURO (sem navegador, sem disco): as listas de proibidos, as regras de cobertura e o veredito por cena. A sonda que roda na página
// está em `preaccept-probe.mjs`; a linha de comando em `preaccept.mjs`; os testes em `preaccept.test.mjs`.

export const DEFAULT_SCHEMES = ['light', 'dark']
export const DEFAULT_VIEWPORTS = ['1440x900', '960x640', 'zoom200']
/** A folhagem do trilho tem de aparecer nestes tamanhos (a 200% o trilho encolhe e ela some por desenho). */
export const DEFAULT_FOLIAGE_VIEWPORTS = ['1440x900', '960x640']
/** As personas do seed de dev e as do time de exemplo: o que a regra do artigo confere. Cada manifesto pode trazer o seu `roster`. */
export const DEFAULT_ROSTER = ['Atlas', 'Bento', 'Nina', 'Sol', 'Luna', 'Bolota', 'Pipa', 'Capi', 'Bia', 'Teo', 'Téo', 'Lia', 'Caio']
export const MIN_PNG_BYTES = 10_240
/** Uma tela de verdade tem texto: menos que isto é página em branco (a galeria do Ember já exigia 20; aqui 10 para estados vazios curtos). */
export const MIN_VISIBLE_TEXT = 10
/** Imagem pequena (um cartão recortado) comprime mais: o piso de "em branco" cai com a área (10 KB só vale para a janela inteira). */
export function minBytesFor(png) {
  if (png.width === undefined || png.height === undefined) return MIN_PNG_BYTES
  return Math.min(MIN_PNG_BYTES, Math.max(1500, Math.round((png.width * png.height) / 100)))
}

/** As checagens, na ordem em que aparecem no relatório. */
export const CHECKS = ['cobertura', 'axe', 'alvos', 'overflow', 'dialogo', 'console', 'proibidos', 'artigo', 'tema', 'folhagem', 'imagens', 'icones', 'foco']

/** A lista de proibidos NA TELA (pt e en). `re` roda sobre o texto visível da cena; `id` é estável (vai no relatório). */
export const PROHIBITED = [
  { id: 'maestro', label: 'Maestro', re: /\bMaestro\b/iu },
  { id: 'mcp', label: 'MCP', re: /\bMCP\b/u },
  { id: 'allowlist', label: 'allowlist', re: /\ballowlist\b/iu },
  { id: 'runner', label: 'runner', re: /\brunner\b/iu },
  { id: 'harness', label: 'harness', re: /\bharness\b/iu },
  { id: 'slug', label: 'slug', re: /\bslug\b/iu },
  { id: 'undefined', label: 'undefined', re: /\bundefined\b/iu },
  { id: 'null', label: 'null', re: /\bnull\b/iu },
  { id: 'nan', label: 'NaN', re: /\bNaN\b/u },
  { id: 'object', label: '[object', re: /\[object\b/iu },
  { id: 'todo', label: 'TODO', re: /\bTODO\b/u },
  { id: 'lorem', label: 'lorem', re: /\blorem\b/iu },
  { id: 'mock', label: 'mock', re: /\bmock\b/iu },
  { id: 'fixture', label: 'fixture', re: /\bfixture\b/iu },
  { id: 'cota-nao-medida', label: 'cota não medida', re: /cota\s+n[ãa]o\s+medida/iu },
  { id: 'skill-ensinada', label: 'Skill ensinada', re: /Skill\s+ensinada/iu },
  { id: 'marcador', label: '[[ (marcador do host)', re: /\[\[/u },
  { id: 'persona-tool', label: 'persona_ (ferramenta interna)', re: /\bpersona_[a-z]/u },
  { id: 'em-andamento-avulso', label: '"Em andamento:" avulso', re: /(^|\n)\s*Em andamento:/u },
  // Dinheiro: US$ nunca; "$ 12" (dólar solto) só passa quando a cena diz que mostra dinheiro de verdade (`allowCurrency`).
  { id: 'us-dolar', label: 'US$', re: /US\$/u },
  { id: 'dolar', label: '$ + número', re: /(^|[^A-Za-z])\$\s?\d/u, unlessScene: 'allowCurrency' },
  // Autor/id técnico visível: `team:split`, `routine:manha` (letra, ":" sem espaço, token). Horas ("12:30") e URLs ("https://") não casam.
  { id: 'autor-com-dois-pontos', label: 'autor/id com ":" visível', re: /(^|[\s(])[a-z][a-z0-9_-]{1,}:[a-z0-9][a-z0-9_-]*(?=$|[\s),.;])/u },
]

/** Um id hex solto de 8 ou mais caracteres (tem de misturar letra a-f e dígito, para não pegar palavra nem número). */
const HEX_RE = /\b(?=[0-9a-f]*[0-9])(?=[0-9a-f]*[a-f])[0-9a-f]{8,}\b/iu

/** '@nome' no começo de um título de tarefa (os títulos vêm da sonda, um por elemento). */
const TITLE_AT_RE = /^\s*@\S/u

/** O que bate com a lista, com o trecho em volta (para a pessoa achar). */
export function findProhibited(text, { allowCurrency = false } = {}) {
  const found = []
  const body = String(text ?? '')
  for (const rule of PROHIBITED) {
    if (rule.unlessScene === 'allowCurrency' && allowCurrency) continue
    const match = rule.re.exec(body)
    if (match === null) continue
    found.push({ rule: rule.id, label: rule.label, sample: sampleAround(body, match.index, match[0].length) })
  }
  const hex = HEX_RE.exec(body)
  if (hex !== null) found.push({ rule: 'id-hex', label: 'id hex solto (≥ 8 caracteres)', sample: sampleAround(body, hex.index, hex[0].length) })
  return found
}

/** "@handle · cargo · setor": o subtítulo do cartão/perfil da persona (PERSONA-CARD-SPEC), não um título de tarefa. */
const PERSONA_HANDLE_LINE_RE = /^\s*@[\p{L}\p{N}_.-]+\s+·\s/u

export function findAtTitles(titles) {
  return (titles ?? []).filter(title => TITLE_AT_RE.test(title) && !PERSONA_HANDLE_LINE_RE.test(title)).map(title => ({ rule: 'arroba-no-titulo', label: "'@nome' no começo de título de tarefa", sample: String(title).slice(0, 80) }))
}

/** Palavras depois das quais " a Nina" é, sem dúvida, artigo ("com a Nina", "para a Nina", "e a Bia"). */
const PREPOSITIONS_BEFORE_ARTICLE = 'com|para|pra|por|de|em|sobre|entre|até|sem|e|ou|que|se|quando|como|mas|contra|desde|após|sob|segundo'

/**
 * Nenhum artigo antes do nome de persona em texto gerado pelo app: " a Nina", " o Atlas" (Muse 03:27).
 * Reprova (`severity: 'falhou'`) o que é artigo sem dúvida: "o Atlas" (sempre), "A Nina" no começo de frase/linha/parênteses e "com/para/… a Nina".
 * O "a" depois de um verbo ou substantivo ("pediu a Téo", "pediu ajuda a Téo", "Ensinar a Nina") é preposição na maioria dos casos:
 * vira AVISO (`severity: 'aviso'`) para a Muse olhar, não reprova.
 */
export function articleBeforePersona(text, roster = DEFAULT_ROSTER) {
  const names = roster.filter(name => typeof name === 'string' && name.length > 0).map(escapeRe)
  if (names.length === 0) return []
  const body = String(text ?? '')
  const name = `(?:${names.join('|')})(?![\\p{L}\\p{N}])`
  const hard = [
    new RegExp(`(?<![\\p{L}\\p{N}])[Oo] ${name}`, 'u'),
    new RegExp(`(?:^|\\n|[.!?:;·—(“"'])\\s*[Aa] ${name}`, 'u'),
    new RegExp(`(?<![\\p{L}\\p{N}])(?:${PREPOSITIONS_BEFORE_ARTICLE}) a ${name}`, 'iu'),
  ]
  const found = []
  for (const re of hard) {
    const match = re.exec(body)
    if (match !== null) found.push({ rule: 'artigo-antes-de-persona', label: 'artigo antes de nome de persona', severity: 'falhou', sample: sampleAround(body, match.index, match[0].length) })
  }
  if (found.length > 0) return found
  const soft = new RegExp(`(?<![\\p{L}\\p{N}])a ${name}`, 'u').exec(body)
  return soft === null ? [] : [{ rule: 'a-antes-de-persona', label: '"a" antes de nome de persona (preposição ou artigo?)', severity: 'aviso', sample: sampleAround(body, soft.index, soft[0].length) }]
}

function escapeRe(text) { return text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&') }

function sampleAround(text, index, length) {
  const from = Math.max(0, index - 24)
  const to = Math.min(text.length, index + length + 24)
  return text.slice(from, to).replace(/\s+/gu, ' ').trim()
}

/** `{scene}-{scheme}-{viewport}` por padrão; cada dono pode ter o seu molde (Prism: `{scheme}-{viewport}-{scene}`) e os seus nomes de tema/tamanho. */
export function fileNameFor(manifest, scene, scheme, viewport) {
  const template = manifest.fileTemplate ?? '{scene}-{scheme}-{viewport}'
  const schemeName = manifest.schemeNames?.[scheme] ?? scheme
  const viewportName = manifest.viewportNames?.[viewport] ?? viewport
  return template.replace('{scene}', scene).replace('{scheme}', schemeName).replace('{viewport}', viewportName)
}

/** O que o manifesto promete: cena × tema × tamanho. `file` é o nome-base da captura (sem extensão). */
export function plan(manifest) {
  const schemes = manifest.schemes ?? DEFAULT_SCHEMES
  const viewports = manifest.viewports ?? DEFAULT_VIEWPORTS
  const foliageViewports = new Set(manifest.foliageViewports ?? DEFAULT_FOLIAGE_VIEWPORTS)
  const rows = []
  for (const scene of manifest.scenes ?? []) {
    const spec = typeof scene === 'string' ? { id: scene } : scene
    for (const viewport of spec.viewports ?? viewports) {
      for (const scheme of spec.schemes ?? schemes) {
        rows.push({
          scene: spec.id,
          scheme,
          viewport,
          file: fileNameFor(manifest, spec.id, scheme, viewport),
          allowCurrency: spec.allowCurrency === true,
          // Uma cena que a Muse (ou o dono) já REJEITOU não volta como "pronta" só porque a máquina não achou defeito: `rejected: "motivo"` no manifesto.
          ...(typeof spec.rejected === 'string' && spec.rejected.trim() !== '' ? { rejected: spec.rejected.trim() } : {}),
          // A folhagem só se espera em cenas do shell inteiro (`shell !== false`) e nos tamanhos largos.
          expectFoliage: manifest.shell !== false && spec.shell !== false && foliageViewports.has(viewport),
        })
      }
    }
  }
  return rows
}

/**
 * As checagens de UMA cena; devolve `[{check, status: 'ok'|'falhou'|'nao-verificado', detail}]`.
 * `png` = {bytes, width, height} (ou undefined: faltou a imagem); `probe` = o sidecar da sonda (ou undefined: captura antiga);
 * `legacy` = o que o log antigo diz ({axeCount, axeList, overflow, theme, text}).
 */
export function evaluateScene(row, { png, probe, legacy }, { roster = DEFAULT_ROSTER, sizes } = {}) {
  const checks = []
  const add = (check, status, detail = '') => checks.push({ check, status, detail })

  // Rejeitada por uma pessoa (Muse): nunca "pronta", mesmo que as 13 checagens passem.
  if (row.rejected !== undefined) add('rejeitada', 'falhou', `rejeitada: ${row.rejected}`)

  if (png === undefined) add('cobertura', 'falhou', `falta a imagem ${row.file}.png`)
  else if (png.bytes < minBytesFor(png)) add('cobertura', 'falhou', `imagem em branco (${png.bytes} B)`)
  else if (probe !== undefined && String(probe.text ?? '').trim().length < MIN_VISIBLE_TEXT) add('cobertura', 'falhou', `tela sem texto (${String(probe.text ?? '').trim().length} caracteres visíveis)`)
  else if (sizes?.[row.viewport] !== undefined && png.width !== undefined && (png.width !== sizes[row.viewport][0] || png.height !== sizes[row.viewport][1])) {
    add('cobertura', 'falhou', `tamanho ${png.width}×${png.height}, esperado ${sizes[row.viewport][0]}×${sizes[row.viewport][1]}`)
  } else add('cobertura', 'ok')

  // axe: crítico/sério reprova (o target-size vai para "alvos"); o resto é aviso. Fonte: a sonda; na falta dela, o log antigo.
  const axeList = probe?.axe ?? legacy?.axeList
  if (axeList !== undefined) {
    const bad = axeList.filter(item => (item.impact === 'critical' || item.impact === 'serious') && item.id !== 'target-size')
    add('axe', bad.length === 0 ? 'ok' : 'falhou', bad.map(item => `${item.impact} ${item.id} x${item.nodes ?? '?'}`).join('; '))
  } else if (legacy?.axeCount !== undefined) {
    add('axe', legacy.axeCount === 0 ? 'ok' : 'falhou', legacy.axeCount === 0 ? '' : `${legacy.axeCount} violação(ões) (log antigo, sem o detalhe)`)
  } else {
    add('axe', 'nao-verificado', probe?.axeError === undefined ? 'sem axe na sonda nem log' : `axe falhou: ${probe.axeError}`)
  }

  // alvos clicáveis ≥ 24 px: a regra target-size do axe (com as exceções do WCAG 2.5.8); sem axe, a medida bruta da sonda.
  const targetHits = (probe?.axe ?? legacy?.axeList)?.filter(item => item.id === 'target-size')
  if (targetHits !== undefined) {
    // O axe é o veredito (as exceções do WCAG 2.5.8: espaçamento, link no meio do texto). O que a medida bruta acha < 24 px e o axe aceita vira AVISO para o olho de uma pessoa (Quill 06:00).
    const accepted = targetHits.length === 0 ? (probe?.smallTargets ?? []) : []
    add('alvos', targetHits.length === 0 ? 'ok' : 'falhou', targetHits.length > 0
      ? targetHits.map(item => `target-size x${item.nodes ?? '?'}${item.sample?.length ? `: ${item.sample.slice(0, 2).join(' | ')}` : ''}`).join('; ')
      : accepted.length === 0 ? '' : `aviso: ${accepted.length} alvo(s) < 24 px que o target-size aceita (espaçamento/linha de texto): ${accepted.slice(0, 3).map(item => `“${item.label}” ${item.w}×${item.h}`).join(' | ')}`)
  } else if (probe?.smallTargets !== undefined) {
    add('alvos', probe.smallTargets.length === 0 ? 'ok' : 'falhou', probe.smallTargets.slice(0, 3).map(item => `${item.tag} “${item.label}” ${item.w}×${item.h}`).join(' | '))
  } else if (legacy?.axeCount === 0) add('alvos', 'ok', 'o axe do log (wcag22aa, que inclui target-size) deu 0')
  else add('alvos', 'nao-verificado', 'sem axe nem sonda')

  const overflow = probe?.overflowX ?? legacy?.overflow
  add('overflow', overflow === undefined ? 'nao-verificado' : overflow === 0 ? 'ok' : 'falhou', overflow === undefined ? 'sem sonda nem log' : overflow === 0 ? '' : `${overflow}px de estouro horizontal`)

  // Diálogo: a caixa inteira e o rodapé cabem na janela (a 200% a janela tem 360 px de altura). Sidecar da sonda v1 não media: aviso, não bloqueio.
  if (probe !== undefined) {
    if (probe.dialogs === undefined) add('dialogo', 'ok', 'aviso: sidecar da sonda v1, sem a medida de diálogo (recapture com a sonda nova)')
    else {
      const cut = probe.dialogs.filter(dialog => dialog.cut.length > 0)
      add('dialogo', cut.length === 0 ? 'ok' : 'falhou', cut.map(dialog => `“${dialog.label}”: ${dialog.cut.join(', ')}`).join(' | '))
    }
  }

  const text = probe?.text ?? legacy?.text
  if (probe?.consoleErrors === undefined) add('console', 'nao-verificado', 'sem sonda (captura sem o preaccept-probe)')
  else add('console', probe.consoleErrors.length === 0 ? 'ok' : 'falhou', probe.consoleErrors.slice(0, 3).join(' | ').slice(0, 300))

  if (text === undefined) {
    add('proibidos', 'nao-verificado', 'sem texto visível (sonda ou tela.json)')
    add('artigo', 'nao-verificado', 'sem texto visível')
  } else {
    const prohibited = [...findProhibited(text, { allowCurrency: row.allowCurrency }), ...findAtTitles(probe?.taskTitles)]
    add('proibidos', prohibited.length === 0 ? 'ok' : 'falhou', prohibited.slice(0, 4).map(item => `${item.label}: “${item.sample}”`).join(' | '))
    const articles = articleBeforePersona(text, roster)
    const hardArticles = articles.filter(item => item.severity === 'falhou')
    if (hardArticles.length > 0) add('artigo', 'falhou', hardArticles.map(item => `“${item.sample}”`).join(' | '))
    else add('artigo', 'ok', articles.length === 0 ? '' : `aviso: “${articles[0].sample}” (preposição ou artigo?)`)
  }

  const dark = probe !== undefined ? probe.darkTheme : legacy?.theme === undefined ? undefined : legacy.theme === 'true'
  if (dark === undefined) add('tema', 'nao-verificado', 'sem sonda nem log do tema')
  else add('tema', dark === (row.scheme === 'dark') ? 'ok' : 'falhou', dark === (row.scheme === 'dark') ? '' : `a cena é ${row.scheme} e o body diz data-ds-dark-theme=${String(dark)}`)

  if (row.expectFoliage) {
    if (probe === undefined) add('folhagem', 'nao-verificado', 'sem sonda')
    else add('folhagem', probe.foliageVisible === true ? 'ok' : 'falhou', probe.foliageVisible === true ? '' : `a folhagem do trilho não está visível (${probe.foliageImages ?? 0} imagem(ns) de folhagem na página)`)
  }

  if (probe === undefined) {
    add('imagens', 'nao-verificado', 'sem sonda')
    add('icones', 'nao-verificado', 'sem sonda')
    add('foco', 'nao-verificado', 'sem sonda')
    return checks
  }
  const brokenImages = probe.brokenImages ?? []
  // D-069 (Muse 07/11): um avatar de retrato em inicial ("T", "N") é uma persona sem rosto. Só AVISO (um retrato que não é persona seria falso alarme); a sonda antiga não media: sem o campo, sem aviso.
  const letterFaces = probe.initialsAvatars ?? []
  add('imagens', brokenImages.length === 0 ? 'ok' : 'falhou', brokenImages.length > 0
    ? brokenImages.slice(0, 3).join(' | ')
    : letterFaces.length === 0 ? '' : `aviso: ${letterFaces.length} avatar(es) de retrato em inicial (D-069: persona nunca é letra): ${[...new Set(letterFaces)].slice(0, 4).map(letter => `“${letter}”`).join(' ')}`)
  const emptyIcons = probe.emptyIcons ?? []
  add('icones', emptyIcons.length === 0 ? 'ok' : 'falhou', emptyIcons.slice(0, 3).join(' | '))
  if (probe.focus === undefined) add('foco', 'nao-verificado', 'a sonda não apertou Tab nesta cena')
  else add('foco', probe.focus.visible ? 'ok' : 'falhou', probe.focus.visible ? '' : `o 1º Tab não mostra foco visível (${probe.focus.element})`)
  return checks
}

/** PASSOU só se nada falhou E nada ficou sem verificar; "INCOMPLETO" = não falhou mas falta sonda (captura antiga). */
export function verdictOf(checks) {
  if (checks.some(item => item.status === 'falhou')) return 'FALHOU'
  if (checks.some(item => item.status === 'nao-verificado')) return 'INCOMPLETO'
  return 'PASSOU'
}

/**
 * Lê o log antigo de uma régua. Formatos aceitos:
 *   Ember  `[<cena> <tema> <tamanho>] axe=N pageOverflow=M`  e  `[axe <cena> <tema> <tamanho>] <impacto> <regra> xN :: …`
 *   Prism  `[<tema> <tamanho> <cena>] tema=<v> sobraHorizontal=<n> fundo=…`  e  `[axe <tema> <tamanho> <cena>] N violacao(oes)` + `[axe …]   <impacto> <regra> xN :: …`
 * Devolve Map "cena|tema|tamanho" → {axeCount, axeList, overflow, theme}. Linhas mais novas vencem as antigas (a mesma cena refeita).
 */
export function parseLegacyLog(text) {
  const byKey = new Map()
  const entry = (scene, scheme, viewport) => {
    const key = `${scene}|${scheme}|${viewport}`
    if (!byKey.has(key)) byKey.set(key, { axeCount: undefined, overflow: undefined, theme: undefined, axeList: [], detailSeen: false })
    return byKey.get(key)
  }
  const reset = (item) => { item.axeList = []; item.detailSeen = false }
  for (const line of String(text ?? '').split(/\r?\n/u)) {
    let m = /^\[(\S+) (light|dark) (\S+)\] axe=(\d+) pageOverflow=(\d+)/u.exec(line)
    if (m !== null) {
      const item = entry(m[1], m[2], m[3])
      reset(item)
      item.axeCount = Number(m[4])
      item.overflow = Number(m[5])
      continue
    }
    m = /^\[axe (\S+) (light|dark) (\S+)\] (critical|serious|moderate|minor) (\S+) x(\d+)/u.exec(line)
    if (m !== null) { const item = entry(m[1], m[2], m[3]); item.axeList.push({ impact: m[4], id: m[5], nodes: Number(m[6]) }); item.detailSeen = true; continue }
    m = /^\[(light|dark) (\S+) (\S+)\] tema=(\S+) sobraHorizontal=(-?\d+)/u.exec(line)
    if (m !== null) {
      const item = entry(m[3], m[1], m[2])
      reset(item)
      item.theme = m[4]
      item.overflow = Math.max(0, Number(m[5]))
      continue
    }
    m = /^\[axe (light|dark) (\S+) (\S+)\] (\d+) violacao\(oes\)/u.exec(line)
    if (m !== null) { const item = entry(m[3], m[1], m[2]); item.axeCount = Number(m[4]); item.axeList = []; item.detailSeen = false; continue }
    m = /^\[axe (light|dark) (\S+) (\S+)\]\s+(critical|serious|moderate|minor) (\S+) x(\d+)/u.exec(line)
    if (m !== null) { const item = entry(m[3], m[1], m[2]); item.axeList.push({ impact: m[4], id: m[5], nodes: Number(m[6]) }); item.detailSeen = true }
  }
  for (const item of byKey.values()) {
    if (item.axeCount === 0) item.axeList = []
    else if (!item.detailSeen) item.axeList = undefined
    delete item.detailSeen
  }
  return byKey
}

/**
 * Lê um `report.json` / `report-all.json` das réguas do Ember (shell: {shot, scheme, viewport, axe, pageOverflow}; galeria: {state, scheme, viewport, axe, docScrollOverflow}).
 * Mesmo formato de saída do `parseLegacyLog`. Linhas com `error` não contam (a captura não saiu).
 */
export function parseLegacyReportJson(json) {
  const byKey = new Map()
  for (const item of json?.report ?? []) {
    const scene = item.shot ?? item.state
    if (scene === undefined || item.error !== undefined) continue
    const overflow = item.pageOverflow ?? item.docScrollOverflow
    byKey.set(`${scene}|${item.scheme}|${item.viewport}`, {
      axeCount: typeof item.axe === 'number' ? item.axe : undefined,
      axeList: item.axe === 0 ? [] : undefined,
      overflow: typeof overflow === 'number' ? Math.max(0, overflow) : undefined,
      theme: undefined,
    })
  }
  return byKey
}

/** O relatório inteiro: por cena, o resumo por dono e a lista "pronto para a Muse" (só o que passou nos modos esperados). */
export function buildReport(manifest, rows, results, { generatedAt = new Date().toISOString() } = {}) {
  const scenes = rows.map((row) => {
    const result = results.get(row.file) ?? { checks: [], verdict: 'FALHOU' }
    return { ...row, verdict: result.verdict, checks: result.checks }
  })
  const byScene = new Map()
  for (const item of scenes) {
    const list = byScene.get(item.scene) ?? []
    list.push(item)
    byScene.set(item.scene, list)
  }
  const readyForMuse = []
  const notReady = []
  for (const [scene, list] of byScene) {
    const verdict = list.every(item => item.verdict === 'PASSOU') ? 'PASSOU' : list.some(item => item.verdict === 'FALHOU') ? 'FALHOU' : 'INCOMPLETO'
    const entry = { scene, verdict, modes: list.length, failing: list.filter(item => item.verdict !== 'PASSOU').map(item => `${item.scheme} ${item.viewport}`) }
    ;(verdict === 'PASSOU' ? readyForMuse : notReady).push(entry)
  }
  const count = verdict => scenes.filter(item => item.verdict === verdict).length
  // Avisos: o que passou mas pede o olho de uma pessoa (detalhe começando por "aviso:"); uma linha por cena + checagem + texto.
  const warnings = []
  const seen = new Map()
  const oldProbeScenes = new Set()
  for (const item of scenes) {
    for (const check of item.checks) {
      if (check.status !== 'ok' || !check.detail.startsWith('aviso:')) continue
      // "sidecar da sonda v1": um aviso só para o lote inteiro (não uma linha por cena).
      if (check.detail.includes('sidecar da sonda v1')) { oldProbeScenes.add(item.scene); continue }
      // Uma linha por cena + checagem (o mesmo aviso nos 6 modos não vira 6 linhas): o 1º modo aparece, os outros só contam.
      const key = `${item.scene}|${check.check}`
      const previous = seen.get(key)
      if (previous !== undefined) { previous.otherModes += 1; continue }
      const entry = { scene: item.scene, check: check.check, detail: check.detail.slice('aviso:'.length).trim(), mode: `${item.scheme} ${item.viewport}`, otherModes: 0 }
      seen.set(key, entry)
      warnings.push(entry)
    }
  }
  if (oldProbeScenes.size > 0) warnings.unshift({ scene: `${oldProbeScenes.size} cena(s)`, check: 'dialogo', detail: 'sidecar da sonda v1, sem a medida de diálogo (cabe na janela, rodapé à vista): recapture com a sonda nova se a cena tiver diálogo', mode: 'lote' })
  return {
    warnings,
    owner: manifest.owner ?? '?',
    bundle: manifest.bundle ?? '?',
    generatedAt,
    skippedChecks: manifest.skipChecks ?? [],
    legacyOk: manifest.legacyOk === true,
    totals: { scenes: byScene.size, captures: scenes.length, passou: count('PASSOU'), falhou: count('FALHOU'), incompleto: count('INCOMPLETO'), scenesReady: readyForMuse.length },
    readyForMuse,
    notReady,
    scenes,
  }
}

export function renderMarkdown(report) {
  const out = []
  out.push(`# Pré-aceite mecânico · ${report.owner} · bundle ${report.bundle}`)
  out.push('')
  out.push(`${report.totals.scenes} cenas, ${report.totals.captures} capturas: **${report.totals.passou} passou**, ${report.totals.falhou} falhou, ${report.totals.incompleto} incompleto (falta sonda ou log). Cenas prontas para a Muse: **${report.totals.scenesReady} de ${report.totals.scenes}**.`)
  if (report.legacyOk) out.push('\n> **Lote antigo (sem sonda).** Valem cobertura, axe e overflow (pelos logs) e o que o log der de tema; console, texto proibido, artigo, folhagem, imagens, ícones e foco NÃO foram conferidos. Recapture com o preaccept-probe antes de chamar a Muse.')
  if (report.skippedChecks.length > 0) out.push(`\n> Checagens dispensadas pelo manifesto: ${report.skippedChecks.join(', ')}.`)
  out.push('')
  out.push('## Pronto para a Muse (só o que passou em todos os modos)')
  out.push(report.readyForMuse.length === 0 ? '_nenhuma cena ainda_' : report.readyForMuse.map(item => `- ${item.scene}`).join('\n'))
  out.push('')
  out.push('## Ainda não')
  if (report.notReady.length === 0) out.push('_nada pendente_')
  for (const item of report.notReady) {
    out.push(`- **${item.scene}** — ${item.verdict} em: ${item.failing.join(', ')}`)
    const first = report.scenes.find(scene => scene.scene === item.scene && scene.verdict === item.verdict)
    for (const check of first?.checks.filter(c => c.status !== 'ok') ?? []) out.push(`  - ${check.check}: ${check.status === 'nao-verificado' ? 'não verificado' : 'FALHOU'}${check.detail === '' ? '' : ` — ${check.detail}`}`)
    if (first === undefined) out.push('  - cobertura: nenhuma captura')
  }
  if ((report.warnings ?? []).length > 0) {
    out.push('')
    out.push('## Avisos (não reprovam; um olho humano decide)')
    for (const item of report.warnings) out.push(`- **${item.scene}** (${item.check}, ${item.mode}${item.otherModes > 0 ? ` e mais ${item.otherModes} modo(s)` : ''}): ${item.detail}`)
  }
  out.push('')
  out.push('## Por captura')
  out.push('| cena | tema | tamanho | veredito | o que não passou |')
  out.push('|---|---|---|---|---|')
  for (const scene of report.scenes) {
    const bad = scene.checks.filter(c => c.status !== 'ok').map(c => `${c.check}${c.status === 'nao-verificado' ? '?' : ''}`).join(', ')
    out.push(`| ${scene.scene} | ${scene.scheme} | ${scene.viewport} | ${scene.verdict} | ${bad} |`)
  }
  out.push('')
  out.push('Legenda: `?` = não verificado (sem sonda/log). Regras: `scripts/persona/preaccept-lib.mjs` (lista de proibidos, regra do artigo, cobertura).')
  return `${out.join('\n')}\n`
}
