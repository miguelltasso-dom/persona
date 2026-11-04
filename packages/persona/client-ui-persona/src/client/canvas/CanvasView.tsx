/** G2 — spatial view + accessible list mode (SVG/CSS transform only). */
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
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
  readonly onEmptyPrimary?: (() => void) | undefined
}

export function CanvasView({
  dict = defaultDict,
  nodes = [],
  edges = [],
  initialState = 'ready',
  onRemoteRetry,
  onEmptyPrimary,
}: CanvasViewProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const [mode, setMode] = useState<ViewMode>('canvas')
  const [scale, setScale] = useState(1)
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null)
  const [listFocusIndex, setListFocusIndex] = useState(0)
  const listRowRefs = useRef<(HTMLTableRowElement | null)[]>([])

  useLayoutEffect(() => {
    if (mode !== 'list') return
    listRowRefs.current[listFocusIndex]?.focus()
  }, [mode, listFocusIndex])

  const onNodeKeyDown = useCallback((event: KeyboardEvent, nodeId: string): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    setFocusedNodeId(nodeId)
  }, [])

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
          {...(onEmptyPrimary === undefined ? {} : { onPrimary: onEmptyPrimary })}
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
              {nodes.map((node, index) => (
                <tr
                  key={node.id}
                  ref={(el) => { listRowRefs.current[index] = el }}
                  tabIndex={index === listFocusIndex ? 0 : -1}
                  className={styles.listRow}
                  onFocus={() => { setListFocusIndex(index) }}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowDown') {
                      event.preventDefault()
                      setListFocusIndex(i => Math.min(nodes.length - 1, i + 1))
                    } else if (event.key === 'ArrowUp') {
                      event.preventDefault()
                      setListFocusIndex(i => Math.max(0, i - 1))
                    } else if (event.key === 'Home') {
                      event.preventDefault()
                      setListFocusIndex(0)
                    } else if (event.key === 'End') {
                      event.preventDefault()
                      setListFocusIndex(Math.max(0, nodes.length - 1))
                    }
                  }}
                >
                  <td>{t(`legend.${node.kind}`)}</td>
                  <td>{node.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <Card padding="none" className={styles.viewportCard}>
          <p id="canvas-graph-hint" className={styles.graphHint}>{t('a11y.graphHint')}</p>
          <div
            className={styles.viewport}
            role="region"
            aria-label={t('a11y.graphRegion')}
            aria-describedby="canvas-graph-hint"
          >
            <svg width="100%" height="100%" viewBox="0 0 480 320" className={styles.scene} style={{ transform: `scale(${scale})` }} role="presentation">
              {edges.map((edge) => {
                const from = nodeMap.get(edge.from)
                const to = nodeMap.get(edge.to)
                if (from === undefined || to === undefined) return null
                const a = nodeCenter(from)
                const b = nodeCenter(to)
                return (
                  <line
                    key={edge.id}
                    className={styles.edge}
                    x1={a.cx}
                    y1={a.cy}
                    x2={b.cx}
                    y2={b.cy}
                    aria-hidden="true"
                  />
                )
              })}
              {nodes.map(node => (
                <g
                  key={node.id}
                  className={`${styles.node}${focusedNodeId === node.id ? ` ${styles.nodeSelected}` : ''}`}
                  tabIndex={0}
                  role="button"
                  aria-pressed={focusedNodeId === node.id}
                  aria-label={t('a11y.nodeType', { type: t(`legend.${node.kind}`), label: node.label })}
                  onKeyDown={(event) => { onNodeKeyDown(event, node.id) }}
                  onClick={() => { setFocusedNodeId(node.id) }}
                >
                  <circle className={styles.nodeCircle} cx={node.x + 28} cy={node.y + 28} r="28" />
                  <text className={styles.nodeLabel} x={node.x + 28} y={node.y + 64} textAnchor="middle" aria-hidden="true">
                    {node.label}
                  </text>
                </g>
              ))}
            </svg>
          </div>
          {focusedNodeId !== null && (
            <p className={styles.selectionStatus} role="status" aria-live="polite">
              {t('a11y.nodeType', {
                type: t(`legend.${nodes.find(n => n.id === focusedNodeId)?.kind ?? 'task'}`),
                label: nodes.find(n => n.id === focusedNodeId)?.label ?? '',
              })}
            </p>
          )}
        </Card>
      )}
    </Screen>
  )
}
