// SALA LIMPA (Gauge 11/11, PLANO-COLHEITA): barra o que lembra o agentes.chat (AGPL) em arquivos NOVOS ou ALTERADOS da Persona (MIT).
//
//   node scripts/persona/check-cleanroom.mjs                      (alterações da árvore de trabalho em relação ao HEAD + arquivos novos)
//   node scripts/persona/check-cleanroom.mjs --base persona-dev   (tudo que difere de <ref>: commitado ou não)
//   node scripts/persona/check-cleanroom.mjs --root <worktree>    (checa a worktree de outro dono)
//   node scripts/persona/check-cleanroom.mjs --files a.ts b.css   (só esses arquivos, inteiros)
//   node scripts/persona/check-cleanroom.mjs --all                (todos os arquivos versionados; o legado do fork pode acusar)
// Opções: --clone <pasta> (padrão C:\Users\migue\dev\_avaliacao\agentes-chat ou $PERSONA_CLEANROOM_CLONE) · --no-clone · --allow-missing-clone (sem o clone a checagem REPROVA por padrão: falha fechada) · --strict-names
//         --no-cache (relê o clone inteiro, ~85 s) · cache em %TEMP%\persona-cleanroom-cache ($PERSONA_CLEANROOM_CACHE muda): só hashes numéricos + nomes de arquivo, refeito sozinho se o clone mudar
//         --allow <json> (padrão scripts/persona/check-cleanroom.allow.json) · --json · --report <arquivo.json> · --quiet
//
// Três regras:
//   marca  (FALHA)  : 'agentes.chat', 'agenteschat', 'Codari', 'Jev', 'Lodi' (e variações de caixa/hífen) em linha adicionada, em arquivo novo ou no NOME do arquivo.
//   trecho (FALHA)  : 3 linhas seguidas, 1 linha longa (>= 80 car.) ou 1 texto/frase (>= 50 car.) IDÊNTICOS (sem espaços a mais) a algo do clone.
//                     O clone é lido por máquina só para comparar; o relatório mostra o NOSSO arquivo:linha e o NOME do arquivo de lá, nunca o conteúdo. NÃO abra o arquivo do clone.
//   nome   (AVISO)  : nomes internos deles ('talker', 'unbacked', 'untried', 'findable', 'endsAsking'…). Vira FALHA com --strict-names.
// Fora do alcance (para não acusar a si mesma): .maestri/, persona-spec/**/*.{md,json,txt,html}, node_modules, build, este script e o teste dele.
// Exceção justificada: scripts/persona/check-cleanroom.allow.json → { "allow": [{ "file": "prefixo/ou/arquivo", "regra": "marca|trecho|nome", "motivo": "…" }] } (regra opcional = vale para todas).
// Saída: 0 = limpo (avisos não reprovam), 1 = reprovou, 2 = uso errado. O Ember chama este script no pré-aceite de todo item da colheita.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..', '..')
export const DEFAULT_CLONE = 'C:\\Users\\migue\\dev\\_avaliacao\\agentes-chat'

// ---------------------------------------------------------------- regras de marca / nome

/** Marcas que reprovam. Letras de palavra dos dois lados barram falso positivo ("Jevons"); camelCase (jevClient) conta. */
export const MARK_RULES = [
  // "agentes chat" com espaço é português comum: só vale com . - _ no meio.
  { id: 'agentes.chat', re: /agentes[.\-_]chat/iu },
  { id: 'agenteschat', re: /agenteschat/iu },
  // P2-03: a marca com inicial maiúscula DENTRO de um identificador camelCase também conta (useJev, fetchLodiPlan, CodariClient): fronteira minúscula→Maiúscula.
  { id: 'Codari', re: /(?:(?<![\p{L}\p{N}])(?:Codari|codari|CODARI)|(?<=[\p{Ll}\p{N}])Codari)(?![a-z\p{N}])/u },
  { id: 'Jev', re: /(?:(?<![\p{L}\p{N}])(?:Jev|jev|JEV)|(?<=[\p{Ll}\p{N}])Jev)(?![a-z\p{N}])/u },
  { id: 'Lodi', re: /(?:(?<![\p{L}\p{N}])(?:Lodi|lodi|LODI)|(?<=[\p{Ll}\p{N}])Lodi)(?![a-z\p{N}])/u },
]

