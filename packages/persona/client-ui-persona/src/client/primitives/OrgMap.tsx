/**
 * "Quem cuida de quem" at scale (Miguel: 60–150+ personas) — Muse. OrgChart delegates here above 24 personas.
 * - Tree layout: root on top, groups wrapped in rows under a trunk (never one endless row), no overlap (grid).
 * - Collapsible groups: a face stack + count + "N pedem atenção"; big teams start collapsed except groups needing you.
 * - Smooth zoom/pan: wheel pans, Ctrl/⌘+wheel zooms at the pointer, drag the background, keys (arrows, + −, 0 = fit).
 * - Search with focus: pick a persona → its group opens, the view glides to it, a ring pulses, focus lands on it.
 * - Minimap: groups as blocks, the visible area as a frame; click/drag to move.
 * - List mode: virtualized rows (fixed height), groups collapsible.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type WheelEvent } from 'react'
import { AVATAR_96, OVERLAY_ICONS } from '../assets/generated-imports.ts'
import { Avatar } from './Avatar.tsx'
import { IconButton } from './Button.tsx'
import { BrandIcon, UiIcon } from './icons.tsx'
import type { OrgGroup, OrgPersona, OrgPersonaState } from './Governance.tsx'
import styles from './OrgMap.module.css'

export interface OrgMapLabels {
  readonly search: string
  readonly searchPlaceholder: string
  readonly noMatch: string
  readonly zoomIn: string
  readonly zoomOut: string
  readonly fit: string
  readonly expandAll: string
  readonly collapseAll: string
  readonly minimap: string
  /** "13 personas" */
  readonly count: (n: number) => string
  /** "2 pedem atenção" */
  readonly attention: (n: number) => string
  readonly expand: (group: string) => string
  readonly collapse: (group: string) => string
  /** "Mostrar mais 5" */
  readonly showMore: (n: number) => string
  readonly gestor: string
}

export const ORG_MAP_LABELS_PT: OrgMapLabels = {
  search: 'Encontrar persona',
  searchPlaceholder: 'Encontrar persona…',
  noMatch: 'Ninguém com esse nome',
  zoomIn: 'Aproximar',
  zoomOut: 'Afastar',
  fit: 'Caber na tela',
  expandAll: 'Abrir todos',
  collapseAll: 'Recolher todos',
  minimap: 'Mapa da equipe',
  count: n => `${n} ${n === 1 ? 'persona' : 'personas'}`,
  attention: n => `${n} ${n === 1 ? 'pede' : 'pedem'} atenção`,
  expand: g => `Abrir ${g}`,
  collapse: g => `Recolher ${g}`,
  showMore: n => `Mostrar mais ${n}`,
  gestor: 'Gestor',
}

const PORTRAITS = AVATAR_96 as Readonly<Record<string, string>>
const ATTENTION: ReadonlySet<OrgPersonaState> = new Set(['waiting', 'stuck'])
const STATE_ICON: Readonly<Partial<Record<OrgPersonaState, keyof typeof OVERLAY_ICONS>>> = {
  working: 'typing-dots', reviewing: 'review-loupe', waiting: 'approval-badge', resting: 'zzz', stuck: 'error-badge',
}
const VISIBLE_IN_GROUP = 8
const MIN_ZOOM = 0.35
const MAX_ZOOM = 1.6

function portraitOf(p: OrgPersona): string | undefined {
  return p.characterId === undefined ? undefined : PORTRAITS[p.characterId.replace(/-default$/u, '')]
}

function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

/** Roughly landscape: columns ≈ √(groups·1.6), between 2 and 6. */
export function columnsFor(groups: number): number {
  return Math.max(2, Math.min(6, Math.ceil(Math.sqrt(groups * 1.6))))
}

function subtitleOf(p: OrgPersona): string {
  return p.sector === undefined || p.sector === p.role ? p.role : `${p.role} · ${p.sector}`
}

export interface OrgMapProps {
  readonly root?: (OrgPersona & { readonly caption: string }) | undefined
  readonly groups: readonly OrgGroup[]
  readonly mode: 'chart' | 'list'
  readonly label: string
  readonly onSelectPersona?: ((id: string) => void) | undefined
  readonly cardTrigger?: ((id: string) => Record<string, unknown>) | undefined
  readonly labels?: OrgMapLabels | undefined
}

