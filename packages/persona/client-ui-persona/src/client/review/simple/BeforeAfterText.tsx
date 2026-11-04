/**
 * Antes e depois of a text file (SIMPLE-WORKSPACE-SPEC §3): two columns; what left is struck on a red tint, what came
 * in is underlined on a green tint — never colour alone. In a narrow window one column shows, switched by tabs.
 */

import { useId, useState, type ReactNode } from 'react'
import { Tabs } from '../../primitives/index.ts'
import type { DiffOp } from './text-diff.ts'
import { buildRows } from './text-diff.ts'
import styles from './BeforeAfterText.module.css'

/** Rows drawn per file; a longer change shows its beginning (the screen says so). */
export const BEFORE_AFTER_MAX_ROWS = 400
/** Unchanged lines kept around each change. */
const CONTEXT_LINES = 3

export interface BeforeAfterTextProps {
  readonly ops: readonly DiffOp[]
  /** Column names; default "Antes" / "Depois" (a conflict compares "Na sua pasta" with the draft). */
  readonly labels?: { readonly before: string; readonly after: string } | undefined
  readonly t: (key: string, params?: Readonly<Record<string, string | number>>) => string
}

type Side = 'before' | 'after'

export function BeforeAfterText({ ops, t, labels }: BeforeAfterTextProps): ReactNode {
  const beforeLabel = labels?.before ?? t('patch.before')
  const afterLabel = labels?.after ?? t('patch.after')
  const id = useId()
  // A deleted file has nothing "Depois": open on "Antes" instead of an empty column.
  const [side, setSide] = useState<Side>(() => (ops.some(op => op.t === 'add' || op.t === 'same') ? 'after' : 'before'))
  const allRows = buildRows(ops, CONTEXT_LINES)
  const rows = allRows.slice(0, BEFORE_AFTER_MAX_ROWS)
  const cut = allRows.length > rows.length

  if (rows.length === 0) return <p className={styles.note}>{t('patch.empty')}</p>

  return (
    <div className={styles.root} data-side={side}>
      <div className={styles.tabs}>
        <Tabs
          idPrefix={`${id}-ba`}
          label={t('patch.versionTabs')}
          value={side}
          onChange={setSide}
          items={[
            { id: 'before' as const, label: beforeLabel },
            { id: 'after' as const, label: afterLabel },
          ]}
        />
      </div>
      <div id={`${id}-ba-panel-${side}`} role="tabpanel" className={styles.panel}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col" className={styles.head} data-col="before">{beforeLabel}</th>
              <th scope="col" className={styles.head} data-col="after">{afterLabel}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              if (row.kind === 'gap') {
                return (
                  <tr key={index} className={styles.gapRow}>
                    <td colSpan={2} className={styles.gap}>
                      <span aria-hidden="true">⋯</span>
                      <span className="persona-sr-only">{t('patch.gap')}</span>
                    </td>
                  </tr>
                )
              }
              if (row.kind === 'same') {
                return (
                  <tr key={index}>
                    <td className={styles.cell} data-col="before">{row.text}</td>
                    <td className={styles.cell} data-col="after">{row.text}</td>
                  </tr>
                )
              }
              return (
                <tr key={index}>
                  <td className={styles.cell} data-col="before" data-changed={row.before === null ? undefined : ''}>
                    {row.before !== null && <del className={styles.del}>{row.before === '' ? ' ' : row.before}</del>}
                  </td>
                  <td className={styles.cell} data-col="after" data-changed={row.after === null ? undefined : ''}>
                    {row.after !== null && <ins className={styles.ins}>{row.after === '' ? ' ' : row.after}</ins>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {cut && <p className={styles.note}>{t('patch.truncated')}</p>}
    </div>
  )
}