/**
 * Nomes internos do agentes.chat que o PLANO-COLHEITA proíbe em código nosso (os nossos são em português). Aviso; --strict-names reprova.
 * P2-03: cada nome é uma lista de PALAVRAS e casa em qualquer caixa e em qualquer grafia de identificador (askChoices, AskChoices, ask_choices, ask-choices, answerAskChoices):
 * o texto é "desmontado" (fronteira camelCase vira _, tudo minúsculo) antes da busca. `id` continua sendo o nome canônico que o relatório mostra.
 */
export const NAME_WORDS = [
  { id: 'talker', words: ['talker'] },
  { id: 'unbacked', words: ['unbacked'] },
  { id: 'untried', words: ['untried'] },
  { id: 'findable', words: ['findable'] },
  { id: 'endsAsking', words: ['ends', 'asking'] },
  { id: 'statusReply', words: ['status', 'reply'] },
  { id: 'moveToBackground', words: ['move', 'to', 'background'] },
  { id: 'steer_work', words: ['steer', 'work'] },
  { id: 'ask_choices', words: ['ask', 'choices'] },
  { id: 'whoholds', words: ['who', 'holds'] },
]
const SEP = '[_-]?'
export const NAME_RULES = NAME_WORDS.map(({ id, words }) => ({ id, re: new RegExp(`(?<![a-z0-9])${words.join(SEP)}(?![a-z0-9])`, 'u') }))
/** Texto "desmontado": camelCase → snake, minúsculo. `answerAskChoices` → `answer_ask_choices`. */
export const splitIdentifiers = (text) => text.replace(/(?<=[\p{Ll}\p{N}])(?=\p{Lu})/gu, '_').toLowerCase()

const IGNORED_PATH = [
  /^\.maestri\//u,
  /^\.git\//u,
  /(^|\/)\.tmp[-\w.]*$/u, // saída temporária de teste/ferramenta (ex.: .tmp-host-results.json), não é código
  /(^|\/)node_modules\//u,
  /(^|\/)(dist|build|out|coverage|\.turbo|\.next)\//u,
  /^persona-spec\/.*\.(md|json|txt|html)$/iu,
  /^scripts\/persona\/check-cleanroom(\.[\w-]+)?\.(mjs|json)$/u,
  /(^|\/)(pnpm-lock\.yaml|package-lock\.json|bun\.lock|yarn\.lock)$/u,
  /\.(png|jpe?g|gif|webp|ico|icns|svgz|woff2?|ttf|otf|eot|mp3|mp4|webm|wav|ogg|zip|gz|7z|exe|dll|node|bin|pdf|wasm|sqlite3?|db)$/iu,
]
const MAX_TEXT_BYTES = 2 * 1024 * 1024

export const isIgnoredPath = (path) => IGNORED_PATH.some((re) => re.test(path.replaceAll('\\', '/')))

/** Marcas numa linha de texto: [{ rule, kind }] */
export function marksInText(text) {
  return MARK_RULES.filter(({ re }) => re.test(text)).map(({ id }) => ({ rule: id, kind: 'marca' }))
}
export function namesInText(text) {
  const spelled = splitIdentifiers(text)
  return NAME_RULES.filter(({ re }) => re.test(spelled)).map(({ id }) => ({ rule: id, kind: 'nome' }))
}

// ---------------------------------------------------------------- normalização e hash