export function OrgMap({ root, groups, mode, label, onSelectPersona, cardTrigger, labels = ORG_MAP_LABELS_PT }: OrgMapProps): ReactNode {
  const total = useMemo(() => groups.reduce((sum, g) => sum + g.members.length, 0), [groups])
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(
    total <= 40 ? groups.map(g => g.id) : groups.filter(g => g.members.some(m => ATTENTION.has(m.state))).map(g => g.id),
  ))
  const [showAll, setShowAll] = useState<ReadonlySet<string>>(new Set())
  const [focusId, setFocusId] = useState<string | null>(null)
  const toggle = (id: string): void => {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const groupOf = useCallback((personaId: string) => groups.find(g => g.members.some(m => m.id === personaId)), [groups])
  const reveal = (personaId: string): void => {
    const group = groupOf(personaId)
    if (group === undefined) return
    setOpen(prev => new Set(prev).add(group.id))
    const index = group.members.findIndex(m => m.id === personaId)
    if (index >= VISIBLE_IN_GROUP) setShowAll(prev => new Set(prev).add(group.id))
    setFocusId(personaId)
  }

  const toolbar = (
    <div className={styles.toolbar}>
      <OrgSearch groups={groups} labels={labels} onPick={reveal} />
      <span className={styles.toolGroup}>
        <button type="button" className={styles.textButton} onClick={() => { setOpen(new Set(groups.map(g => g.id))) }}>{labels.expandAll}</button>
        <button type="button" className={styles.textButton} onClick={() => { setOpen(new Set()) }}>{labels.collapseAll}</button>
      </span>
    </div>
  )

  if (mode === 'list') {
    return (
      <div className={styles.wrap} role="region" aria-label={label}>
        {toolbar}
        <VirtualList groups={groups} open={open} toggle={toggle} focusId={focusId} labels={labels} onSelectPersona={onSelectPersona} cardTrigger={cardTrigger} />
      </div>
    )
  }

  return (
    <div className={styles.wrap} role="region" aria-label={label}>
      {toolbar}
      <ZoomPan focusId={focusId} labels={labels} onFocusDone={() => { setFocusId(null) }}>
        {root !== undefined && (
          <div className={styles.rootRow}>
            <div className={styles.rootCard}>
              <MapPersona persona={root} labels={labels} onSelect={onSelectPersona} cardTrigger={cardTrigger} focused={focusId === root.id} />
              <span className={styles.rootCaption}>{root.caption}</span>
            </div>
          </div>
        )}
        <ol className={styles.rows} style={{ '--org-cols': columnsFor(groups.length) } as CSSProperties} data-has-root={root !== undefined ? '' : undefined}>
          {groups.map((group) => {
            const isOpen = open.has(group.id)
            const attention = group.members.filter(m => ATTENTION.has(m.state)).length
            const visible = isOpen && !showAll.has(group.id) ? group.members.slice(0, VISIBLE_IN_GROUP) : group.members
            const hidden = group.members.length - visible.length
            return (
              <li key={group.id} className={styles.group} data-group={group.id} data-open={isOpen ? '' : undefined} data-attention={attention > 0 ? '' : undefined}>
                <button
                  type="button"
                  className={styles.groupHead}
                  aria-expanded={isOpen}
                  aria-label={isOpen ? labels.collapse(group.title) : labels.expand(group.title)}
                  onClick={() => { toggle(group.id) }}
                >
                  {group.kind === 'person'
                    ? <Avatar name={group.title} size={32} shape="person" decorative />
                    : <span className={styles.sectorIcon} aria-hidden="true">{group.icon ?? <UiIcon name="more" size={16} />}</span>}
                  <span className={styles.groupText}>
                    <span className={styles.groupTitle}>{group.title}</span>
                    <span className={styles.groupMeta}>
                      {labels.count(group.members.length)}
                      {attention > 0 && <span className={styles.attention}>{labels.attention(attention)}</span>}
                    </span>
                  </span>
                  <UiIcon name="chevronDown" size={16} strokeWidth={2.4} className={styles.chevron} />
                </button>
                {!isOpen ? (
                  <span className={styles.stack} aria-hidden="true">
                    {group.members.slice(0, 6).map(m => <Avatar key={m.id} name={m.name} src={portraitOf(m)} size={24} shape="portrait" decorative className={styles.stackFace} />)}
                    {group.members.length > 6 && <span className={styles.stackMore}>+{group.members.length - 6}</span>}
                  </span>
                ) : (
                  <ul className={styles.members}>
                    {visible.map(m => (
                      <li key={m.id}>
                        <MapPersona persona={m} labels={labels} onSelect={onSelectPersona} cardTrigger={cardTrigger} focused={focusId === m.id} />
                      </li>
                    ))}
                    {hidden > 0 && (
                      <li>
                        <button type="button" className={styles.textButton} onClick={() => { setShowAll(prev => new Set(prev).add(group.id)) }}>{labels.showMore(hidden)}</button>
                      </li>
                    )}
                  </ul>
                )}
              </li>
            )
          })}
        </ol>
      </ZoomPan>
    </div>
  )
}

