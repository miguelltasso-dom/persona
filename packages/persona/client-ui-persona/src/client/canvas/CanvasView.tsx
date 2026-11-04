/** G2 — spatial view + accessible list mode (SVG/CSS transform only). Spec: design/QUILL-SCREENS-SPEC.md. */
import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { personaPortraitSrc } from '../approvals/approvals-ui-helpers.ts'
import '../assets/generated-imports.ts' // registers the pose URLs (poseUrl reads them)
import { poseUrl } from '../assets/asset-url.ts'
import { Avatar, Button, Card, Chip, EmptyState, Screen, ScreenHeader, Tabs, UiIcon, type UiIconName } from '../primitives/index.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import styles from './Canvas.module.css'
import { PersonaSurfaceError, PersonaSurfaceLoading } from '../kanban/PersonaSurface.tsx'
import type { CanvasEdge, CanvasNode, CanvasNodeKind } from './mock-data.ts'
import { pt as defaultDict } from '../locale/canvas/locales.ts'

export type CanvasSurfaceState = 'loading' | 'error' | 'empty' | 'ready'

/** Inline strokes for the node badge (nested <svg> cannot host the React UiIcon wrapper's sizing); same shapes as UiIcon. */
function KindGlyph({ kind }: { readonly kind: CanvasNodeKind }): ReactNode {
  switch (kind) {
    case 'persona':
      return <><circle cx="12" cy="12" r="8.5" /><path d="M8.6 14.2c1 1.2 2.1 1.8 3.4 1.8s2.4-.6 3.4-1.8M9 9.6h.01M15 9.6h.01" /></>
    case 'task':
      return <path d="m5 12.5 4.5 4.5L19 7.5" />
    case 'topic':
      return <><circle cx="12" cy="12" r="3.6" /><path d="M15.6 12v1.3a2.3 2.3 0 0 0 4.6 0V12a8.2 8.2 0 1 0-3.2 6.5" /></>
    case 'decision':
      return <><circle cx="12" cy="12" r="8.5" /><path d="M9.7 9.7a2.4 2.4 0 1 1 3.4 2.2c-.7.4-1.1.9-1.1 1.7M12 16.6h.01" /></>
  }
}
type ViewMode = 'canvas' | 'list'

/**
 * The map is drawn in real CSS pixels (1 unit = 1 px at zoom 100%), so a name is 15 px and a kind label 12 px whatever the
 * window size; a small window scrolls the frame instead of shrinking the type. Host coordinates are spread by COORD.
 */
const COORD = 1.6
const CARD = { width: 204, height: 56 } as const
const SCENE_PAD = 32
const SCENE_MIN = { width: 640, height: 360 } as const
/** Beyond this the object is not drawn on the map (it stays in the list, which is the complete view). */
const SCENE_MAX = { width: 2400, height: 1600 } as const

function placed(node: CanvasNode): { x: number; y: number } {
  return { x: node.x * COORD, y: node.y * COORD }
}

function nodeCenter(node: CanvasNode): { cx: number; cy: number } {
  const at = placed(node)
  return { cx: at.x + CARD.width / 2, cy: at.y + CARD.height / 2 }
}

/** Only what falls inside the drawable scene is drawn; everything stays in the list. */
export function isNodeVisible(node: CanvasNode): boolean {
  const at = placed(node)
  return at.x + CARD.width > 0 && at.y + CARD.height > 0 && at.x < SCENE_MAX.width && at.y < SCENE_MAX.height
}

/** Longest label drawn inside a card (the full text stays in the aria-label, the tooltip and the list view). */
export const CANVAS_LABEL_MAX = 17