export const normalizeLine = (line) => line.replace(/\s+/gu, ' ').trim()
const IMPORT_LINE = /^(import\b|export\s+(\*|\{[^}]*\})\s+from\b|\} from ['"]|from ['"]|use\s+[\w:{},\s]+;$|#include\b)/u
const MIN_LINE = 25
const MIN_WINDOW = 90
const MIN_LONG_LINE = 80
const MIN_STRING = 50
const WINDOW = 3

/** Hash de 53 bits (cyrb53), suficiente para comparar o que muda numa árvore com a outra sem guardar o texto. */
export function hash53(text) {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

const hashKey = (kind, text) => hash53(`${kind}\u0001${text}`) // número: cabe em Float64Array e em Map
/** Blobs opacos (base64, hash, id longo) não são "texto" nem "código": PNG de teste idêntico em dois projetos não é cópia. */
const OPAQUE_TOKEN = /[A-Za-z0-9+/=_-]{32,}/gu
export const substanceOf = (norm) => normalizeLine(norm.replace(OPAQUE_TOKEN, ' '))
const wordCount = (text) => text.split(' ').filter((word) => /\p{L}/u.test(word)).length

/** Impressões digitais de um arquivo: janelas de 3 linhas, linhas longas e textos/frases. Cada uma: { key, kind, line, lastLine } (1-based). */
export function fingerprints(text) {
  const out = []
  const lines = text.split(/\r?\n/u)
  const significant = []
  lines.forEach((raw, index) => {
    const norm = normalizeLine(raw)
    if (norm.length < MIN_LINE || IMPORT_LINE.test(norm)) return
    const substance = substanceOf(norm)
    if (substance.length < MIN_LINE) return
    significant.push({ n: index + 1, norm, substance })
    if (substance.length >= MIN_LONG_LINE) out.push({ key: hashKey('linha', norm), kind: 'linha', line: index + 1, lastLine: index + 1 })
  })
  for (let i = 0; i + WINDOW <= significant.length; i += 1) {
    const slice = significant.slice(i, i + WINDOW)
    if (slice.reduce((sum, item) => sum + item.substance.length, 0) < MIN_WINDOW) continue
    out.push({ key: hashKey('trecho', slice.map((item) => item.norm).join('\n')), kind: 'trecho', line: slice[0].n, lastLine: slice[WINDOW - 1].n })
  }
  for (const { value, line } of [...stringLiterals(text), ...jsxTexts(text)]) {
    for (const part of value.split(/(?<=[.!?:;])\s+|\\n|\n+/u)) {
      const norm = normalizeLine(part)
      const substance = substanceOf(norm)
      if (substance.length >= MIN_STRING && wordCount(substance) >= 4 && !/^(https?:|\/|[\w.-]+\/[\w./-]+$)/u.test(norm)) out.push({ key: hashKey('texto', norm), kind: 'texto', line, lastLine: line })
    }
  }
  return out
}

/** Literais de texto (aspas simples/duplas na mesma linha; crase em várias) com 50+ caracteres. */
export function stringLiterals(text) {
  const out = []
  const starts = [0]
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) starts.push(i + 1)
  const lineOf = (index) => { // busca binária: 1-based
    let lo = 0
    let hi = starts.length - 1
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= index) lo = mid; else hi = mid - 1 }
    return lo + 1
  }
  for (const m of text.matchAll(/'((?:\\.|[^'\\\n]){50,}?)'|"((?:\\.|[^"\\\n]){50,}?)"/gu)) out.push({ value: m[1] ?? m[2], line: lineOf(m.index) })
  for (const m of text.matchAll(/`((?:\\.|[^`\\]){50,}?)`/gu)) out.push({ value: m[1], line: lineOf(m.index) })
  return out
}

/**
 * P2-03: texto SOLTO de JSX (`<p>Frase inteira da tela.</p>`, também em várias linhas) não tem aspas e escapava das impressões de texto. Pega o que fica entre um `>` e o próximo `<`,
 * sem `{`/`}` (expressão) nem `<`/`>`, com 50+ caracteres. Em TS comum isso também pega pedaços de comparação (`a > b && c < d`): sobra de impressão, nunca falso positivo, porque só vira
 * acusação se o MESMO texto existir no clone.
 */
export function jsxTexts(text) {
  const out = []
  const starts = [0]
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) starts.push(i + 1)
  const lineOf = (index) => {
    let lo = 0
    let hi = starts.length - 1
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= index) lo = mid; else hi = mid - 1 }
    return lo + 1
  }
  for (const m of text.matchAll(/>([^<>{}]{50,}?)</gu)) {
    const value = m[1].trim()
    if (value.length >= 50) out.push({ value, line: lineOf(m.index + 1) })
  }
  return out
}

// ---------------------------------------------------------------- git: arquivos e linhas adicionadas

function git(root, args) {
  return execFileSync('git', ['-C', root, '-c', 'core.quotepath=false', ...args], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
}

/** Lê `git diff -U0`: { 'caminho': Set<linha adicionada> }. Arquivo removido some. */
export function parseAddedLines(diffText) {
  const result = new Map()
  let file
  for (const line of diffText.split('\n')) {
    if (line.startsWith('+++ ')) { file = line === '+++ /dev/null' ? undefined : line.replace(/^\+\+\+ b\//u, '').replace(/^\+\+\+ /u, '').replace(/\t.*$/u, ''); if (file !== undefined && !result.has(file)) result.set(file, new Set()); continue }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/u.exec(line)
    if (hunk !== null && file !== undefined) {
      const start = Number(hunk[1])
      const count = hunk[2] === undefined ? 1 : Number(hunk[2])
      for (let i = 0; i < count; i += 1) result.get(file).add(start + i)
    }
  }
  return result
}

function* walkFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* walkFiles(path)
    else yield path
  }
}

/** Alvos a checar: Map<caminho relativo (/) → Set<linhas> | 'tudo'>. */
export function collectTargets({ root, base = 'HEAD', files, all = false }) {
  const targets = new Map()
  if (files !== undefined && files.length > 0) {
    for (const file of files) {
      const abs = resolve(root, file)
      if (!existsSync(abs)) throw new Error(`arquivo/pasta não existe: ${file}`) // erro de digitação não pode virar PASSOU
      for (const path of statSync(abs).isDirectory() ? walkFiles(abs) : [abs]) targets.set(relative(root, path).replaceAll(sep, '/'), 'tudo')
    }
    return targets
  }
  if (all) {
    for (const file of git(root, ['ls-files', '-z']).split('\0').filter(Boolean)) targets.set(file, 'tudo')
    return targets
  }
  for (const [file, lines] of parseAddedLines(git(root, ['diff', '--unified=0', '--no-color', '--no-ext-diff', '--no-renames', base, '--']))) targets.set(file, lines)
  for (const file of git(root, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean)) targets.set(file, 'tudo')
  return targets
}

// ---------------------------------------------------------------- leitura segura

function readText(path) {
  try {
    const stat = statSync(path)
    if (!stat.isFile() || stat.size > MAX_TEXT_BYTES) return undefined
    const buffer = readFileSync(path)
    if (buffer.subarray(0, 4096).includes(0)) return undefined
    return buffer.toString('utf8').replace(/^\uFEFF/u, '')
  } catch { return undefined }
}

const isAdded = (lines, n) => lines === 'tudo' || lines.has(n)

// ---------------------------------------------------------------- allow-list

export function loadAllow(path) {
  if (path === undefined || !existsSync(path)) return []
  try { return JSON.parse(readFileSync(path, 'utf8')).allow ?? [] } catch { return [] }
}
export function isAllowed(allow, { file, kind, rule }) {
  const path = file.replaceAll('\\', '/')
  return allow.some((item) => {
    if (typeof item.motivo !== 'string' || item.motivo.trim() === '') return false // exceção sem motivo não vale
    const fileOk = path === item.file || (item.file.endsWith('/') && path.startsWith(item.file))
    const ruleOk = item.regra === undefined || item.regra === kind || item.regra === rule
    return fileOk && ruleOk
  })
}

// ---------------------------------------------------------------- varredura do clone

const CLONE_EXT = /\.(ts|tsx|rs|css|js|jsx|mjs|cjs|sql|json)$/iu
const CLONE_SKIP_DIR = new Set(['node_modules', '.git', 'dist', 'build', 'target', '.next', '.turbo', 'coverage'])
const CLONE_SKIP_FILE = /(^|[\\/])(package\.json|bun\.lock|tsconfig[\w.-]*\.json|biome\.json|package-lock\.json)$/u

function* walkClone(dir) {
  let entries
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) { if (!CLONE_SKIP_DIR.has(entry.name)) yield* walkClone(path) } else if (CLONE_EXT.test(entry.name) && !CLONE_SKIP_FILE.test(path)) yield path
  }
}

// ---- índice em cache: só números (hash de 53 bits) + nomes de arquivo, numa pasta temporária; nunca o conteúdo do clone.
//      Sem cache a rodada lê ~210 MB do clone (~85 s); com cache só confere tamanho/data dos arquivos (~1 s) e busca binária.
export const INDEX_VERSION = 3 // v3 (P2-03): texto solto de JSX entra nas impressões. Suba quando mudar fingerprints()/limiares: invalida todos os caches

/** Assinatura do clone: versão + (caminho|tamanho|mtime) de cada arquivo de código. Mudou qualquer arquivo → índice refeito. */
export function cloneSignature(cloneDir) {
  const parts = [`v${INDEX_VERSION}`, String(MIN_LINE), String(MIN_WINDOW), String(MIN_LONG_LINE), String(MIN_STRING), OPAQUE_TOKEN.source]
  let count = 0
  for (const path of walkClone(cloneDir)) {
    try { const st = statSync(path); parts.push(`${path}|${st.size}|${Math.trunc(st.mtimeMs)}`); count += 1 } catch { /* sumiu no meio */ }
  }
  return { signature: String(hash53(parts.join('\n'))), count }
}

export function buildCloneIndex(cloneDir) {
  const files = []
  let keys = []
  let owners = []
  for (const path of walkClone(cloneDir)) {
    const text = readText(path)
    if (text === undefined) continue
    const index = files.push(relative(cloneDir, path).replaceAll(sep, '/')) - 1
    for (const fp of fingerprints(text)) { keys.push(fp.key); owners.push(index) }
  }
  const order = Uint32Array.from({ length: keys.length }, (_, i) => i)
  const keyArray = Float64Array.from(keys)
  keys = []
  order.sort((a, b) => keyArray[a] - keyArray[b])
  const sortedKeys = new Float64Array(order.length)
  const sortedOwners = new Uint32Array(order.length)
  for (let i = 0; i < order.length; i += 1) { sortedKeys[i] = keyArray[order[i]]; sortedOwners[i] = owners[order[i]] }
  owners = []
  return { files, keys: sortedKeys, owners: sortedOwners }
}

const cachePaths = (cacheDir, cloneDir) => {
  const base = join(cacheDir, String(hash53(resolve(cloneDir).toLowerCase())))
  return { dir: base, meta: join(base, 'index.json'), keys: join(base, 'keys.bin'), owners: join(base, 'owners.bin') }
}
const toTyped = (buffer, Type) => new Type(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength))

function saveIndex(paths, signature, index) {
  mkdirSync(paths.dir, { recursive: true })
  writeFileSync(paths.keys, Buffer.from(index.keys.buffer))
  writeFileSync(paths.owners, Buffer.from(index.owners.buffer))
  writeFileSync(paths.meta, JSON.stringify({ signature, files: index.files, entries: index.keys.length })) // por último: meta presente = índice completo
}
function loadIndex(paths, signature) {
  try {
    const meta = JSON.parse(readFileSync(paths.meta, 'utf8'))
    if (meta.signature !== signature) return undefined
    const keys = toTyped(readFileSync(paths.keys), Float64Array)
    const owners = toTyped(readFileSync(paths.owners), Uint32Array)
    if (keys.length !== meta.entries || owners.length !== meta.entries) return undefined
    return { files: meta.files, keys, owners }
  } catch { return undefined }
}
function lookup(index, key) {
  let lo = 0
  let hi = index.keys.length
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (index.keys[mid] < key) lo = mid + 1; else hi = mid }
  return lo < index.keys.length && index.keys[lo] === key ? index.files[index.owners[lo]] : undefined
}

/** Compara as impressões nossas (Map key → [{file,line,lastLine,kind}]) com cada arquivo do clone. Devolve acertos { file, line, lastLine, kind, clone } (clone = caminho relativo, sem conteúdo).
 *  Com `cacheDir`, usa/gera o índice em cache (`indexo`: 'em cache' | 'refeito'). */
export function matchAgainstClone(ours, cloneDir, { onProgress, cacheDir } = {}) {
  if (cacheDir !== undefined) {
    const { signature } = cloneSignature(cloneDir)
    const paths = cachePaths(cacheDir, cloneDir)
    let index = loadIndex(paths, signature)
    const indexo = index === undefined ? 'refeito' : 'em cache'
    if (index === undefined) {
      index = buildCloneIndex(cloneDir)
      try { saveIndex(paths, signature, index) } catch { /* sem cache nesta rodada; o resultado vale igual */ }
    }
    const hits = []
    const seen = new Set()
    for (const [key, found] of ours) {
      const clone = lookup(index, key)
      if (clone === undefined) continue
      for (const item of found) {
        const id = `${item.file}:${item.line}:${item.kind}`
        if (seen.has(id)) continue
        seen.add(id)
        hits.push({ ...item, clone })
      }
    }
    return { hits, scanned: index.files.length, indexo }
  }
  const hits = []
  const seen = new Set()
  let scanned = 0
  for (const path of walkClone(cloneDir)) {
    const text = readText(path)
    if (text === undefined) continue
    scanned += 1
    if (onProgress !== undefined && scanned % 500 === 0) onProgress(scanned)
    const cloneRel = relative(cloneDir, path).replaceAll(sep, '/')
    for (const fp of fingerprints(text)) {
      const found = ours.get(fp.key)
      if (found === undefined) continue
      for (const item of found) {
        const id = `${item.file}:${item.line}:${item.kind}`
        if (seen.has(id)) continue
        seen.add(id)
        hits.push({ ...item, clone: cloneRel })
      }
    }
  }
  return { hits, scanned, indexo: 'sem cache' }
}

// ---------------------------------------------------------------- orquestração

/**
 * @param {{ root?: string, base?: string, files?: string[], all?: boolean, clone?: string|false, strictNames?: boolean, allow?: any[], allowMissingClone?: boolean, targets?: Map<string, any>, readFile?: (rel:string)=>string|undefined }} options
 * @returns {{ ok: boolean, findings: any[], warnings: any[], allowed: any[], stats: any }}
 */
export function runCheck(options = {}) {
  const root = resolve(options.root ?? REPO_ROOT)
  const allow = options.allow ?? []
  const findings = []
  const warnings = []
  const allowed = []
  const stats = { arquivos: 0, ignorados: 0, cloneArquivos: 0, cloneStatus: 'não rodou' }
  const targets = options.targets ?? collectTargets({ root, base: options.base, files: options.files, all: options.all })
  const read = options.readFile ?? ((rel) => readText(join(root, rel)))
  const report = (item) => {
    const bucket = item.severity === 'aviso' ? warnings : findings
    if (isAllowed(allow, item)) allowed.push(item)
    else bucket.push(item)
  }
  const ours = new Map()

  for (const [file, lines] of targets) {
    if (isIgnoredPath(file)) { stats.ignorados += 1; continue }
    // O NOME do arquivo também conta.
    for (const mark of marksInText(file)) report({ severity: 'falha', kind: 'marca', rule: mark.rule, file, line: 0, onde: 'nome do arquivo' })
    const text = read(file)
    if (text === undefined) continue
    stats.arquivos += 1
    const rows = text.split(/\r?\n/u)
    rows.forEach((row, index) => {
      if (!isAdded(lines, index + 1)) return
      for (const mark of marksInText(row)) report({ severity: 'falha', kind: 'marca', rule: mark.rule, file, line: index + 1 })
      for (const name of namesInText(row)) report({ severity: options.strictNames === true ? 'falha' : 'aviso', kind: 'nome', rule: name.rule, file, line: index + 1 })
    })
    if (options.clone !== false && options.clone !== undefined) {
      for (const fp of fingerprints(text)) {
        let touched = lines === 'tudo'
        for (let n = fp.line; !touched && n <= fp.lastLine; n += 1) touched = lines.has(n)
        if (!touched) continue
        const list = ours.get(fp.key) ?? []
        list.push({ file, line: fp.line, lastLine: fp.lastLine, kind: fp.kind })
        ours.set(fp.key, list)
      }
    }
  }

  if (options.clone === false || options.clone === undefined) stats.cloneStatus = 'desligado (--no-clone)'
  else if (!existsSync(options.clone)) {
    stats.cloneStatus = `clone não encontrado (${options.clone})`
    // P2-03: FALHA FECHADA. Sem o clone a regra de trecho não roda, e "passou" seria mentira; quem não tem o clone nesta máquina diz isso (--allow-missing-clone ou --no-clone).
    if (options.allowMissingClone !== true) findings.push({ severity: 'falha', kind: 'clone', rule: 'ausente', file: options.clone, line: 0, onde: 'o clone não existe nesta máquina: a regra de trecho não rodou (use --no-clone ou --allow-missing-clone se isso é de propósito)' })
  } else {
    const { hits, scanned, indexo } = matchAgainstClone(ours, options.clone, { cacheDir: options.cacheDir })
    stats.cloneArquivos = scanned
    stats.cloneStatus = `comparado com ${scanned} arquivos do clone (índice ${indexo})`
    for (const hit of hits) report({ severity: 'falha', kind: 'trecho', rule: hit.kind, file: hit.file, line: hit.line, lastLine: hit.lastLine, clone: hit.clone })
  }
  return { ok: findings.length === 0, findings, warnings, allowed, stats }
}

export function renderText(result) {
  const lines = []
  const place = (item) => `${item.file}${item.line > 0 ? `:${item.line}${item.lastLine > item.line ? `-${item.lastLine}` : ''}` : ''}`
  for (const item of result.findings) {
    if (item.kind === 'marca') lines.push(`FALHOU [marca] ${place(item)} — contém "${item.rule}"${item.onde === undefined ? '' : ` (${item.onde})`}`)
    else if (item.kind === 'trecho') lines.push(`FALHOU [trecho ${item.rule}] ${place(item)} — idêntico a algo do clone (arquivo de lá: ${item.clone}; NÃO abra, reescreva do zero em português)`)
    else lines.push(`FALHOU [${item.kind}] ${place(item)} — ${item.onde ?? item.rule}`)
  }
  for (const item of result.warnings) lines.push(`aviso [nome interno] ${place(item)} — "${item.rule}" é nome do agentes.chat; use um nome nosso`)
  if (result.allowed.length > 0) lines.push(`(${result.allowed.length} ocorrência(s) liberada(s) pela allow-list, cada uma com motivo)`)
  const { stats } = result
  lines.push(`${result.ok ? 'PASSOU' : 'FALHOU'} — sala limpa: ${stats.arquivos} arquivo(s) checado(s), ${stats.ignorados} fora do alcance; ${stats.cloneStatus}; ${result.findings.length} falha(s), ${result.warnings.length} aviso(s).`)
  return lines.join('\n')
}

// ---------------------------------------------------------------- CLI

export function parseArgs(argv) {
  const args = { files: [], flags: new Set() }
  const withValue = new Set(['--root', '--base', '--clone', '--allow', '--report'])
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--files') { while (i + 1 < argv.length && !argv[i + 1].startsWith('--')) args.files.push(argv[++i]) } else if (withValue.has(arg)) {
      if (i + 1 >= argv.length) throw new Error(`${arg} precisa de um valor`)
      args[arg.slice(2)] = argv[++i]
    } else if (arg.startsWith('--')) args.flags.add(arg.slice(2))
    else throw new Error(`argumento inesperado: ${arg}`)
  }
  return args
}

function main() {
  let args
  try { args = parseArgs(process.argv.slice(2)) } catch (error) { console.error(`uso: ${error.message}`); process.exit(2) }
  const root = resolve(args.root ?? REPO_ROOT)
  const allowPath = args.allow === undefined ? join(REPO_ROOT, 'scripts', 'persona', 'check-cleanroom.allow.json') : (isAbsolute(args.allow) ? args.allow : resolve(args.allow))
  const clone = args.flags.has('no-clone') ? false : (args.clone ?? process.env.PERSONA_CLEANROOM_CLONE ?? DEFAULT_CLONE)
  let result
  try {
    result = runCheck({ root, base: args.base, files: args.files, all: args.flags.has('all'), clone, strictNames: args.flags.has('strict-names'), allowMissingClone: args.flags.has('allow-missing-clone'), allow: loadAllow(allowPath), cacheDir: args.flags.has('no-cache') ? undefined : (process.env.PERSONA_CLEANROOM_CACHE ?? join(tmpdir(), 'persona-cleanroom-cache')) })
  } catch (error) { console.error(`erro ao checar: ${error.message}`); process.exit(2) }
  if (args.report !== undefined) writeFileSync(resolve(args.report), `${JSON.stringify({ geradoEm: new Date().toISOString(), root, ...result }, null, 2)}\n`)
  if (!args.flags.has('quiet') || !result.ok) console.log(args.flags.has('json') ? JSON.stringify(result, null, 2) : renderText(result))
  process.exit(result.ok ? 0 : 1)
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main()