function MapPersona({ persona, labels, onSelect, cardTrigger, focused }: {
  readonly persona: OrgPersona
  readonly labels: OrgMapLabels
  readonly onSelect?: ((id: string) => void) | undefined
  readonly cardTrigger?: ((id: string) => Record<string, unknown>) | undefined
  readonly focused: boolean
}): ReactNode {
  const icon = STATE_ICON[persona.state]
  return (
    <button
      type="button"
      className={styles.persona}
      data-persona={persona.id}
      data-state={persona.state}
      data-focused={focused ? '' : undefined}
      aria-label={`${persona.name}${persona.gestor === true ? ` (${persona.gestorLabel ?? labels.gestor})` : ''}, ${persona.role} — ${persona.stateLabel}`}
      title={persona.stateLabel}
      onClick={() => { onSelect?.(persona.id) }}
      {...cardTrigger?.(persona.id)}
    >
      <span className={styles.avatar}>
        <Avatar name={persona.name} src={portraitOf(persona)} shape="portrait" size={32} decorative />
        {persona.gestor === true && <span className={styles.gestorMark} aria-hidden="true"><UiIcon name="baton" size={9} strokeWidth={2.8} /></span>}
        <span className={styles.seal} data-state={persona.state} aria-hidden="true">
          {icon !== undefined && <img src={OVERLAY_ICONS[icon]} alt="" />}
        </span>
      </span>
      <span className={styles.personaText} aria-hidden="true">
        <span className={styles.personaName}>{persona.name}</span>
        <span className={styles.personaRole}>{subtitleOf(persona)}</span>
      </span>
    </button>
  )
}

/* ───────────── Search with focus ───────────── */