export function shortNodeLabel(label: string, max: number = CANVAS_LABEL_MAX): string {
  const text = label.trim()
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`
}

const KIND_ICON: Readonly<Record<CanvasNodeKind, UiIconName>> = {
  persona: 'smile',
  task: 'check',
  topic: 'at',
  decision: 'help',
}

/** Panel each kind of object opens ("Enter abre o item"). */
export const CANVAS_OPEN_PANEL: Readonly<Record<CanvasNodeKind, 'directMessages' | 'kanban' | 'channels' | 'approvals'>> = {
  persona: 'directMessages',
  task: 'kanban',
  topic: 'channels',
  decision: 'approvals',
}

const MODE_KEY = 'persona.canvas.mode.v1'
/** Below this width the list is the default (the map needs room). */
const NARROW_QUERY = '(max-width: 719px)'

function initialMode(): ViewMode {
  try {
    const saved = window.localStorage.getItem(MODE_KEY)
    if (saved === 'canvas' || saved === 'list') return saved
  } catch { /* storage blocked: fall through to the width rule */ }
  try {
    if (typeof window.matchMedia === 'function' && window.matchMedia(NARROW_QUERY).matches) return 'list'
  } catch { /* no matchMedia */ }
  return 'canvas'
}

function rememberMode(mode: ViewMode): void {
  try { window.localStorage.setItem(MODE_KEY, mode) } catch { /* private window: the choice just is not remembered */ }
}

export interface CanvasViewProps {
  readonly dict?: LocaleDict
  readonly nodes?: readonly CanvasNode[]
  readonly edges?: readonly CanvasEdge[]
  readonly initialState?: CanvasSurfaceState
  readonly onRemoteRetry?: () => void
  readonly onEmptyPrimary?: (() => void) | undefined
  /** Enter on a list row opens the object where it lives (task → Quadros, decision → Aprovações…). */
  readonly onOpenNode?: ((node: CanvasNode) => void) | undefined
}

export function CanvasView({
  dict = defaultDict,
  nodes = [],
  edges = [],
  initialState = 'ready',
  onRemoteRetry,
  onEmptyPrimary,
  onOpenNode,
}: CanvasViewProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const [mode, setModeState] = useState<ViewMode>(initialMode)
  const [scale, setScale] = useState(1)
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null)
  const [hoverNodeId, setHoverNodeId] = useState<string | null>(null)
  const [listFocusIndex, setListFocusIndex] = useState(0)
  const listRowRefs = useRef<(HTMLTableRowElement | null)[]>([])
  // Focus moves to a row only after an arrow/Home/End press inside the list. Switching to the list tab must leave
  // focus on the tab (a keyboard user can still arrow back to "Canvas").
  const moveFocusToRow = useRef(false)

  const setMode = (next: ViewMode): void => {
    setModeState(next)
    rememberMode(next)
  }

  useLayoutEffect(() => {
    if (mode !== 'list' || !moveFocusToRow.current) return
    moveFocusToRow.current = false
    listRowRefs.current[listFocusIndex]?.focus()
  }, [mode, listFocusIndex])

  const onNodeKeyDown = useCallback((event: KeyboardEvent, nodeId: string): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    setFocusedNodeId(nodeId)
  }, [])

  const nodeMap = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes])
  // The map shows relations as lines; the list says them in words so nothing depends on seeing the picture.
  const relationsOf = useMemo(() => {
    const out = new Map<string, string[]>()
    const push = (id: string, text: string): void => { out.set(id, [...(out.get(id) ?? []), text]) }
    for (const edge of edges) {
      const from = nodeMap.get(edge.from)
      const to = nodeMap.get(edge.to)
      if (from === undefined || to === undefined) continue
      push(from.id, t('link.to', { label: to.label }))
      push(to.id, t('link.from', { label: from.label }))
    }
    return out
  }, [edges, nodeMap, dict])
  // "Quem": the persona an object is about (itself for a persona, the linked persona for anything else).
  const whoOf = useCallback((node: CanvasNode): CanvasNode | undefined => {
    if (node.kind === 'persona') return node
    for (const edge of edges) {
      const otherId = edge.from === node.id ? edge.to : edge.to === node.id ? edge.from : undefined
      const other = otherId === undefined ? undefined : nodeMap.get(otherId)
      if (other?.kind === 'persona') return other
    }
    return undefined
  }, [edges, nodeMap])
  // When no object has anyone, the column would be a column of dashes: leave it out.
  const showWho = useMemo(() => nodes.some(node => whoOf(node) !== undefined), [nodes, whoOf])
  const visibleNodes = useMemo(() => nodes.filter(isNodeVisible), [nodes])
  const visibleIds = useMemo(() => new Set(visibleNodes.map(node => node.id)), [visibleNodes])
  // The scene grows with the objects (never smaller than a comfortable board), so nothing is clipped.
  const scene = useMemo(() => {
    let width = 0
    let height = 0
    for (const node of visibleNodes) {
      const at = placed(node)
      width = Math.max(width, at.x + CARD.width + SCENE_PAD)
      height = Math.max(height, at.y + CARD.height + SCENE_PAD)
    }
    return {
      width: Math.min(SCENE_MAX.width, Math.max(SCENE_MIN.width, width)),
      height: Math.min(SCENE_MAX.height, Math.max(SCENE_MIN.height, height)),
    }
  }, [visibleNodes])
  const clipPrefix = useId().replace(/[^a-zA-Z0-9]/gu, '')

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
        <EmptyState
          illustration={poseUrl('luna', 'disponivel')}
          title={t('empty.title')}
          body={t('empty.hint')}
          // No dead controls (DESIGN-SYSTEM §9): the button only exists when it goes somewhere.
          action={onEmptyPrimary === undefined ? undefined : (
            <Button variant="primary" onClick={() => { onEmptyPrimary() }}>{t('empty.action')}</Button>
          )}
        />
      </Screen>
    )
  }

  const selectedNode = focusedNodeId === null ? undefined : nodeMap.get(focusedNodeId)
  const selectionStatus = selectedNode === undefined ? null : (
    <p className={styles.selectionStatus} role="status" aria-live="polite">
      {t('a11y.nodeType', { type: t(`legend.${selectedNode.kind}`), label: selectedNode.label })}
    </p>
  )
  const activeNodeId = hoverNodeId ?? focusedNodeId

  return (
    <Screen className={styles.shell} data-persona-surface="canvas">
      {header}
      <div className={styles.bar}>
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
      </div>
      {mode === 'list' ? (
        <Card padding="none">
          <p id="canvas-list-hint" className={styles.graphHint}>{t('a11y.listHint')}</p>
          <div className={styles.listScroll}>
            <table className={styles.listTable} aria-label={t('a11y.listRegion')} aria-describedby="canvas-list-hint">
              <thead>
                <tr>
                  <th scope="col">{t('column.type')}</th>
                  <th scope="col">{t('column.label')}</th>
                  <th scope="col">{t('column.links')}</th>
                  {showWho && <th scope="col">{t('column.who')}</th>}
                </tr>
              </thead>
              <tbody>
                {nodes.map((node, index) => {
                  const who = whoOf(node)
                  const portrait = who === undefined ? undefined : personaPortraitSrc(undefined, who.label)
                  return (
                    <tr
                      key={node.id}
                      ref={(el) => { listRowRefs.current[index] = el }}
                      tabIndex={index === listFocusIndex ? 0 : -1}
                      className={styles.listRow}
                      data-selected={focusedNodeId === node.id ? '' : undefined}
                      aria-current={focusedNodeId === node.id ? 'true' : undefined}
                      onFocus={() => { setListFocusIndex(index) }}
                      onClick={() => { setFocusedNodeId(node.id); setListFocusIndex(index) }}
                      onDoubleClick={() => { setFocusedNodeId(node.id); onOpenNode?.(node) }}
                      onKeyDown={(event) => {
                        if (event.key === 'ArrowDown') {
                          event.preventDefault()
                          moveFocusToRow.current = true
                          setListFocusIndex(i => Math.min(nodes.length - 1, i + 1))
                        } else if (event.key === 'ArrowUp') {
                          event.preventDefault()
                          moveFocusToRow.current = true
                          setListFocusIndex(i => Math.max(0, i - 1))
                        } else if (event.key === 'Home') {
                          event.preventDefault()
                          moveFocusToRow.current = true
                          setListFocusIndex(0)
                        } else if (event.key === 'End') {
                          event.preventDefault()
                          moveFocusToRow.current = true
                          setListFocusIndex(Math.max(0, nodes.length - 1))
                        } else if (event.key === ' ') {
                          // Space selects; the selection is shared with the map.
                          event.preventDefault()
                          setFocusedNodeId(node.id)
                        } else if (event.key === 'Enter') {
                          // Enter opens the object where it lives (and keeps it selected on return).
                          event.preventDefault()
                          setFocusedNodeId(node.id)
                          onOpenNode?.(node)
                        }
                      }}
                    >
                      <td>
                        <Chip tone="neutral" size="s" icon={<UiIcon name={KIND_ICON[node.kind]} size={14} strokeWidth={2.2} />}>
                          {t(`legend.${node.kind}`)}
                        </Chip>
                      </td>
                      <td className={styles.nameCell}>{node.label}</td>
                      <td>{(relationsOf.get(node.id) ?? []).join(' · ') || t('link.none')}</td>
                      {showWho && (
                        <td>
                          {who === undefined ? (
                            <span aria-label={t('who.none')}>—</span>
                          ) : (
                            <span className={styles.who}>
                              <Avatar name={who.label} {...(portrait === undefined ? {} : { src: portrait })} size={24} shape="portrait" decorative />
                              {who.label}
                            </span>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {selectionStatus}
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
            <svg
              width={scene.width * scale}
              height={scene.height * scale}
              viewBox={`0 0 ${scene.width} ${scene.height}`}
              className={styles.scene}
              role="presentation"
            >
              {edges.map((edge) => {
                if (!visibleIds.has(edge.from) || !visibleIds.has(edge.to)) return null
                const from = nodeMap.get(edge.from)
                const to = nodeMap.get(edge.to)
                if (from === undefined || to === undefined) return null
                const a = nodeCenter(from)
                const b = nodeCenter(to)
                const active = activeNodeId !== null && (edge.from === activeNodeId || edge.to === activeNodeId)
                return (
                  <line
                    key={edge.id}
                    className={`${styles.edge}${active ? ` ${styles.edgeActive}` : ''}`}
                    x1={a.cx}
                    y1={a.cy}
                    x2={b.cx}
                    y2={b.cy}
                    aria-hidden="true"
                  />
                )
              })}
              {visibleNodes.map((node, index) => {
                const at = placed(node)
                const portrait = node.kind === 'persona' ? personaPortraitSrc(undefined, node.label) : undefined
                const clipId = `${clipPrefix}-${index}`
                return (
                  <g
                    key={node.id}
                    className={`${styles.node}${focusedNodeId === node.id ? ` ${styles.nodeSelected}` : ''}`}
                    data-kind={node.kind}
                    tabIndex={0}
                    role="button"
                    aria-pressed={focusedNodeId === node.id}
                    aria-label={t('a11y.nodeType', { type: t(`legend.${node.kind}`), label: node.label })}
                    onKeyDown={(event) => { onNodeKeyDown(event, node.id) }}
                    onClick={() => { setFocusedNodeId(node.id) }}
                    onPointerEnter={() => { setHoverNodeId(node.id) }}
                    onPointerLeave={() => { setHoverNodeId(null) }}
                    onFocus={() => { setHoverNodeId(node.id) }}
                    onBlur={() => { setHoverNodeId(null) }}
                  >
                    {/* A sticker: a solid shadow under the card, then the card. */}
                    <rect className={styles.nodeShadow} x={at.x} y={at.y + 3} width={CARD.width} height={CARD.height} rx="14" />
                    <rect className={styles.nodeCard} x={at.x} y={at.y} width={CARD.width} height={CARD.height} rx="14" />
                    {/* The kind, always: a portrait for a persona, otherwise a badge with the kind's icon (never colour alone). */}
                    <rect className={styles.nodeBadge} x={at.x + 12} y={at.y + 12} width="32" height="32" rx="9" />
                    {node.kind === 'persona' ? (
                      portrait === undefined ? (
                        <text className={styles.nodeInitial} x={at.x + 28} y={at.y + 33} textAnchor="middle" aria-hidden="true">{node.label.trim().slice(0, 1).toUpperCase()}</text>
                      ) : (
                        <>
                          <clipPath id={clipId}><rect x={at.x + 12} y={at.y + 12} width="32" height="32" rx="9" /></clipPath>
                          <image href={portrait} x={at.x + 12} y={at.y + 12} width="32" height="32" preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clipId})`} aria-hidden="true" />
                        </>
                      )
                    ) : (
                      <svg x={at.x + 20} y={at.y + 20} width="16" height="16" viewBox="0 0 24 24" className={styles.nodeIcon} aria-hidden="true">
                        <KindGlyph kind={node.kind} />
                      </svg>
                    )}
                    {/* A long name would run over its neighbour: show the start, keep the whole text on hover. */}
                    <text className={styles.nodeLabel} x={at.x + 54} y={at.y + 26} aria-hidden="true">
                      {shortNodeLabel(node.label) !== node.label.trim() && <title>{node.label}</title>}
                      {shortNodeLabel(node.label)}
                    </text>
                    <text className={styles.nodeKind} x={at.x + 54} y={at.y + 44} aria-hidden="true">{t(`legend.${node.kind}`)}</text>
                  </g>
                )
              })}
            </svg>
          </div>
          {selectionStatus}
        </Card>
      )}
    </Screen>
  )
}
