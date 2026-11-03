/** G2 — spatial view + accessible list mode (SVG/CSS transform only). */
import { useMemo, useState, type ReactNode } from 'react'
import { PersonaButton } from '../primitives/index.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import page from '../profile/LumenPage.module.css'
import styles from './Canvas.module.css'
import { PersonaSurfaceEmpty, PersonaSurfaceLoading } from '../kanban/PersonaSurface.tsx'
import { MOCK_CANVAS_EDGES, MOCK_CANVAS_NODES, type CanvasNode } from './mock-data.ts'
import { pt as defaultDict } from '../locale/canvas/locales.ts'

export type CanvasSurfaceState = 'loading' | 'error' | 'empty' | 'ready'
type ViewMode = 'canvas' | 'list'

function nodeCenter(node: CanvasNode): { cx: number; cy: number } {
  return { cx: node.x + 28, cy: node.y + 28 }
}

export interface CanvasViewProps {
  readonly dict?: LocaleDict
  readonly initialState?: CanvasSurfaceState
}

export function CanvasView({ dict = defaultDict, initialState = 'ready' }: CanvasViewProps): ReactNode {
  const t = (key: string) => bindLocale(dict, key)
  const [mode, setMode] = useState<ViewMode>('canvas')
  const [scale, setScale] = useState(1)

  const nodeMap = useMemo(() => new Map(MOCK_CANVAS_NODES.map(n => [n.id, n])), [])

  if (initialState === 'loading') return <PersonaSurfaceLoading dict={dict} messageKey="loading" skeletonColumns={3} />
  if (initialState === 'empty') {
    return (
      <PersonaSurfaceEmpty
        dict={dict}
        illustrationLabelKey="empty.illustration"
        titleKey="empty.title"
        hintKey="empty.hint"
        primaryKey="empty.action"
      />
    )
  }

  return (
    <div className={page.shell} data-persona-surface="canvas">
      <header>
        <h1 className={page.title}>{t('title')}</h1>
        <p className={page.subtitle}>{t('subtitle')}</p>
      </header>
      <div className={styles.toolbar} role="tablist">
        <PersonaButton variant={mode === 'canvas' ? 'primary' : 'secondary'} onClick={() => { setMode('canvas') }}>
          {t('mode.canvas')}
        </PersonaButton>
        <PersonaButton variant={mode === 'list' ? 'primary' : 'secondary'} onClick={() => { setMode('list') }}>
          {t('mode.list')}
        </PersonaButton>
        {mode === 'canvas' && (
          <>
            <PersonaButton variant="secondary" onClick={() => { setScale(s => Math.min(2, s + 0.1)) }}>
              {t('action.zoomIn')}
            </PersonaButton>
            <PersonaButton variant="secondary" onClick={() => { setScale(s => Math.max(0.5, s - 0.1)) }}>
              {t('action.zoomOut')}
            </PersonaButton>
            <PersonaButton variant="secondary" onClick={() => { setScale(1) }}>{t('action.resetView')}</PersonaButton>
          </>
        )}
      </div>
      {mode === 'list' ? (
        <table className={styles.listTable}>
          <thead>
            <tr>
              <th scope="col">{t('column.type')}</th>
              <th scope="col">{t('column.label')}</th>
            </tr>
          </thead>
          <tbody>
            {MOCK_CANVAS_NODES.map(node => (
              <tr key={node.id}>
                <td>{t(`legend.${node.kind}`)}</td>
                <td>{node.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className={styles.viewport} role="img" aria-label={t('title')}>
          <svg width="100%" height="100%" viewBox="0 0 480 320" className={styles.scene} style={{ transform: `scale(${scale})` }}>
            {MOCK_CANVAS_EDGES.map((edge) => {
              const from = nodeMap.get(edge.from)
              const to = nodeMap.get(edge.to)
              if (from === undefined || to === undefined) return null
              const a = nodeCenter(from)
              const b = nodeCenter(to)
              return <line key={edge.id} className={styles.edge} x1={a.cx} y1={a.cy} x2={b.cx} y2={b.cy} />
            })}
            {MOCK_CANVAS_NODES.map(node => (
              <g key={node.id} className={styles.node} tabIndex={0} role="button" aria-label={node.label}>
                <circle className={styles.nodeCircle} cx={node.x + 28} cy={node.y + 28} r="28" />
                <text className={styles.nodeLabel} x={node.x + 28} y={node.y + 64} textAnchor="middle">
                  {node.label}
                </text>
              </g>
            ))}
          </svg>
        </div>
      )}
    </div>
  )
}