function OrgSearch({ groups, labels, onPick }: { readonly groups: readonly OrgGroup[]; readonly labels: OrgMapLabels; readonly onPick: (id: string) => void }): ReactNode {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listId = 'persona-org-search-list'
  const folded = fold(query.trim())
  const matches = useMemo(() => {
    if (folded.length === 0) return []
    const all = groups.flatMap(g => g.members.map(m => ({ persona: m, group: g.title })))
    return all.filter(x => fold(x.persona.name).includes(folded) || fold(x.persona.role).includes(folded)).slice(0, 8)
  }, [folded, groups])
  const pick = (id: string): void => {
    onPick(id)
    setQuery('')
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive(i => Math.min(matches.length - 1, i + 1)) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(i => Math.max(0, i - 1)) }
    else if (event.key === 'Enter' && matches[active] !== undefined) { event.preventDefault(); pick(matches[active].persona.id) }
    else if (event.key === 'Escape') setQuery('')
  }
  return (
    <div className={styles.search}>
      <BrandIcon name="busca" size={16} className={styles.searchIcon} />
      <input
        type="search"
        role="combobox"
        aria-label={labels.search}
        aria-expanded={matches.length > 0}
        aria-controls={listId}
        aria-activedescendant={matches[active] === undefined ? undefined : `${listId}-${matches[active].persona.id}`}
        aria-autocomplete="list"
        className={styles.searchInput}
        placeholder={labels.searchPlaceholder}
        value={query}
        onChange={(event) => { setQuery(event.target.value); setActive(0) }}
        onKeyDown={onKeyDown}
      />
      {folded.length > 0 && (
        <ul id={listId} role="listbox" className={styles.searchList} aria-label={labels.search}>
          {matches.length === 0 && <li className={styles.searchEmpty} role="option" aria-selected={false} aria-disabled="true">{labels.noMatch}</li>}
          {matches.map((x, i) => (
            <li
              key={x.persona.id}
              id={`${listId}-${x.persona.id}`}
              role="option"
              aria-selected={i === active}
              className={styles.searchOption}
              onPointerDown={(event) => { event.preventDefault(); pick(x.persona.id) }}
            >
              <Avatar name={x.persona.name} src={portraitOf(x.persona)} size={24} shape="portrait" decorative />
              <span><b>{x.persona.name}</b> · {x.persona.role}</span>
              <span className={styles.searchGroup}>{x.group}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* ───────────── Zoom / pan / minimap ───────────── */

interface View { readonly x: number; readonly y: number; readonly z: number }

function ZoomPan({ children, focusId, labels, onFocusDone }: { readonly children: ReactNode; readonly focusId: string | null; readonly labels: OrgMapLabels; readonly onFocusDone: () => void }): ReactNode {
  const viewportRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>({ x: 0, y: 0, z: 1 })
  const [animate, setAnimate] = useState(false)
  const [size, setSize] = useState({ vw: 1, vh: 1, cw: 1, ch: 1 })
  const [blocks, setBlocks] = useState<readonly { id: string; x: number; y: number; w: number; h: number; attention: boolean }[]>([])
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null)
  const fitted = useRef(false)

  const measure = useCallback(() => {
    const vp = viewportRef.current
    const canvas = canvasRef.current
    if (vp === null || canvas === null) return
    setSize({ vw: vp.clientWidth, vh: vp.clientHeight, cw: canvas.offsetWidth, ch: canvas.offsetHeight })
    const canvasRect = canvas.getBoundingClientRect()
    const z = canvas.offsetWidth > 0 ? canvasRect.width / canvas.offsetWidth : 1
    setBlocks([...canvas.querySelectorAll<HTMLElement>('[data-group]')].map((el) => {
      const r = el.getBoundingClientRect()
      return {
        id: el.dataset.group ?? '',
        x: (r.left - canvasRect.left) / z,
        y: (r.top - canvasRect.top) / z,
        w: r.width / z,
        h: r.height / z,
        attention: el.dataset.attention !== undefined,
      }
    }))
  }, [])

  useLayoutEffect(() => {
    measure()
    const canvas = canvasRef.current
    const vp = viewportRef.current
    if (canvas === null || vp === null || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(measure)
    observer.observe(canvas)
    observer.observe(vp)
    return () => { observer.disconnect() }
  }, [measure])

  /** Keep at least `margin` px of content in view on each axis; small content may sit anywhere inside. */
  const clampView = useCallback((v: View): View => {
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.z))
    const margin = 80
    const axis = (pos: number, content: number, viewport: number): number => (
      content + 2 * margin <= viewport
        ? Math.min(Math.max(pos, margin), viewport - content - margin)
        : Math.min(Math.max(pos, viewport - content - margin), margin)
    )
    return { z, x: axis(v.x, size.cw * z, size.vw), y: axis(v.y, size.ch * z, size.vh) }
  }, [size])

  const fit = useCallback((animated = true) => {
    const z = Math.min(1, Math.max(MIN_ZOOM, Math.min((size.vw - 32) / size.cw, (size.vh - 32) / size.ch)))
    setAnimate(animated)
    setView({ z, x: (size.vw - size.cw * z) / 2, y: 16 })
  }, [size])

  useEffect(() => {
    if (fitted.current || size.cw <= 1) return
    fitted.current = true
    // Start readable: fit when it fits at ≥ 0.75, else 100 % centered at the top (the root).
    const zFit = Math.min((size.vw - 32) / size.cw, (size.vh - 32) / size.ch)
    if (zFit >= 0.75) fit(false)
    else setView({ z: 1, x: Math.min(16, (size.vw - size.cw) / 2), y: 16 })
  }, [size, fit])

  const zoomAt = (factor: number, cx = size.vw / 2, cy = size.vh / 2, animated = true): void => {
    setAnimate(animated)
    setView((v) => {
      const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.z * factor))
      const k = z / v.z
      return clampView({ z, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k })
    })
  }

  // Glide to a searched persona once its group is open and laid out.
  useEffect(() => {
    if (focusId === null) return undefined
    const frame = requestAnimationFrame(() => {
      const canvas = canvasRef.current
      const el = canvas?.querySelector<HTMLElement>(`[data-persona="${CSS.escape(focusId)}"]`)
      if (canvas === null || el === null || el === undefined) return
      const canvasRect = canvas.getBoundingClientRect()
      const r = el.getBoundingClientRect()
      const cx = (r.left - canvasRect.left + r.width / 2) / view.z
      const cy = (r.top - canvasRect.top + r.height / 2) / view.z
      const z = Math.max(view.z, 1)
      setAnimate(true)
      setView({ z, x: size.vw / 2 - cx * z, y: size.vh / 2 - cy * z })
      setTimeout(() => {
        el.focus({ preventScroll: true })
        onFocusDone()
      }, 1700)
    })
    return () => { cancelAnimationFrame(frame) }
  }, [focusId])

  const onWheel = (event: WheelEvent<HTMLDivElement>): void => {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault()
      const rect = event.currentTarget.getBoundingClientRect()
      zoomAt(Math.exp(-event.deltaY * 0.0022), event.clientX - rect.left, event.clientY - rect.top, false)
      return
    }
    setAnimate(false)
    setView(v => clampView({ ...v, x: v.x - event.deltaX, y: v.y - event.deltaY }))
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if ((event.target as HTMLElement).closest('button, a, input') !== null) return
    drag.current = { px: event.clientX, py: event.clientY, x: view.x, y: view.y }
    event.currentTarget.setPointerCapture(event.pointerId)
    setAnimate(false)
  }
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const d = drag.current
    if (d === null) return
    setView(v => clampView({ ...v, x: d.x + event.clientX - d.px, y: d.y + event.clientY - d.py }))
  }
  const endDrag = (): void => { drag.current = null }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.target !== event.currentTarget) return
    const step = 60
    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }
    const move = moves[event.key]
    if (move !== undefined) {
      event.preventDefault()
      setAnimate(true)
      setView(v => clampView({ ...v, x: v.x + move[0], y: v.y + move[1] }))
    } else if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomAt(1.2) }
    else if (event.key === '-') { event.preventDefault(); zoomAt(1 / 1.2) }
    else if (event.key === '0') { event.preventDefault(); fit() }
  }

  // Minimap scale.
  const mmW = 168
  const mmScale = mmW / Math.max(1, size.cw)
  const mmH = Math.min(120, size.ch * mmScale)
  const frame = {
    left: (-view.x / view.z) * mmScale,
    top: (-view.y / view.z) * mmScale,
    width: (size.vw / view.z) * mmScale,
    height: (size.vh / view.z) * mmScale,
  }
  const jumpTo = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    const cx = (event.clientX - rect.left) / mmScale
    const cy = (event.clientY - rect.top) / mmScale
    setAnimate(event.type === 'pointerdown')
    setView(v => clampView({ ...v, x: size.vw / 2 - cx * v.z, y: size.vh / 2 - cy * v.z }))
  }
  const overflowing = size.cw * view.z > size.vw + 2 || size.ch * view.z > size.vh + 2

  return (
    <div className={styles.stage}>
      <div
        ref={viewportRef}
        className={styles.viewport}
        tabIndex={0}
        aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown + - 0"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
      >
        <div
          ref={canvasRef}
          className={styles.canvas}
          data-animate={animate ? '' : undefined}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}
        >
          {children}
        </div>
      </div>
      <div className={styles.zoom} role="group" aria-label={labels.fit}>
        <IconButton size="s" variant="secondary" label={labels.zoomOut} icon={<UiIcon name="minus" size={16} strokeWidth={2.4} />} onClick={() => { zoomAt(1 / 1.25) }} />
        <output className={styles.zoomValue}>{Math.round(view.z * 100)}%</output>
        <IconButton size="s" variant="secondary" label={labels.zoomIn} icon={<UiIcon name="plus" size={16} strokeWidth={2.4} />} onClick={() => { zoomAt(1.25) }} />
        <button type="button" className={styles.textButton} onClick={() => { fit() }}>{labels.fit}</button>
      </div>
      {overflowing && (
        <div
          className={styles.minimap}
          role="img"
          aria-label={labels.minimap}
          style={{ width: mmW, height: mmH }}
          onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); jumpTo(event) }}
          onPointerMove={(event) => { if (event.buttons === 1) jumpTo(event) }}
        >
          {blocks.map(b => (
            <span
              key={b.id}
              className={styles.mmBlock}
              data-attention={b.attention ? '' : undefined}
              style={{ left: b.x * mmScale, top: b.y * mmScale, width: Math.max(3, b.w * mmScale), height: Math.max(3, b.h * mmScale) }}
            />
          ))}
          <span className={styles.mmFrame} style={frame} />
        </div>
      )}
    </div>
  )
}

