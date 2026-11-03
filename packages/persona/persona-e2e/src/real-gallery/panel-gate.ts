import type { Page } from 'playwright'
import type { GalleryOwner } from './panels.ts'
import { onboarding } from '../real-app-locale.pt.ts'

export const STUCK_LOADING_MS = 5_000
export const REMOTE_STORM_WINDOW_MS = 3_000
export const REMOTE_STORM_MAX_FRAMES = 10

/** Keel: console patterns that must fail the panel gate when present. */
export const PANEL_CONSOLE_FATAL_RE = /ERR_INSUFFICIENT_RESOURCES|Maximum update depth|#185/i

export interface PanelConsoleTripwire {
  errors: string[]
  attach(page: Page): void
  detach(page: Page): void
  fatalCount(): number
  fatals(): string[]
}

export interface StuckLoadingResult {
  readonly stuck: boolean
  readonly detail: string
}

export interface RemoteStormResult {
  readonly frameCount: number
  readonly overLimit: boolean
  readonly detail: string
}

export interface OnboardingOverlayViolation {
  readonly violated: boolean
  readonly detail: string
}

/**
 * Per-panel console collector (call {@link attach} before navigation).
 */
export function createPanelConsoleTripwire(): PanelConsoleTripwire {
  const errors: string[] = []
  const onConsole = (message: { type(): string; text(): string }): void => {
    if (message.type() === 'error') errors.push(message.text())
  }
  return {
    errors,
    attach(page) {
      page.on('console', onConsole)
    },
    detach(page) {
      page.off('console', onConsole)
    },
    fatalCount() {
      return errors.filter(line => PANEL_CONSOLE_FATAL_RE.test(line)).length
    },
    fatals() {
      return errors.filter(line => PANEL_CONSOLE_FATAL_RE.test(line)).slice(0, 8)
    },
  }
}

/**
 * Main column still shows loading copy or skeleton after {@link STUCK_LOADING_MS}.
 */
export async function measureStuckLoading(page: Page): Promise<StuckLoadingResult> {
  const deadline = Date.now() + STUCK_LOADING_MS
  while (Date.now() < deadline) {
    const snapshot = await readMainLoadingSignals(page)
    if (!snapshot.loading) {
      return { stuck: false, detail: `cleared before ${String(STUCK_LOADING_MS)}ms` }
    }
    await page.waitForTimeout(250)
  }
  const final = await readMainLoadingSignals(page)
  if (!final.loading) {
    return { stuck: false, detail: `cleared at ${String(STUCK_LOADING_MS)}ms` }
  }
  return {
    stuck: true,
    detail: `loading after ${String(STUCK_LOADING_MS)}ms (${final.reason}) snippet="${final.snippet}"`,
  }
}

async function readMainLoadingSignals(page: Page): Promise<{ loading: boolean; reason: string; snippet: string }> {
  return page.evaluate(() => {
    const shell = document.querySelector('[data-persona-shell]')
    const main = shell?.children[1]
    if (!(main instanceof HTMLElement)) {
      return { loading: true, reason: 'missing main column', snippet: '' }
    }
    const text = (main.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (/Carregando/i.test(text)) {
      return { loading: true, reason: 'Carregando copy', snippet: text.slice(0, 100) }
    }
    const busy = main.querySelector('[aria-busy="true"]')
    if (busy instanceof HTMLElement) {
      return { loading: true, reason: 'aria-busy', snippet: text.slice(0, 100) }
    }
    const skeleton = main.querySelector('[class*="skeleton"], [class*="Skeleton"]')
    if (skeleton instanceof HTMLElement) {
      const rect = skeleton.getBoundingClientRect()
      if (rect.width > 8 && rect.height > 8) {
        return { loading: true, reason: 'skeleton visible', snippet: text.slice(0, 100) }
      }
    }
    return { loading: false, reason: 'ready', snippet: text.slice(0, 80) }
  })
}

/**
 * Count WebSocket frames while the panel is idle (Remote storm detector).
 */
export async function measureRemoteStorm(page: Page): Promise<RemoteStormResult> {
  let frameCount = 0
  const sockets = new Set<import('playwright').WebSocket>()
  const onSocket = (ws: import('playwright').WebSocket): void => {
    sockets.add(ws)
    ws.on('framereceived', () => { frameCount += 1 })
    ws.on('framesent', () => { frameCount += 1 })
  }
  page.on('websocket', onSocket)
  await page.waitForTimeout(REMOTE_STORM_WINDOW_MS)
  page.off('websocket', onSocket)
  const overLimit = frameCount > REMOTE_STORM_MAX_FRAMES
  return {
    frameCount,
    overLimit,
    detail: `${String(frameCount)} ws frames in ${String(REMOTE_STORM_WINDOW_MS)}ms (limit ${String(REMOTE_STORM_MAX_FRAMES)})`,
  }
}

const ONBOARDING_COMPLETE_KEY = 'persona.onboarding.complete.v1'

/**
 * Prism: overlay must not show when local cache marks onboarding complete.
 */
export async function measureOnboardingOverlayViolation(page: Page): Promise<OnboardingOverlayViolation> {
  const state = await page.evaluate(({ key, step1Title }: { key: string; step1Title: string }) => {
    let cacheComplete = false
    try {
      cacheComplete = localStorage.getItem(key) === '1'
    } catch {
      cacheComplete = false
    }
    const headings = Array.from(document.querySelectorAll('h1, h2, h3')).map(el => (el.textContent ?? '').trim())
    const overlayStep1 = headings.some(h => h.includes(step1Title))
    const scrim = document.querySelector('[role="presentation"][class*="scrim"]') !== null
    return { cacheComplete, overlayStep1, scrim }
  }, { key: ONBOARDING_COMPLETE_KEY, step1Title: onboarding.step1Title })

  if (!state.cacheComplete) {
    return { violated: false, detail: 'cache not complete (skip)' }
  }
  if (state.overlayStep1 || state.scrim) {
    return {
      violated: true,
      detail: `onboarding overlay/scrim with ${ONBOARDING_COMPLETE_KEY}=1 (step1=${String(state.overlayStep1)} scrim=${String(state.scrim)})`,
    }
  }
  return { violated: false, detail: 'no overlay with cache complete' }
}

export interface PanelGateFailure {
  readonly kind: 'blank' | 'stuck-loading' | 'console-fatal' | 'remote-storm' | 'onboarding-overlay'
  readonly message: string
}

/**
 * Build vitest assertion message with owner tag.
 */
export function formatPanelGateTitle(owner: GalleryOwner, slug: string, kind: PanelGateFailure['kind']): string {
  return `[${owner}] ${slug}: ${kind}`
}
