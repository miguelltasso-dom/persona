/**
 * HelpArticle (Muse): renders a help/notes block tree (built from docs/persona by gen-help-docs.mjs).
 * Never raw HTML. Links to other guides call `onOpenDoc`; outside links go through the host (`onOpenExternal`),
 * never navigating the app window. `highlight` wraps matches of the search term in <mark>.
 */

import { Fragment, type ReactNode } from 'react'
import type { HelpBlock, HelpInline } from '../help/help-types.ts'
import styles from './HelpArticle.module.css'

export interface HelpArticleProps {
  readonly blocks: readonly HelpBlock[]
  /** Prefix for heading ids (unique per page). */
  readonly idPrefix: string
  readonly onOpenDoc?: ((docId: string, anchor?: string) => void) | undefined
  readonly onOpenExternal?: ((url: string) => void) | undefined
  /** Accent-free, lowercase words to highlight. */
  readonly highlight?: readonly string[] | undefined
  readonly externalHint?: string | undefined
}

const fold = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/gu, '')

/** Split `text` around highlight words, comparing accent-free; keeps the original characters. */
export function markSegments(text: string, words: readonly string[]): { readonly text: string; readonly hit: boolean }[] {
  const terms = words.filter(w => w.length >= 2)
  if (terms.length === 0) return [{ text, hit: false }]
  const folded = fold(text)
  const hits: [number, number][] = []
  for (const term of terms) {
    let from = 0
    for (;;) {
      const at = folded.indexOf(term, from)
      if (at < 0) break
      hits.push([at, at + term.length])
      from = at + term.length
    }
  }
  if (hits.length === 0) return [{ text, hit: false }]
  hits.sort((a, b) => a[0] - b[0])
  const out: { text: string; hit: boolean }[] = []
  let cursor = 0
  for (const [start, end] of hits) {
    if (start < cursor) continue
    if (start > cursor) out.push({ text: text.slice(cursor, start), hit: false })
    out.push({ text: text.slice(start, end), hit: true })
    cursor = end
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor), hit: false })
  return out
}

export function HelpArticle({ blocks, idPrefix, onOpenDoc, onOpenExternal, highlight = [], externalHint }: HelpArticleProps): ReactNode {
  const renderInline = (nodes: readonly HelpInline[]): ReactNode => nodes.map((n, i) => {
    if (n.t === 'text') {
      return <Fragment key={i}>{markSegments(n.v, highlight).map((s, j) => (s.hit ? <mark key={j} className={styles.mark}>{s.text}</mark> : <Fragment key={j}>{s.text}</Fragment>))}</Fragment>
    }
    if (n.t === 'strong') return <strong key={i}>{renderInline(n.c)}</strong>
    if (n.t === 'em') return <em key={i}>{renderInline(n.c)}</em>
    if (n.t === 'code') return <code key={i} className={styles.code}>{n.v}</code>
    if (n.doc !== undefined) {
      const doc = n.doc
      // A real link (wraps like text, announced as link); the click stays inside the app.
      return <a key={i} href={`#help-doc-${doc}`} className={styles.link} onClick={(e) => { e.preventDefault(); onOpenDoc?.(doc, n.anchor) }}>{renderInline(n.c)}</a>
    }
    const href = n.href ?? ''
    return (
      <a key={i} href={href} className={styles.link} onClick={(e) => { e.preventDefault(); onOpenExternal?.(href) }}>
        {renderInline(n.c)}
        {externalHint !== undefined && <span className="persona-sr-only"> ({externalHint})</span>}
        <span aria-hidden="true" className={styles.ext}>↗</span>
      </a>
    )
  })

  const renderBlocks = (list: readonly HelpBlock[]): ReactNode => list.map((b, i) => {
    switch (b.t) {
      case 'h': {
        const Tag = b.level <= 2 ? 'h3' : 'h4'
        return <Tag key={i} id={`${idPrefix}-${b.id}`} className={b.level <= 2 ? styles.h2 : styles.h3} tabIndex={-1}>{renderInline(b.c)}</Tag>
      }
      case 'p': return <p key={i} className={styles.p}>{renderInline(b.c)}</p>
      case 'ul': return <ul key={i} className={styles.ul}>{b.items.map((item, j) => <li key={j}>{renderBlocks(item)}</li>)}</ul>
      case 'ol': return <ol key={i} className={styles.ol}>{b.items.map((item, j) => <li key={j}>{renderBlocks(item)}</li>)}</ol>
      case 'code': return <pre key={i} className={styles.pre}><code>{b.v}</code></pre>
      case 'quote': return <blockquote key={i} className={styles.quote}>{renderBlocks(b.c)}</blockquote>
      case 'table': return (
        <div key={i} className={styles.tableWrap}>
          <table className={styles.table}>
            <tbody>{b.rows.map((row, r) => <tr key={r}>{row.map((cell, c) => (r === 0 ? <th key={c} scope="col">{renderInline(cell)}</th> : <td key={c}>{renderInline(cell)}</td>))}</tr>)}</tbody>
          </table>
        </div>
      )
      case 'hr': return <hr key={i} className={styles.hr} />
      default: return null
    }
  })

  return <div className={styles.article}>{renderBlocks(blocks)}</div>
}
