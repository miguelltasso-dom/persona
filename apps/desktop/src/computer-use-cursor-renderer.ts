/**
 * W3-6 persona cursor renderer for the Electron overlay (Muse; COMPUTER-USE-SPEC §2–§5, §7).
 * Replaces the placeholder in `computer-use-overlay.ts`: one self-contained document (no network, no preload),
 * with the motion math ported as-is from `client-ui-persona/src/client/primitives/cursor-motion.ts`.
 *
 * Contract with the main process (no preload needed):
 * - main → overlay: `webContents.executeJavaScript(overlayDispatchScript(command))`, i.e. `window.__personaOverlay.dispatch(cmd)`.
 *   Commands: `cu:state` (who is on screen + human holds control), `cu:move`, `cu:click`, `cu:type`, `cu:frame`.
 * - overlay → main: `console.info('persona-overlay:devolver')` when the human presses Devolver
 *   (listen with `webContents.on('console-message')`), plus `persona-overlay:hover-devolver:<0|1>` so main can call
 *   `overlayMouseIgnore()` while the pointer is on the button.
 *
 * Rules kept here: at most {@link OVERLAY_CURSOR_CAP} cursors, the rest queue with "<nome> espera a tela";
 * secret text is never drawn (only dots); reduced-motion ⇒ no trails, no ripples, no infinite animation, moves
 * become a ≤ 90 ms fade.
 */

import { OVERLAY_CURSOR_CAP, type OverlayPersonaState } from './computer-use-overlay.ts'

/** One persona the overlay may draw. `avatar` must be a data: URL (the overlay never touches the network). */
export interface OverlayCursorPersona {
  readonly id: string
  readonly name: string
  /** Persona accent, e.g. `#f0be6a`. */
  readonly color: string
  readonly avatar?: string
  readonly state?: OverlayPersonaState | 'clicking' | 'waiting' | 'idle'
}

export type OverlayCommand =
  | { readonly type: 'cu:state'; readonly personas: readonly OverlayCursorPersona[]; readonly human?: boolean }
  | { readonly type: 'cu:move'; readonly id: string; readonly x: number; readonly y: number; readonly detail?: string }
  | { readonly type: 'cu:click'; readonly id: string; readonly detail?: string }
  | { readonly type: 'cu:type'; readonly id: string; readonly text: string; readonly secret?: boolean }
  | { readonly type: 'cu:frame'; readonly id: string; readonly rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | null; readonly label?: string }

export interface OverlayRendererLabels {
  readonly humanHolds: string
  readonly giveBack: string
  readonly waitsForScreen: (name: string) => string
  readonly clicking: string
  readonly controlling: (name: string) => string
  readonly giveBackKey: string
  /** Frame tag while the human holds control. */
  readonly humanFrame: string
}

export const DEFAULT_OVERLAY_LABELS: OverlayRendererLabels = {
  humanHolds: 'você assumiu',
  giveBack: 'Devolver',
  waitsForScreen: name => `${name} espera a tela`,
  clicking: 'clicando',
  controlling: name => `${name} está usando esta área`,
  giveBackKey: 'Esc pausa',
  humanFrame: 'Você está no controle',
}

/** Script the main process runs to deliver one command. */
export function overlayDispatchScript(command: OverlayCommand): string {
  return `window.__personaOverlay && window.__personaOverlay.dispatch(${JSON.stringify(command)})`
}

/** Console markers the overlay emits (main listens on `console-message`). */
export const OVERLAY_DEVOLVER_MESSAGE = 'persona-overlay:devolver'
export const OVERLAY_HOVER_PREFIX = 'persona-overlay:hover-devolver:'

/**
 * Map one overlay console line to a main-process action.
 * @param message - `console-message` text.
 */
export function interpretOverlayConsole(message: string):
  | { readonly kind: 'devolver' }
  | { readonly kind: 'hover'; readonly hovered: boolean }
  | undefined {
  if (message === OVERLAY_DEVOLVER_MESSAGE) return { kind: 'devolver' }
  if (message.startsWith(OVERLAY_HOVER_PREFIX)) {
    return { kind: 'hover', hovered: message.endsWith('1') }
  }
  return undefined
}

