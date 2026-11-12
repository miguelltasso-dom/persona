/**
 * Markdown das respostas das personas (UX-BEYOND IV-3). Desenha a árvore de `parseMarkdown` elemento por elemento:
 * nunca `dangerouslySetInnerHTML`, então HTML cru vira texto. Títulos em Nunito 800 dentro do balão (nunca Fredoka),
 * bloco de código com "Copiar", tabela e código com rolagem horizontal própria (nunca da página).
 */
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { Button, UiIcon } from '../../primitives/index.ts'
import {
  parseMarkdown,
  type Inline,
  type MarkdownBlock,
  type MarkdownList,
  type MarkdownTable,
  type TableAlign,
} from './parse-markdown.ts'
import styles from './MarkdownBody.module.css'

type ChatT = PropsLocale<'persona.chat'>['t']

export interface MarkdownBodyProps {
  readonly source: string
  readonly t: ChatT
  /** A resposta ainda está chegando: o bloco de código aberto aparece como texto até fechar. */
  readonly streaming?: boolean | undefined
  readonly className?: string | undefined
}

function renderInline(nodes: readonly Inline[], keyPrefix = 'i'): ReactNode {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}${index}`
    switch (node.type) {
      case 'text':
        return <Fragment key={key}>{node.text}</Fragment>
      case 'br':
        return <br key={key} />
      case 'code':
        return <code key={key} className={styles.inlineCode}>{node.text}</code>
      case 'strong':
        return <strong key={key}>{renderInline(node.children, `${key}.`)}</strong>
      case 'em':
        return <em key={key}>{renderInline(node.children, `${key}.`)}</em>
      case 'link':
        return (
          <a key={key} className={styles.link} href={node.href} target="_blank" rel="noopener noreferrer">
            {renderInline(node.children, `${key}.`)}
            <UiIcon name="arrowRight" size={12} strokeWidth={2.4} className={styles.linkIcon} />
          </a>
        )
    }
  })
}

function CodeBlock({ code, lang, t }: { readonly code: string; readonly lang: string; readonly t: ChatT }): ReactNode {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => { if (timer.current !== undefined) clearTimeout(timer.current) }, [])
  const copy = (): void => {
    const done = (): void => {
      setCopied(true)
      if (timer.current !== undefined) clearTimeout(timer.current)
      timer.current = setTimeout(() => { setCopied(false) }, 1_500)
    }
    try {
      void navigator.clipboard.writeText(code).then(done, () => undefined)
    } catch {
      /* sem permissão de área de transferência: o botão não promete o que não fez */
    }
  }
  return (
    <div className={styles.codeBlock} data-lang={lang === '' ? undefined : lang}>
      <div className={styles.codeCopy}>
        <Button
          size="s"
          variant="ghost"
          icon={<UiIcon name={copied ? 'check' : 'copy'} size={14} strokeWidth={2.2} />}
          onClick={copy}
        >
          {copied ? t('markdown.copied') : t('markdown.copy')}
        </Button>
        <span className={styles.srOnly} role="status" aria-live="polite">{copied ? t('markdown.copied') : ''}</span>
      </div>
      <pre className={styles.codePre} tabIndex={0} role="region" aria-label={t('markdown.codeRegion')}><code>{code}</code></pre>
    </div>
  )
}

function renderList(list: MarkdownList, keyPrefix: string): ReactNode {
  const items = list.items.map((item, index) => (
    <li key={`${keyPrefix}.${index}`}>
      {renderInline(item.inline, `${keyPrefix}.${index}.`)}
      {item.children !== null && renderList(item.children, `${keyPrefix}.${index}.n`)}
    </li>
  ))
  return list.ordered
    ? <ol key={keyPrefix} className={styles.list} start={list.start}>{items}</ol>
    : <ul key={keyPrefix} className={styles.list}>{items}</ul>
}

const ALIGN: Readonly<Record<TableAlign, 'left' | 'right' | 'center'>> = { left: 'left', right: 'right', center: 'center' }

function renderTable(table: MarkdownTable, key: string, t: ChatT): ReactNode {
  return (
    <div key={key} className={styles.tableWrap} tabIndex={0} role="region" aria-label={t('markdown.tableRegion')}>
      <table className={styles.table}>
        <thead>
          <tr>
            {table.header.map((cell, column) => (
              <th key={`${key}.h${column}`} scope="col" style={{ textAlign: ALIGN[table.align[column] ?? 'left'] }}>
                {renderInline(cell, `${key}.h${column}.`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, index) => (
            <tr key={`${key}.r${index}`}>
              {row.map((cell, column) => (
                <td key={`${key}.r${index}c${column}`} data-numeric={table.align[column] === 'right' ? '' : undefined} style={{ textAlign: ALIGN[table.align[column] ?? 'left'] }}>
                  {renderInline(cell, `${key}.r${index}c${column}.`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function renderBlock(block: MarkdownBlock, key: string, t: ChatT): ReactNode {
  switch (block.type) {
    case 'paragraph':
      return <p key={key} className={styles.paragraph}>{renderInline(block.inline, `${key}.`)}</p>
    case 'heading':
      // Sem <h1>–<h3>: um título dentro de uma conversa não entra no esquema de títulos da tela.
      return <div key={key} role="heading" aria-level={4} className={styles.heading} data-level={block.level}>{renderInline(block.inline, `${key}.`)}</div>
    case 'code':
      return <CodeBlock key={key} code={block.text} lang={block.lang} t={t} />
    case 'quote':
      return <blockquote key={key} className={styles.quote}>{block.blocks.map((inner, index) => renderBlock(inner, `${key}.${index}`, t))}</blockquote>
    case 'list':
      return renderList(block, key)
    case 'table':
      return renderTable(block, key, t)
    case 'details':
      // Detalhe técnico recolhido (fala simples): <details> nativo, então teclado (Enter/Espaço) e leitor de tela vêm de graça.
      return (
        <details key={key} className={styles.details} data-persona-details="">
          <summary className={styles.summary}>
            <UiIcon name="chevronRight" size={14} strokeWidth={2.4} className={styles.summaryIcon} />
            <span>{block.summary}</span>
          </summary>
          <div className={styles.detailsBody}>{block.blocks.map((inner, index) => renderBlock(inner, `${key}.${index}`, t))}</div>
        </details>
      )
  }
}

export function MarkdownBody({ source, t, streaming = false, className }: MarkdownBodyProps): ReactNode {
  const blocks = useMemo(() => parseMarkdown(source, { streaming }), [source, streaming])
  return (
    <div className={className === undefined ? styles.markdown : `${styles.markdown} ${className}`} data-persona-markdown="">
      {blocks.map((block, index) => renderBlock(block, `b${index}`, t))}
    </div>
  )
}
