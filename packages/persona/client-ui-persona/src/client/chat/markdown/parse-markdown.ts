/**
 * Markdown seguro para as respostas das personas (UX-BEYOND IV-3, forma da Muse). Um parser pequeno e próprio, sem
 * dependência: devolve uma árvore de dados que o React desenha elemento por elemento. Nunca produz HTML, então não há
 * `<script>` nem atributo de evento possível; links só com http, https ou mailto.
 *
 * Subconjunto: parágrafos; **negrito** e *itálico*; listas com marcador e numeradas (2 níveis); links; `código`;
 * blocos de código; citação; tabelas; títulos `#`, `##` e `###`; e o bloco recolhido `<details><summary>…</summary>…</details>`
 * (a única tag HTML lida; o resumo é texto, o corpo é Markdown).
 *
 * Durante o streaming (`streaming: true`) o markdown incompleto não pisca: um bloco de código ainda sem a cerca de
 * fechamento aparece como texto até fechar. Marcadores inline sem par ficam como texto.
 */

export type Inline =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'strong'; readonly children: readonly Inline[] }
  | { readonly type: 'em'; readonly children: readonly Inline[] }
  | { readonly type: 'code'; readonly text: string }
  | { readonly type: 'link'; readonly href: string; readonly children: readonly Inline[] }
  | { readonly type: 'br' }

export interface MarkdownListItem {
  readonly inline: readonly Inline[]
  /** Segundo nível (a lista aninhada), quando há. */
  readonly children: MarkdownList | null
}

export interface MarkdownList {
  readonly type: 'list'
  readonly ordered: boolean
  readonly start: number
  readonly items: readonly MarkdownListItem[]
}

export type TableAlign = 'left' | 'right' | 'center'

export interface MarkdownTable {
  readonly type: 'table'
  readonly header: readonly (readonly Inline[])[]
  readonly align: readonly TableAlign[]
  readonly rows: readonly (readonly (readonly Inline[])[])[]
}

/**
 * Detalhe técnico recolhido (item 4 da colheita: fala simples por padrão). Única peça de HTML que o parser lê: `<details>` com
 * `<summary>` opcional, e o corpo é Markdown comum. O resumo é sempre texto; o resto do HTML continua virando texto.
 */
export interface MarkdownDetails {
  readonly type: 'details'
  readonly summary: string
  readonly blocks: readonly MarkdownBlock[]
}

export type MarkdownBlock =
  | { readonly type: 'paragraph'; readonly inline: readonly Inline[] }
  | { readonly type: 'heading'; readonly level: 1 | 2 | 3; readonly inline: readonly Inline[] }
  | { readonly type: 'code'; readonly lang: string; readonly text: string }
  | { readonly type: 'quote'; readonly blocks: readonly MarkdownBlock[] }
  | MarkdownList
  | MarkdownTable
  | MarkdownDetails

export interface ParseMarkdownOptions {
  /** A resposta ainda está chegando: bloco de código sem fechamento fica como texto. */
  readonly streaming?: boolean
}