/* ───────────── Virtualized list ───────────── */

const ROW_H = 52

type Row = { readonly kind: 'group'; readonly group: OrgGroup } | { readonly kind: 'persona'; readonly persona: OrgPersona; readonly group: OrgGroup }

function VirtualList({ groups, open, toggle, focusId, labels, onSelectPersona, cardTrigger }: {
  readonly groups: readonly OrgGroup[]
  readonly open: ReadonlySet<string>
  readonly toggle: (id: string) => void
  readonly focusId: string | null
  readonly labels: OrgMapLabels
  readonly onSelectPersona?: ((id: string) => void) | undefined
  readonly cardTrigger?: ((id: string) => Record<string, unknown>) | undefined
}): ReactNode {
  const ref = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [height, setHeight] = useState(600)
  const rows = useMemo<Row[]>(() => groups.flatMap(g => [
    { kind: 'group' as const, group: g },
    ...(open.has(g.id) ? g.members.map(p => ({ kind: 'persona' as const, persona: p, group: g })) : []),
  ]), [groups, open])

  useLayoutEffect(() => {
    const el = ref.current
    if (el === null) return undefined
    setHeight(el.clientHeight || 600)
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(() => { setHeight(el.clientHeight || 600) })
    observer.observe(el)
    return () => { observer.disconnect() }
  }, [])

  useEffect(() => {
    if (focusId === null) return
    const index = rows.findIndex(r => r.kind === 'persona' && r.persona.id === focusId)
    if (index >= 0 && ref.current !== null) {
      ref.current.scrollTo({ top: Math.max(0, index * ROW_H - height / 2), behavior: 'smooth' })
      setTimeout(() => { ref.current?.querySelector<HTMLElement>(`[data-persona="${CSS.escape(focusId)}"]`)?.focus({ preventScroll: true }) }, 450)
    }
  }, [focusId, rows, height])

  const first = Math.max(0, Math.floor(scrollTop / ROW_H) - 8)
  const last = Math.min(rows.length, Math.ceil((scrollTop + height) / ROW_H) + 8)
  return (
    <div ref={ref} className={styles.list} onScroll={(event) => { setScrollTop(event.currentTarget.scrollTop) }}>
      <ul className={styles.listInner} style={{ height: rows.length * ROW_H }} aria-rowcount={rows.length}>
        {rows.slice(first, last).map((row, i) => {
          const index = first + i
          const style = { top: index * ROW_H, height: ROW_H } as CSSProperties
          if (row.kind === 'group') {
            const isOpen = open.has(row.group.id)
            const attention = row.group.members.filter(m => ATTENTION.has(m.state)).length
            return (
              <li key={`g-${row.group.id}`} className={styles.listRow} style={style} aria-rowindex={index + 1}>
                <button type="button" className={styles.listGroup} aria-expanded={isOpen} onClick={() => { toggle(row.group.id) }}>
                  <UiIcon name="chevronDown" size={16} strokeWidth={2.4} className={styles.chevron} />
                  <b>{row.group.title}</b>
                  <span className={styles.groupMeta}>{labels.count(row.group.members.length)}</span>
                  {attention > 0 && <span className={styles.attention}>{labels.attention(attention)}</span>}
                </button>
              </li>
            )
          }
          return (
            <li key={row.persona.id} className={`${styles.listRow} ${styles.listPersonaRow}`} style={style} aria-rowindex={index + 1}>
              <MapPersona persona={row.persona} labels={labels} onSelect={onSelectPersona} cardTrigger={cardTrigger} focused={focusId === row.persona.id} />
            </li>
          )
        })}
      </ul>
    </div>
  )
}