/** The overlay document. Pure string; safe to wrap in `overlayDocumentUrl`. */
export function personaCursorOverlayHtml(labels: OverlayRendererLabels = DEFAULT_OVERLAY_LABELS): string {
  const L = JSON.stringify({
    humanHolds: labels.humanHolds,
    giveBack: labels.giveBack,
    clicking: labels.clicking,
    giveBackKey: labels.giveBackKey,
    humanFrame: labels.humanFrame,
    waitsForScreen: labels.waitsForScreen('{name}'),
    controlling: labels.controlling('{name}'),
  }).replaceAll('<', '\\u003c')
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
:root{--card:#fffaf0;--ink:#34243f;--ink-soft:#6b5a7a;--outline:#34243f;--outline-soft:rgb(52 36 63/.18);
--font:"Nunito","Segoe UI",system-ui,sans-serif;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--card:#2a1e35;--ink:#f6eee0;--ink-soft:#cdbfdb;--outline:#120c18;--outline-soft:rgb(246 238 224/.16);color-scheme:dark}}
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:transparent;pointer-events:none;overflow:hidden;font:700 12px/1 var(--font)}
svg.trails{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.trail{fill:none;stroke-width:3;stroke-linecap:round;opacity:.55}
.cursor{position:absolute;left:0;top:0;will-change:transform;filter:drop-shadow(0 2px 0 rgb(52 36 63/.35));transition:opacity .09s linear}
.cursor svg{display:block;width:22px;height:26px;transform-origin:3px 3px;transition:transform .12s cubic-bezier(.3,1.6,.5,1)}
.cursor[data-state=clicking] svg{transform:scale(.82)}
.pill{position:absolute;left:16px;top:22px;display:inline-flex;align-items:center;gap:6px;max-width:280px;padding:3px 10px 3px 3px;
border:1.5px solid var(--outline);border-radius:999px;background:var(--c);color:#34243f;box-shadow:0 3px 0 var(--outline);
font-weight:800;white-space:nowrap;transform-origin:0 0;animation:pop .28s cubic-bezier(.3,1.5,.5,1)}
.pill img{width:22px;height:22px;border-radius:50%;border:1.5px solid var(--outline);background:#fff;object-fit:cover}
.pill .face{width:22px;height:22px;border-radius:50%;border:1.5px solid var(--outline);background:#fff;display:grid;place-items:center;font-size:11px}
.what{font-weight:600;opacity:.85;overflow:hidden;text-overflow:ellipsis}
.what:empty{display:none}
.what::before{content:"· "}
.typing{font-family:ui-monospace,Consolas,monospace}
.typing::after{content:"▍";animation:blink 1s steps(1) infinite}
.dots{display:inline-flex;gap:3px}.dots b{width:5px;height:5px;border-radius:50%;background:#34243f;animation:breathe 1.2s ease-in-out infinite}
.dots b:nth-child(2){animation-delay:.15s}.dots b:nth-child(3){animation-delay:.3s}
.cursor[data-state=waiting] svg{animation:bob 1.6s ease-in-out infinite}
.cursor[data-state=human] svg{opacity:.45;filter:grayscale(1)}
.cursor[data-state=human] .pill{background:var(--card);color:var(--ink);border-style:dashed;box-shadow:none}
.cursor[data-state=human] .pill img{filter:grayscale(.6)}
.cursor[data-state=done]{opacity:0;transition:opacity .4s ease .6s}
.ripple{position:absolute;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;border:3px solid var(--c);animation:ripple .5s cubic-bezier(.2,.8,.2,1) forwards}
.frame{position:absolute;border:1.5px solid color-mix(in srgb,var(--c) 55%,transparent);border-radius:12px;
transition:left .35s cubic-bezier(.2,.8,.2,1),top .35s cubic-bezier(.2,.8,.2,1),width .35s cubic-bezier(.2,.8,.2,1),height .35s cubic-bezier(.2,.8,.2,1)}
.frame i{position:absolute;width:18px;height:18px;border:0 solid var(--c)}
.frame i:nth-child(1){top:-3px;left:-3px;border-width:4px 0 0 4px;border-top-left-radius:12px}
.frame i:nth-child(2){top:-3px;right:-3px;border-width:4px 4px 0 0;border-top-right-radius:12px}
.frame i:nth-child(3){bottom:-3px;left:-3px;border-width:0 0 4px 4px;border-bottom-left-radius:12px}
.frame i:nth-child(4){bottom:-3px;right:-3px;border-width:0 4px 4px 0;border-bottom-right-radius:12px}
.frame[data-human]{border-style:dashed;border-color:var(--outline-soft)}
.frame[data-human] i{border-color:var(--ink-soft)}
.tag{position:absolute;top:-36px;left:8px;display:inline-flex;align-items:center;gap:8px;padding:4px 4px 4px 10px;border:1.5px solid var(--outline);
border-radius:999px;background:var(--card);color:var(--ink);box-shadow:0 3px 0 var(--outline);white-space:nowrap}
.tag kbd{padding:2px 6px;border:1px solid var(--outline-soft);border-radius:6px;font:700 11px/1 var(--font);color:var(--ink-soft)}
.devolver{pointer-events:auto;display:inline-flex;align-items:center;gap:6px;font:800 12px/1 var(--font);padding:6px 12px;border:1.5px solid var(--outline);border-radius:999px;background:#e8af54;color:#34243f;
box-shadow:0 2px 0 var(--outline);cursor:pointer}
.devolver:focus-visible{outline:3px solid #e8af54;outline-offset:2px}
.devolver[hidden]{display:none}
.wait{position:fixed;right:16px;bottom:16px;margin:0;padding:6px 12px;border:1.5px solid var(--outline);border-radius:999px;background:var(--card);color:var(--ink);box-shadow:0 3px 0 var(--outline)}
.wait:empty{display:none}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
@keyframes pop{from{transform:scale(.6);opacity:0}}
@keyframes blink{50%{opacity:0}}
@keyframes breathe{0%,100%{opacity:.3;transform:translateY(0)}50%{opacity:1;transform:translateY(-2px)}}
@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
@keyframes ripple{from{transform:scale(.4);opacity:.9}to{transform:scale(3.2);opacity:0}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}.frame{transition:none}.typing::after{content:""}}
</style></head><body>
<svg class="trails" aria-hidden="true"></svg>
<div id="layer"></div>
<p class="wait" id="wait"></p>
<p class="sr" id="live" aria-live="polite"></p>
<script>
'use strict'
const L = ${L}
const ARROW = '<svg viewBox="0 0 22 26" aria-hidden="true"><path d="M3 3 L3 21 L8 16.5 L11.5 24 L15 22.5 L11.6 15.2 L18.5 15 Z" fill="#fff" stroke="#34243f" stroke-width="1.6" stroke-linejoin="round"/></svg>'
const CAP = ${OVERLAY_CURSOR_CAP}
/* motion core: port of cursor-motion.ts (keep in sync) */
const bez = (p, t) => { const u = 1 - t; return { x: u*u*u*p.p0.x + 3*u*u*t*p.p1.x + 3*u*t*t*p.p2.x + t*t*t*p.p3.x, y: u*u*u*p.p0.y + 3*u*u*t*p.p1.y + 3*u*t*t*p.p2.y + t*t*t*p.p3.y } }
const minJerk = t => { const c = Math.min(1, Math.max(0, t)); return c*c*c*(10 - 15*c + 6*c*c) }
const easeOut = t => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3
function arcPath(from, to, seed) {
  const dx = to.x - from.x, dy = to.y - from.y, dist = Math.hypot(dx, dy), len = dist || 1
  const nx = -dy / len, ny = dx / len, k = Math.min(120, Math.max(10, dist * 0.18)) * (seed % 2 === 0 ? 1 : -1)
  return { p0: from, p1: { x: from.x + dx*0.28 + nx*k, y: from.y + dy*0.28 + ny*k }, p2: { x: from.x + dx*0.78 + nx*k*0.55, y: from.y + dy*0.78 + ny*k*0.55 }, p3: to, dist }
}
const moveDuration = d => Math.min(900, 220 + 160 * Math.log2(1 + Math.max(0, d) / 32))
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const fill = (tpl, name) => tpl.split('{name}').join(name)

const layer = document.getElementById('layer'), trails = document.querySelector('svg.trails')
const waitEl = document.getElementById('wait'), live = document.getElementById('live')
const cursors = new Map(), frames = new Map()
let human = false

function cursorFor(p) {
  let c = cursors.get(p.id)
  if (c) { c.persona = p; c.el.style.setProperty('--c', p.color); return c }
  const el = document.createElement('div')
  el.className = 'cursor'
  el.style.setProperty('--c', p.color)
  const face = p.avatar && p.avatar.startsWith('data:') ? '<img alt="" src="' + esc(p.avatar) + '">' : '<span class="face" aria-hidden="true">' + esc(p.name.slice(0, 1)) + '</span>'
  el.innerHTML = ARROW + '<span class="pill">' + face + '<span class="name">' + esc(p.name) + '</span><span class="what"></span></span>'
  layer.appendChild(el)
  c = { persona: p, el, what: el.querySelector('.what'), pos: { x: 40, y: 40 }, seed: 0, anim: null, state: 'idle' }
  cursors.set(p.id, c)
  place(c, c.pos)
  return c
}
function place(c, p) { c.el.style.transform = 'translate(' + (p.x - 3) + 'px,' + (p.y - 3) + 'px)' }
function setState(c, state, detail) {
  c.state = state
  c.el.dataset.state = human ? 'human' : state
  c.what.className = 'what'
  if (human) { c.what.textContent = L.humanHolds; return }
  if (state === 'waiting') { c.what.innerHTML = '<span class="dots" aria-hidden="true"><b></b><b></b><b></b></span>'; return }
  c.what.textContent = state === 'clicking' ? (detail || L.clicking) : state === 'moving' ? (detail || '') : state === 'typing' ? (detail || '') : ''
  if (state === 'typing') c.what.classList.add('typing')
}
function drawTrail(c, path) {
  if (reduced()) return
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  el.setAttribute('d', 'M' + path.p0.x + ',' + path.p0.y + ' C' + path.p1.x + ',' + path.p1.y + ' ' + path.p2.x + ',' + path.p2.y + ' ' + path.p3.x + ',' + path.p3.y)
  el.setAttribute('class', 'trail'); el.setAttribute('stroke', c.persona.color)
  trails.appendChild(el)
  const total = el.getTotalLength ? el.getTotalLength() : 0, ms = moveDuration(path.dist)
  if (el.animate) {
    el.style.strokeDasharray = total; el.style.strokeDashoffset = total
    el.animate([{ strokeDashoffset: total }, { strokeDashoffset: 0 }], { duration: ms, easing: 'cubic-bezier(.3,0,.2,1)', fill: 'forwards' })
    el.animate([{ opacity: .55 }, { opacity: 0 }], { delay: ms + 250, duration: 700, fill: 'forwards' }).onfinish = () => el.remove()
  } else setTimeout(() => el.remove(), ms + 950)
}
/* Frame loop on ACTIVE time: a human takeover freezes the cursor mid-arc; Devolver resumes from the same point. */
function run(c, duration, at) {
  if (c.anim) c.anim.cancel()
  let elapsed = 0, last = performance.now(), cancelled = false
  c.anim = { cancel() { cancelled = true } }
  const tick = now => {
    if (cancelled) return
    if (human) { last = now; requestAnimationFrame(tick); return }
    elapsed += now - last; last = now
    const t = Math.min(1, elapsed / duration)
    c.pos = at(t); place(c, c.pos)
    if (t < 1) requestAnimationFrame(tick); else c.anim = null
  }
  requestAnimationFrame(tick)
}
function move(c, target, detail) {
  setState(c, 'moving', detail)
  const from = { x: c.pos.x, y: c.pos.y }
  if (reduced()) {
    c.el.style.opacity = '0'
    setTimeout(() => { c.pos = target; place(c, target); c.el.style.opacity = '' }, 90)
    return
  }
  const raw = Math.hypot(target.x - from.x, target.y - from.y), over = raw > 360
  const ux = raw ? (target.x - from.x) / raw : 0, uy = raw ? (target.y - from.y) / raw : 0
  const aim = over ? { x: target.x + ux * 8, y: target.y + uy * 8 } : target
  const path = arcPath(from, aim, c.seed++), travel = moveDuration(path.dist), total = travel + (over ? 110 : 0)
  drawTrail(c, path)
  run(c, total, t => {
    const ms = t * total
    if (ms < travel) return bez(path, minJerk(ms / travel))
    if (!over) return target
    const e = easeOut((ms - travel) / 110)
    return { x: aim.x + (target.x - aim.x) * e, y: aim.y + (target.y - aim.y) * e }
  })
}
function click(c, detail) {
  setState(c, 'clicking', detail)
  if (!reduced()) {
    const ring = document.createElement('span')
    ring.className = 'ripple'; ring.style.setProperty('--c', c.persona.color)
    ring.style.left = c.pos.x + 'px'; ring.style.top = c.pos.y + 'px'
    layer.appendChild(ring); setTimeout(() => ring.remove(), 520)
  }
  setTimeout(() => { if (c.state === 'clicking') setState(c, 'idle') }, 160)
}
function frameFor(id, rect, label) {
  let f = frames.get(id)
  if (rect === null) { if (f) { f.remove(); frames.delete(id) } return }
  const c = cursors.get(id)
  if (!f) {
    f = document.createElement('div'); f.className = 'frame'
    f.innerHTML = '<i></i><i></i><i></i><i></i><span class="tag"><span class="tagtext"></span><kbd></kbd><button class="devolver" type="button" hidden></button></span>'
    const btn = f.querySelector('.devolver')
    /* Brush: persona-assets/icons/ui/assumir-controle.svg (inline: the overlay never loads files) */
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v8l2-2 2 3 1.5-1-2-3 2.5-.5L12 3Z"/><path d="M8 12V9.5a1.5 1.5 0 0 0-3 0v6l-1.2-1a1.4 1.4 0 0 0-2 2l3.5 3.5c.6.6 1.4 1 2.3 1H15c2.2 0 4-1.8 4-4v-2a1.5 1.5 0 0 0-3 0v1-2a1.5 1.5 0 0 0-3 0v1-1a1.5 1.5 0 0 0-3 0v1"/></g></svg><span></span>'
    btn.querySelector('span').textContent = L.giveBack
    btn.addEventListener('click', () => console.info(${JSON.stringify(OVERLAY_DEVOLVER_MESSAGE)}))
    btn.addEventListener('pointerenter', () => console.info(${JSON.stringify(OVERLAY_HOVER_PREFIX)} + '1'))
    btn.addEventListener('pointerleave', () => console.info(${JSON.stringify(OVERLAY_HOVER_PREFIX)} + '0'))
    f.querySelector('kbd').textContent = L.giveBackKey
    document.body.appendChild(f); frames.set(id, f)
  }
  if (c) f.style.setProperty('--c', c.persona.color)
  f.dataset.label = label || (c ? fill(L.controlling, c.persona.name) : '')
  f.style.left = rect.x + 'px'; f.style.top = rect.y + 'px'; f.style.width = rect.width + 'px'; f.style.height = rect.height + 'px'
  paintHuman()
}
function paintHuman() {
  for (const f of frames.values()) {
    if (human) f.setAttribute('data-human', ''); else f.removeAttribute('data-human')
    f.querySelector('.devolver').hidden = !human
    f.querySelector('kbd').hidden = human
    f.querySelector('.tagtext').textContent = human ? L.humanFrame : (f.dataset.label || '')
  }
  for (const c of cursors.values()) setState(c, c.state)
}
function applyState(cmd) {
  const visible = cmd.personas.slice(0, CAP), queued = cmd.personas.slice(CAP)
  const keep = new Set(visible.map(p => p.id))
  for (const [id, c] of cursors) if (!keep.has(id)) { c.el.remove(); cursors.delete(id); frameFor(id, null) }
  const wasHuman = human
  human = cmd.human === true
  for (const p of visible) { const c = cursorFor(p); if (p.state) setState(c, p.state === 'human' ? c.state : p.state) }
  waitEl.textContent = queued.length > 0 ? fill(L.waitsForScreen, queued[0].name) : ''
  paintHuman()
  if (human !== wasHuman) live.textContent = human ? L.humanHolds : ''
}
window.__personaOverlay = {
  dispatch(cmd) {
    if (!cmd || typeof cmd.type !== 'string') return
    if (cmd.type === 'cu:state') return applyState(cmd)
    const c = cursors.get(cmd.id)
    if (cmd.type === 'cu:frame') return frameFor(cmd.id, cmd.rect, cmd.label)
    if (!c) return
    if (cmd.type === 'cu:move') return move(c, { x: Number(cmd.x) || 0, y: Number(cmd.y) || 0 }, cmd.detail)
    if (cmd.type === 'cu:click') return click(c, cmd.detail)
    if (cmd.type === 'cu:type') {
      const shown = cmd.secret === true ? '•'.repeat(Math.min(8, Math.max(4, String(cmd.text).length))) : String(cmd.text).slice(-22)
      return setState(c, 'typing', shown)
    }
  },
  /** Test/inspection hook: current cursor positions. */
  snapshot() { return [...cursors.values()].map(c => ({ id: c.persona.id, x: c.pos.x, y: c.pos.y, state: c.el.dataset.state, label: c.what.textContent })) },
}
</script>
</body></html>`
}
