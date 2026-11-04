/** Windows system tray: the always-present way back to a hidden window and the explicit quit entry. */

import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { Menu, nativeImage, Tray } from 'electron'
import type { DesktopLocale } from './locale.ts'

/** Live team counts that pick the Brush tray glyph. */
export interface TrayPresence {
  readonly working: number
  readonly needsYou: number
  readonly paused: boolean
}

/** Four Brush tray states from DESKTOP-CHROME.md. */
export type TrayKind = 'idle' | 'working' | 'needs-you' | 'paused'

/**
 * Pick the tray glyph. Needs-you wins over working.
 * @param presence - Live counts.
 */
export function trayKindOf(presence: TrayPresence): TrayKind {
  if (presence.paused) return 'paused'
  if (presence.needsYou > 0) return 'needs-you'
  if (presence.working > 0) return 'working'
  return 'idle'
}

/** Main-process actions the tray triggers; both run the same paths as the window and application menu. */
export interface DesktopTrayOptions {
  /** Multi-size ICO rendered by `scripts/render-tray-icon.ts`; Windows picks the bitmap for the display scale. */
  readonly iconPath: string
  /** Folder that holds `tray-{idle,working,needs-you,paused}-32.png`. Defaults to the ICO directory. */
  readonly iconDir?: string
  readonly locale: () => DesktopLocale
  /** Show and focus the primary window. */
  readonly open: () => void
  /** Pause scheduled team work (host `pauseTeam`). Optional so older call sites still typecheck. */
  readonly pause?: () => void
  readonly resume?: () => void
  readonly openNeedsYou?: () => void
  readonly openLogs?: () => void
  readonly copyDiagnostic?: () => void
  /** Quit for good through the same confirmation as every other quit entry. */
  readonly quit: () => void
}

function formatCount(template: string, count: number): string {
  return template.replaceAll('{count}', String(count))
}

/** Tray icon present for the whole run, not only while the window is hidden. */
export class DesktopTray {
  private tray: Tray | undefined
  private presence: TrayPresence = { working: 0, needsYou: 0, paused: false }

  /** @param options - Icon path, locale reader, and the open and quit actions. */
  constructor(private readonly options: DesktopTrayOptions) {
    const tray = new Tray(nativeImage.createFromPath(this.iconFor(trayKindOf(this.presence))))
    this.tray = tray
    tray.on('click', () => { options.open() })
    this.relabel()
  }

  /**
   * Update glyph, tooltip and menu from live team counts.
   * @param presence - Working / needs-you / paused.
   */
  setPresence(presence: TrayPresence): void {
    this.presence = presence
    const tray = this.tray
    if (tray === undefined) return
    tray.setImage(nativeImage.createFromPath(this.iconFor(trayKindOf(presence))))
    this.relabel()
  }

  /** Rebuild the tooltip and context menu in the current locale. */
  relabel(): void {
    const tray = this.tray
    if (tray === undefined) return
    const { messages } = this.options.locale()
    const kind = trayKindOf(this.presence)
    const tooltip = kind === 'working'
      ? formatCount(messages.trayTooltipWorking, this.presence.working)
      : kind === 'needs-you'
        ? formatCount(messages.trayTooltipNeedsYou, this.presence.needsYou)
        : kind === 'paused' ? messages.trayTooltipPaused : messages.trayTooltipIdle
    const status = kind === 'working'
      ? formatCount(messages.trayStatusWorking, this.presence.working)
      : kind === 'needs-you'
        ? [
          formatCount(messages.trayStatusWorking, this.presence.working),
          formatCount(messages.trayStatusNeedsYou, this.presence.needsYou),
        ].filter(part => !part.startsWith('0 ')).join(' · ')
        : kind === 'paused' ? messages.trayStatusPaused : messages.trayStatusIdle
    tray.setToolTip(tooltip)
    const items = [
      { label: status === '' ? messages.trayStatusIdle : status, enabled: false },
      { label: messages.openApplication, click: () => { this.options.open() } },
      ...(kind === 'needs-you'
        ? [{ label: messages.trayOpenNeedsYou, click: () => { this.options.openNeedsYou?.() ?? this.options.open() } }]
        : []),
      { type: 'separator' as const },
      {
        label: this.presence.paused ? messages.trayResumeTeam : messages.trayPauseTeam,
        click: () => {
          if (this.presence.paused) this.options.resume?.()
          else this.options.pause?.()
        },
      },
      { label: messages.openLogsFolder, click: () => { this.options.openLogs?.() } },
      { label: messages.copyDiagnostic, click: () => { this.options.copyDiagnostic?.() } },
      { type: 'separator' as const },
      { label: messages.trayQuitForGood, click: () => { this.options.quit() } },
    ]
    tray.setContextMenu(Menu.buildFromTemplate(items))
  }

  /** Remove the icon; called once the quit is confirmed so no dead icon outlives the process. */
  dispose(): void {
    const tray = this.tray
    this.tray = undefined
    tray?.destroy()
  }

  private iconFor(kind: TrayKind): string {
    const dir = this.options.iconDir ?? dirname(this.options.iconPath)
    const named = join(dir, `tray-${kind}-32.png`)
    return existsSync(named) ? named : this.options.iconPath
  }
}