const SAFE_HREF = /^(https?:\/\/|mailto:)/iu
const ESCAPABLE = '\\`*_{}[]()#+-.!|>~<'
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})[ \t]*([\w+#.-]*)[^`]*$/u
const HEADING = /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/u
const QUOTE = /^ {0,3}>[ \t]?/u
const LIST_ITEM = /^( *)([-*+]|\d{1,9}[.)])[ \t]+(.*)$/u
const TABLE_SEPARATOR = /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/u
const NUMERIC_CELL = /^[-+]?\s?(R\$|\$|€)?\s?\d[\d.,]*\s?(%|[a-zA-Z]{0,3})?$/u

/** Só http, https e mailto viram link; qualquer outra coisa (javascript:, data:…) fica como texto. */
export function safeHref(raw: string): string | null {
  const href = raw.trim()
  return SAFE_HREF.test(href) ? href : null
}

const isAlnum = (char: string): boolean => /[\p{L}\p{N}]/u.test(char)
const isSpace = (char: string): boolean => char === '' || /\s/u.test(char)

function closingIndex(src: string, from: number, marker: string): number {
  let at = src.indexOf(marker, from)
  while (at !== -1) {
    const inner = src.slice(from, at)
    const single = marker.length === 1
    const touchesOther = single && (src.charAt(at - 1) === marker || src.charAt(at + 1) === marker)
    if (inner.length > 0 && !isSpace(inner.charAt(0)) && !isSpace(inner.charAt(inner.length - 1)) && !touchesOther) return at
    at = src.indexOf(marker, at + 1)
  }
  return -1
}

function parseBareUrl(src: string, at: number): { readonly href: string; readonly end: number } | null {
  if (at > 0 && isAlnum(src.charAt(at - 1))) return null
  const rest = src.slice(at)
  if (!/^https?:\/\//iu.test(rest)) return null
  let length = rest.search(/[\s<>]/u)
  if (length === -1) length = rest.length
  let url = rest.slice(0, length)
  while (/[.,;:!?'")\]]$/u.test(url)) {
    const last = url.charAt(url.length - 1)
    if (last === ')' && (url.match(/\(/gu)?.length ?? 0) >= (url.match(/\)/gu)?.length ?? 0)) break
    url = url.slice(0, -1)
  }
  return /^https?:\/\/[^\s/]+/iu.test(url) ? { href: url, end: at + url.length } : null
}

/** Marcadores inline sem par ficam como texto (nunca somem nem estragam o resto). */
export function parseInline(src: string): readonly Inline[] {
  const out: Inline[] = []
  let buf = ''
  const flush = (): void => {
    if (buf.length > 0) out.push({ type: 'text', text: buf })
    buf = ''
  }
  let i = 0
  while (i < src.length) {
    const ch = src.charAt(i)

    if (ch === '\\' && i + 1 < src.length && ESCAPABLE.includes(src.charAt(i + 1))) {
      buf += src.charAt(i + 1)
      i += 2
      continue
    }

    if (ch === '\n') {
      buf = buf.replace(/[ \t]+$/u, '')
      flush()
      out.push({ type: 'br' })
      i += 1
      continue
    }

    if (ch === '`') {
      let run = 1
      while (src.charAt(i + run) === '`') run += 1
      const fence = '`'.repeat(run)
      let close = src.indexOf(fence, i + run)
      while (close !== -1 && src.charAt(close + run) === '`') close = src.indexOf(fence, close + run + 1)
      if (close !== -1) {
        let code = src.slice(i + run, close)
        if (code.length > 1 && code.startsWith(' ') && code.endsWith(' ')) code = code.slice(1, -1)
        flush()
        out.push({ type: 'code', text: code })
        i = close + run
        continue
      }
      buf += fence
      i += run
      continue
    }

    if (ch === '[') {
      let depth = 0
      let labelEnd = -1
      for (let at = i; at < src.length; at += 1) {
        const c = src.charAt(at)
        if (c === '\\') { at += 1; continue }
        if (c === '[') depth += 1
        if (c === ']') {
          depth -= 1
          if (depth === 0) { labelEnd = at; break }
        }
      }
      if (labelEnd !== -1 && src.charAt(labelEnd + 1) === '(') {
        let parens = 0
        let urlEnd = -1
        for (let at = labelEnd + 1; at < src.length; at += 1) {
          const c = src.charAt(at)
          if (c === '(') parens += 1
          if (c === ')') {
            parens -= 1
            if (parens === 0) { urlEnd = at; break }
          }
        }
        if (urlEnd !== -1) {
          const target = src.slice(labelEnd + 2, urlEnd).trim().replace(/\s+"[^"]*"$/u, '')
          const href = safeHref(target.replace(/^<(.*)>$/u, '$1'))
          const label = src.slice(i + 1, labelEnd)
          if (href !== null && label.length > 0) {
            flush()
            out.push({ type: 'link', href, children: parseInline(label) })
            i = urlEnd + 1
            continue
          }
        }
      }
      buf += ch
      i += 1
      continue
    }

    if (ch === '*' || ch === '_') {
      const double = src.charAt(i + 1) === ch
      const marker = double ? ch + ch : ch
      const intraword = ch === '_' && i > 0 && isAlnum(src.charAt(i - 1))
      if (!intraword) {
        const close = closingIndex(src, i + marker.length, marker)
        const afterOk = close === -1 || ch !== '_' || !isAlnum(src.charAt(close + marker.length))
        if (close !== -1 && afterOk) {
          flush()
          const children = parseInline(src.slice(i + marker.length, close))
          out.push(double ? { type: 'strong', children } : { type: 'em', children })
          i = close + marker.length
          continue
        }
      }
      buf += marker
      i += marker.length
      continue
    }

    if (ch === 'h' || ch === 'H') {
      const url = parseBareUrl(src, i)
      if (url !== null) {
        flush()
        out.push({ type: 'link', href: url.href, children: [{ type: 'text', text: url.href }] })
        i = url.end
        continue
      }
    }

    buf += ch
    i += 1
  }
  flush()
  return out
}

function splitRow(line: string): string[] {
  const cells: string[] = []
  let cell = ''
  const body = line.trim().replace(/^\|/u, '').replace(/(?<!\\)\|$/u, '')
  for (let i = 0; i < body.length; i += 1) {
    const c = body.charAt(i)
    if (c === '\\' && body.charAt(i + 1) === '|') { cell += '|'; i += 1; continue }
    if (c === '|') { cells.push(cell.trim()); cell = ''; continue }
    cell += c
  }
  cells.push(cell.trim())
  return cells
}

const startsTable = (line: string, next: string | undefined): boolean =>
  line.includes('|') && next !== undefined && next.includes('-') && TABLE_SEPARATOR.test(next)

function startsBlock(line: string, next: string | undefined): boolean {
  return FENCE_OPEN.test(line) || HEADING.test(line) || QUOTE.test(line) || LIST_ITEM.test(line) || startsTable(line, next) || DETAILS_OPEN.test(line)
}

const DETAILS_OPEN = /^ {0,3}<details\b[^>]*>/iu
const DETAILS_TAG = /<details\b[^>]*>|<\/details\s*>/giu
const SUMMARY_OPEN = /^\s*<summary\b[^>]*>/iu
const SUMMARY_FULL = /^\s*<summary\b[^>]*>([\s\S]*?)<\/summary\s*>/iu
export const DETAILS_FALLBACK_SUMMARY = 'Detalhes'
const SUMMARY_LIMIT = 80

/** O resumo é texto puro: sem marcação, sem tags, uma linha, curto. */
function summaryText(raw: string): string {
  const text = raw.replace(/<[^>]*>/gu, '').replace(/\s+/gu, ' ').trim()
  if (text === '') return DETAILS_FALLBACK_SUMMARY
  return text.length > SUMMARY_LIMIT ? `${text.slice(0, SUMMARY_LIMIT - 1).trimEnd()}…` : text
}

/**
 * Lê um `<details>` que começa em `lines[at]`. O fecho pode estar no fim de qualquer linha (um `<details>` dentro de bloco de código não
 * conta); aberto e sem fecho, vai até o fim (assim a resposta que ainda chega não mostra a tag crua). O que vem depois do fecho, na mesma
 * linha, volta como `trail` para virar o próximo bloco.
 */
function parseDetails(
  lines: readonly string[],
  at: number,
  streaming: boolean,
): { readonly block: MarkdownDetails; readonly next: number; readonly trail: string } {
  let depth = 0
  let fence: string | undefined
  let offset = 0
  let openEnd = -1
  let closeStart = -1
  let closeEnd = -1
  let next = at
  scan: for (; next < lines.length; next += 1) {
    const line = lines[next] ?? ''
    const opened = FENCE_OPEN.exec(line)
    if (fence !== undefined) {
      const closer = /^ {0,3}(`{3,}|~{3,})[ \t]*$/u.exec(line)
      if (closer !== null && closer[1]?.charAt(0) === fence.charAt(0) && (closer[1]?.length ?? 0) >= fence.length) fence = undefined
    } else if (next > at && opened !== null) {
      fence = opened[1] ?? '```'
    } else {
      DETAILS_TAG.lastIndex = 0
      for (let tag = DETAILS_TAG.exec(line); tag !== null; tag = DETAILS_TAG.exec(line)) {
        if (tag[0].charAt(1) !== '/') {
          depth += 1
          if (depth === 1 && openEnd === -1) openEnd = offset + tag.index + tag[0].length
        } else {
          depth -= 1
          if (depth === 0) {
            closeStart = offset + tag.index
            closeEnd = closeStart + tag[0].length
            break scan
          }
        }
      }
    }
    offset += line.length + 1
  }
  const raw = lines.slice(at, Math.min(next + 1, lines.length)).join('\n')
  const closed = closeStart !== -1
  const inner = raw.slice(openEnd, closed ? closeStart : raw.length)
  const trail = closed ? raw.slice(closeEnd).trim() : ''
  const full = SUMMARY_FULL.exec(inner)
  const pending = full === null && SUMMARY_OPEN.test(inner)
  const summary = pending ? DETAILS_FALLBACK_SUMMARY : summaryText(full?.[1] ?? '')
  const body = pending ? '' : full === null ? inner : inner.slice(full[0].length)
  return {
    block: { type: 'details', summary, blocks: body.trim() === '' ? [] : parseLines(body.replace(/^\n+/u, '').split('\n'), streaming) },
    next: closed ? next + 1 : lines.length,
    trail,
  }
}

function parseTable(lines: readonly string[], at: number): { readonly table: MarkdownTable; readonly next: number } {
  const header = splitRow(lines[at] ?? '')
  const separator = splitRow(lines[at + 1] ?? '')
  const explicit: (TableAlign | null)[] = header.map((_, column) => {
    const cell = separator[column] ?? ''
    if (cell.startsWith(':') && cell.endsWith(':')) return 'center'
    if (cell.endsWith(':')) return 'right'
    if (cell.startsWith(':')) return 'left'
    return null
  })
  const body: string[][] = []
  let next = at + 2
  while (next < lines.length) {
    const line = lines[next] ?? ''
    if (line.trim() === '' || !line.includes('|')) break
    body.push(splitRow(line))
    next += 1
  }
  const align: TableAlign[] = explicit.map((chosen, column) => {
    if (chosen !== null) return chosen
    const cells = body.map(row => row[column] ?? '').filter(cell => cell !== '')
    return cells.length > 0 && cells.every(cell => NUMERIC_CELL.test(cell)) ? 'right' : 'left'
  })
  return {
    table: {
      type: 'table',
      header: header.map(parseInline),
      align,
      rows: body.map(row => header.map((_, column) => parseInline(row[column] ?? ''))),
    },
    next,
  }
}

interface RawItem {
  readonly level: 0 | 1
  readonly ordered: boolean
  readonly start: number
  text: string
}

interface ListBuild {
  readonly ordered: boolean
  readonly start: number
  readonly items: { inline: readonly Inline[]; children: MarkdownList | null }[]
}

const toList = (build: ListBuild): MarkdownList => ({ type: 'list', ordered: build.ordered, start: build.start, items: build.items })

function parseList(lines: readonly string[], at: number): { readonly lists: readonly MarkdownList[]; readonly next: number } {
  const raw: RawItem[] = []
  let next = at
  while (next < lines.length) {
    const line = lines[next] ?? ''
    const item = LIST_ITEM.exec(line)
    if (item !== null) {
      const marker = item[2] ?? '-'
      const indent = (item[1] ?? '').replace(/\t/gu, '  ').length
      raw.push({
        level: indent >= 2 && raw.length > 0 ? 1 : 0,
        ordered: /\d/u.test(marker),
        start: Number.parseInt(marker, 10) || 1,
        text: item[3] ?? '',
      })
      next += 1
      continue
    }
    const last = raw[raw.length - 1]
    if (line.trim() === '') {
      // Uma linha em branco só continua a lista se o próximo conteúdo é outro item.
      const following = lines[next + 1]
      if (following !== undefined && LIST_ITEM.test(following)) { next += 1; continue }
      break
    }
    if (last !== undefined && /^ {2,}\S/u.test(line) && !startsBlock(line.trim(), undefined)) {
      last.text += `\n${line.trim()}`
      next += 1
      continue
    }
    break
  }

  const lists: MarkdownList[] = []
  let current: ListBuild | undefined
  for (const entry of raw) {
    const parent = current?.items[current.items.length - 1]
    if (entry.level === 1 && parent !== undefined) {
      const nested: MarkdownList = parent.children ?? { type: 'list', ordered: entry.ordered, start: entry.start, items: [] }
      parent.children = { ...nested, items: [...nested.items, { inline: parseInline(entry.text), children: null }] }
      continue
    }
    if (current !== undefined && current.ordered !== entry.ordered) {
      lists.push(toList(current))
      current = undefined
    }
    current ??= { ordered: entry.ordered, start: entry.start, items: [] }
    current.items.push({ inline: parseInline(entry.text), children: null })
  }
  if (current !== undefined) lists.push(toList(current))
  return { lists, next }
}

function parseLines(lines: readonly string[], streaming: boolean): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i] ?? ''
    if (line.trim() === '') { i += 1; continue }

    const fence = FENCE_OPEN.exec(line)
    if (fence !== null) {
      const marker = fence[1] ?? '```'
      const closer = new RegExp(`^ {0,3}${marker.charAt(0) === '`' ? '`' : '~'}{${marker.length},}[ \\t]*$`, 'u')
      let end = -1
      for (let at = i + 1; at < lines.length; at += 1) {
        if (closer.test(lines[at] ?? '')) { end = at; break }
      }
      if (end === -1 && streaming) {
        // Bloco aberto durante o streaming: texto simples até a cerca de fechamento chegar.
        const plain: Inline[] = []
        for (const [index, raw] of lines.slice(i).entries()) {
          if (index > 0) plain.push({ type: 'br' })
          plain.push({ type: 'text', text: raw })
        }
        blocks.push({ type: 'paragraph', inline: plain })
        break
      }
      const stop = end === -1 ? lines.length : end
      blocks.push({ type: 'code', lang: fence[2] ?? '', text: lines.slice(i + 1, stop).join('\n') })
      i = end === -1 ? lines.length : end + 1
      continue
    }

    if (DETAILS_OPEN.test(line)) {
      const { block, next, trail } = parseDetails(lines, i, streaming)
      blocks.push(block)
      if (trail !== '') blocks.push(...parseLines([trail], streaming))
      i = next
      continue
    }

    const heading = HEADING.exec(line)
    if (heading !== null) {
      const level = Math.min(3, (heading[1] ?? '#').length) as 1 | 2 | 3
      blocks.push({ type: 'heading', level, inline: parseInline(heading[2] ?? '') })
      i += 1
      continue
    }

    if (QUOTE.test(line)) {
      const inner: string[] = []
      while (i < lines.length && QUOTE.test(lines[i] ?? '')) {
        inner.push((lines[i] ?? '').replace(QUOTE, ''))
        i += 1
      }
      blocks.push({ type: 'quote', blocks: parseLines(inner, streaming) })
      continue
    }

    if (startsTable(line, lines[i + 1])) {
      const { table, next } = parseTable(lines, i)
      blocks.push(table)
      i = next
      continue
    }

    if (LIST_ITEM.test(line)) {
      const { lists, next } = parseList(lines, i)
      blocks.push(...lists)
      i = next
      continue
    }

    const paragraph: string[] = [line]
    i += 1
    while (i < lines.length) {
      const next = lines[i] ?? ''
      if (next.trim() === '' || startsBlock(next, lines[i + 1])) break
      paragraph.push(next)
      i += 1
    }
    blocks.push({ type: 'paragraph', inline: parseInline(paragraph.join('\n')) })
  }
  return blocks
}

export function parseMarkdown(source: string, options: ParseMarkdownOptions = {}): readonly MarkdownBlock[] {
  return parseLines(source.replace(/\r\n?/gu, '\n').split('\n'), options.streaming === true)
}
