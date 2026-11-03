/** G2 — spatial view + accessible list mode (SVG/CSS transform only). */
import { useMemo, useState, type ReactNode } from 'react'
import { Button, Card, Screen, ScreenHeader, Tabs } from '../primitives/index.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import styles from './Canvas.module.css'
import { PersonaSurfaceEmpty, PersonaSurfaceError, PersonaSurfaceLoading } from '../kanban/PersonaSurface.tsx'
import type { CanvasEdge, CanvasNode } from './mock-data.ts'
import { pt as defaultDict } from '../locale/canvas/locales.ts'

export type CanvasSurfaceState = 'loading' | 'error' | 'empty' | 'ready'
type ViewMode = 'canvas' | 'list'

function nodeCenter(node: CanvasNode): { cx: number; cy: number } {
  return { cx: node.x + 28, cy: node.y + 28 }
}

export interface CanvasViewProps {
  readonly dict?: LocaleDict
  readonly nodes?: readonly CanvasNode[]
  readonly edges?: readonly CanvasEdge[]
  readonly initialState?: CanvasSurfaceState
  readonly onRemoteRetry?: () => void
}

export function CanvasView({
  dict = defaultDict,
  nodes = [],
  edges = [],
  initialState = 'ready',
  onRemoteRetry,
}: CanvasViewProps): ReactNode {
  const t = (key: string) => bindLocale(dict, key)
  const [mode, setMode] = useState<ViewMode>('canvas')
  const [scale, setScale] = useState(1)

  const nodeMap = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes])

  const header = (
    <ScreenHeader
      icon="canvas"
      eyebrow={t('header.eyebrow')}
      title={t('title')}
      subtitle={t('subtitle')}
    />
  )

  if (initialState === 'loading') {
    return (
      <Screen className={styles.shell} data-persona-surface="canvas">
        {header}
        <PersonaSurfaceLoading dict={dict} messageKey="loading" skeletonColumns={3} />
      </Screen>
    )
  }
  if (initialState === 'error') {
    return (
      <Screen className={styles.shell} data-persona-surface="canvas">
        {header}
        <PersonaSurfaceError
          dict={dict}
          titleKey="error.title"
          retryKey="error.retry"
          onRetry={() => { onRemoteRetry?.() }}
        />
      </Screen>
    )
  }
  if (initialState === 'empty') {
    return (
      <Screen className={styles.shell} data-persona-surface="canvas">
        {header}
        <PersonaSurfaceEmpty
          dict={dict}
          illustrationKey="empty-vault"
          titleKey="empty.title"
          hintKey="empty.hint"
          primaryKey="empty.action"
        />
      </Screen>
    )
  }

  return (
    <Screen className={styles.shell} data-persona-surface="canvas">
      {header}
      <Tabs
        label={t('title')}
        idPrefix="canvas-mode"
        value={mode}
        onChange={setMode}
        items={[
          { id: 'canvas' as const, label: t('mode.canvas') },
          { id: 'list' as const, label: t('mode.list') },
        ]}
      />
      {mode === 'canvas' && (
        <div className={styles.toolbar}>
          <Button variant="secondary" size="s" onClick={() => { setScale(s => Math.min(2, s + 0.1)) }}>
            {t('action.zoomIn')}
          </Button>
          <Button variant="secondary" size="s" onClick={() => { setScale(s => Math.max(0.5, s - 0.1)) }}>
            {t('action.zoomOut')}
          </Button>
          <Button variant="secondary" size="s" onClick={() => { setScale(1) }}>{t('action.resetView')}</Button>
        </div>
      )}
      {mode === 'list' ? (
        <Card padding="none">
          <table className={styles.listTable}>
            <thead>
              <tr>
                <th scope="col">{t('column.type')}</th>
                <th scope="col">{t('column.label')}</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map(node => (
                <tr key={node.id}>
                  <td>{t(`legend.${node.kind}`)}</td>
                  <td>{node.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <Card padding="none" className={styles.viewportCard}>
          <div className={styles.viewport} role="img" aria-label={t('title')}>
            <svg width="100%" height="100%" viewBox="0 0 480 320" className={styles.scene} style={{ transform: `scale(${scale})` }}>
              {edges.map((edge) => {
                const from = nodeMap.get(edge.from)
                const to = nodeMap.get(edge.to)
                if (from === undefined || to === undefined) return null
                const a = nodeCenter(from)
                const b = nodeCenter(to)
                return <line key={edge.id} className={styles.edge} x1={a.cx} y1={a.cy} x2={b.cx} y2={b.cy} />
              })}
              {nodes.map(node => (
                <g key={node.id} className={styles.node} tabIndex={0} role="button" aria-label={node.label}>
                  <circle className={styles.nodeCircle} cx={node.x + 28} cy={node.y + 28} r="28" />
                  <text className={styles.nodeLabel} x={node.x + 28} y={node.y + 64} textAnchor="middle">
                    {node.label}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        </Card>
      )}
    </Screen>
  )
}
