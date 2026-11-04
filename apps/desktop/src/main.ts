/** Electron shell: desktop project ownership, custom protocol, windows, and lifecycle. */

import { installFileActions } from './file-actions.ts'
import { configurationFailure, channelSaveFailure, configurationMessage } from './update-configuration.ts'
import type { DesktopChannelState, DesktopChannelChangeResult } from '@deepseek-ai/dsh-client-ui-settings-general/types'
import { DesktopUpdateSettings } from './update-settings.ts'
import { isDesktopUpdateChannel } from './settings-file.ts'
import type { ProductEventMap, ProductEvent } from '@deepseek-ai/dsh-client-product-analytics/types'
import {
  WINDOWS_TITLEBAR_COLOR_DARK,
  WINDOWS_TITLEBAR_COLOR_LIGHT,
  WINDOWS_TITLEBAR_HEIGHT,
  WINDOWS_TITLEBAR_SYMBOL_DARK,
  WINDOWS_TITLEBAR_SYMBOL_LIGHT,
} from './windows-layout.ts'
import { access, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { attachBootUi, BOOT_UI_PATH } from './boot-ui.ts'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  app,
  BrowserWindow,
  clipboard,
  desktopCapturer,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  Notification,
  powerMonitor,
  powerSaveBlocker,
  nativeImage,
  nativeTheme,
  protocol,
  screen,
  session,
  shell,
  type IpcMainInvokeEvent,
  type Input,
  type MenuItemConstructorOptions,
} from 'electron'
import { resolveDesktopPaths } from './paths.ts'
import { DesktopProjectManager } from './project-manager.ts'
import { DesktopHostFatalError, DesktopHostProcess, DesktopHostUncleanExitError } from './host-process.ts'
import { DesktopPlatformView, PLATFORM_IPC, platformBounds } from './platform-view.ts'
import { installDesktopFileDrag } from './file-drag.ts'
import { installDesktopDirectoryPicker } from './directory-picker.ts'
import { installPersonaAboutShellIpc } from './persona-about-shell.ts'
import { installTeachCapture } from './teach-ipc.ts'
import { createComputerUseComHost, installComputerUseBind } from './computer-use-bind.ts'
import { interpretOverlayConsole } from './computer-use-cursor-renderer.ts'
import { overlayBrowserWindowOptions, overlayMouseIgnore } from './computer-use-overlay.ts'
import { desktopComputerUseActions } from './computer-use-ports.ts'
import { spawnSync } from 'node:child_process'
import { installMicrophonePermissions } from './microphone-permissions.ts'
import { DesktopBackendController } from './backend-controller.ts'
import { DESKTOP_IPC, SCHEME, assertDesktopSender, type DesktopUpdateState } from './ipc.ts'
import { readDeviceInfo } from './device-info.ts'
import { desktopUpdateReadyConfirmation, formatDesktopMessage, resolveDesktopLocale, resolveDesktopStartupLocale } from './locale.ts'
import { claimDesktopSingleInstance } from './single-instance.ts'
import { desktopUpdateChannel } from './update-channel.ts'
import { DesktopUpdateCoordinator } from './update-coordinator.ts'
import { prepareDesktopUpdateWindow } from './update-window.ts'
import { DesktopCommandManager } from './command-management.ts'
import { serveWebDocument, authenticateWebHost, forwardWebRequest, removeLegacyHostCookies } from './web-document.ts'
import {
  applyRewrittenBootInjections,
  createPersonaBootScriptStore,
  servePersonaBootScript,
} from './rewrite-boot-injections.ts'
import { DesktopFatalRecovery } from './fatal-recovery.ts'
import { pruneCrashReports, RendererConsoleTail, writeCrashReport, type CrashReportSource } from './crash-report.ts'
import { OperationJournal } from './operation-journal.ts'
import { runOperationReportJob, type OperationReportJobResult } from './operation-report-job.ts'
import { openWelcomeWindow } from './welcome-window.ts'
import { WELCOME_IPC, needsWelcome, type WelcomeNotice } from './welcome-api.ts'
import { connectDesktopWelcome, type DesktopWelcomeBackend } from './welcome-backend.ts'
import { DesktopUpdateJournal } from './update-journal.ts'
import { DesktopUpdatePreparationError } from './update-error.ts'
import { DesktopUpdateSchedule, resolveDesktopUpdateScheduleConfig } from './update-schedule.ts'
import { desktopUpdateErrorSummary, presentDesktopUpdate } from './update-presentation.ts'
import { desktopErrorState } from './startup-error.ts'
import { readDesktopLoginShellEnvironment, resolveDesktopLoginShellConfig, withPersonaE2ePath } from './login-shell-environment.ts'
import { DesktopMandatoryUpdatePolicy, resolveDesktopPolicyConfig, type DesktopPolicyState } from './mandatory-update-policy.ts'
import { desktopClientMetadata, desktopClientVersion } from './client-metadata.ts'
import { DesktopMandatoryUpdateWindow } from './mandatory-update-window.ts'
import { DesktopPolicyTestAuth } from './policy-test-auth.ts'
import { readDesktopSettings } from './settings.ts'
import { readDesktopLocaleCache, writeDesktopLocaleCache } from './locale-cache.ts'
import { DesktopUpdateDialog, type UpdateDialogOptions } from './update-dialog.ts'
import { readDesktopRuntime } from './runtime-tree.ts'
import { DesktopBrowserGuests } from './browser-guests.ts'
import { installDesktopShortcuts } from './keyboard.ts'
import { DesktopUpdateOverlays } from './update-overlay.ts'
import { DesktopQuitConfirmation } from './quit-confirmation.ts'
import { DesktopTray } from './tray.ts'
import { DesktopBackgroundNotice } from './background-notice.ts'
import { applyPersonaDesktopIdentity, PERSONA_PRODUCT_NAME, PERSONA_PROTOCOL, resolvePersonaProcessHome, personaUpdatesEnabled, shouldShowDeepSeekWelcome } from './product.ts'
import { applyChromiumResourceBudget } from './resource-budget.ts'
import { skipUpdaterAtBoot, skipWelcomeAtBoot } from './cold-start.ts'
import { DesktopLoginItem } from './login-item.ts'
import { readPersonaShellPrefs, writePersonaShellPrefs } from './shell-prefs.ts'
import { DesktopNotifications, policyFromAutonomy } from './notifications.ts'
import { allowShellNavigation, hardenSession, isExternalHttpUrl, secureWebPreferences, windowOpenAction } from './secure-shell.ts'
import { copyPersonaDiagnostic, createPersonaLogger, personaLogsDir } from './persona-log.ts'
import { reconnectingPageUrl } from './reconnecting-page.ts'
import { ALWAYS_ON_IPC, isAlwaysOnAttention, runningAssignmentCount } from './always-on-ipc.ts'
import { DesktopPower } from './power.ts'
import { backupPersonaHome, restorePersonaBackup } from './backup.ts'
import { parsePersonaDeepLink } from './deep-link.ts'
import { HOST_RECONNECT_BACKOFF_MS } from './backend-controller.ts'
import { isDeepSeekHost } from './deepseek-hosts.ts'
import { aboutLegalText, formatDesktopLegalNotices } from './legal-notices.ts'

applyPersonaDesktopIdentity()
applyChromiumResourceBudget(app.commandLine)

let focusPrimaryWindow = (): void => {}
let stopForRecovery = async (): Promise<void> => { await stopOperationReports() }
let shuttingDown = false
/**
 * Set by quit entries that must not ask: crash recovery exit and restart, and the
 * development restart command. The installer handoff has its own before-quit branch.
 */
let skipQuitConfirmation = false
let windowsLanguage: string | undefined = readDesktopLocaleCache(app.getPath('userData'))
/**
 * Whether the backend has reached ready: false until the first ready, back to
 * false when a restart returns it to starting, frozen during shutdown so a
 * failure while tearing down a ready backend still reads as `running`.
 */
let backendReady = false
/** Error-level console output of the primary window, attached to crash reports. */
const rendererConsole = new RendererConsoleTail()

// Platform-conventional logs directory (macOS ~/Library/Logs/<name>, otherwise under userData);
// set before ready so the first fatal report already resolves under it.
app.setAppLogsPath()

function currentDesktopLocale(): ReturnType<typeof resolveDesktopLocale> {
  return resolveDesktopLocale(windowsLanguage ?? app.getLocale())
}
/** Quit without the task confirmation; the caller has already decided the application must stop. */
function quitWithoutConfirmation(): void {
  skipQuitConfirmation = true
  app.quit()
}
const recovery = new DesktopFatalRecovery({
  messages: () => currentDesktopLocale().messages,
  show: options => dialog.showMessageBox(options),
  stop: () => { shuttingDown = true; return stopForRecovery() },
  disablePlugins: async () => {
    const manager = new DesktopProjectManager(resolveDesktopPaths(), runtimeResources())
    const backupPath = await manager.disableAllPlugins()
    console.info('Desktop profile recovery completed:', { profilePatchBackup: backupPath ?? null, homePatch: 'unchanged' })
  },
  exit: () => { quitWithoutConfirmation() },
  restart: () => { app.relaunch(); quitWithoutConfirmation() },
  writeReport: (error, source) => persistCrashReport(error, source),
  revealReport: async (path) => { await access(path); shell.showItemInFolder(path) },
})

let operationJournal: OperationJournal | undefined
let operationReportJob: Promise<OperationReportJobResult> | undefined
let operationReportAbort: AbortController | undefined
let operationReportsStopping = false
let operationReportStop: Promise<void> | undefined

/** Bound application shutdown waiting without claiming that an unresponsive Worker has exited. */
function stopOperationReports(): Promise<void> {
  operationReportStop ??= waitForOperationReports()
  return operationReportStop
}

async function waitForOperationReports(): Promise<void> {
  operationReportsStopping = true
  operationReportAbort?.abort()
  const job = operationReportJob
  if (job === undefined) return
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const exited = await Promise.race([job.then(() => true), new Promise<false>((resolve) => {
      timer = setTimeout(() => { resolve(false) }, 500)
    })])
    if (!exited) console.error('dsh desktop: operation report Worker has not exited; continuing shutdown')
  } finally { clearTimeout(timer) }
}

function persistCrashReport(error: unknown, source: CrashReportSource): Promise<string | undefined> {
  const directory = app.getPath('logs')
  const report = writeCrashReport(directory, {
    operationHistoryPlanned: !shuttingDown && !operationReportsStopping,
    source,
    phase: backendReady ? 'running' : 'startup',
    error,
    ...(error instanceof DesktopHostFatalError && error.diagnostic !== undefined ? { hostDiagnostic: error.diagnostic } : {}),
    rendererConsole: rendererConsole.snapshot(),
    app: {
      name: app.name, version: app.getVersion(), platform: process.platform, arch: process.arch,
      electron: process.versions.electron, node: process.versions.node, locale: currentDesktopLocale().id,
    },
    time: new Date(),
  })
  void report.then((path) => {
    if (path !== undefined && operationReportJob === undefined && !shuttingDown && !operationReportsStopping) {
      operationReportAbort = new AbortController()
      operationReportJob = runOperationReportJob({ reportPath: path, directory: join(app.getPath('userData'), 'plugin-operations'),
        limits: { bytes: 64 * 1024, recordBytes: 4096, records: 100, outputBytes: 64 * 1024 },
        journal: operationJournal?.status() ?? null,
      }, { timeoutMs: 500, cancellationGraceMs: 100 }, operationReportAbort.signal)
      void operationReportJob.finally(() => { operationReportJob = undefined; operationReportAbort = undefined })
    }
  }).catch((_error: unknown) => { /* Basic persistence failure is owned by fatal recovery. */ })
  return report
}

function reportFatal(error: unknown, source: CrashReportSource): void {
  console.error(error)
  if (shuttingDown) {
    // No dialog during shutdown, but the report still records what failed on the way out.
    void persistCrashReport(error, source)
    return
  }
  void recovery.report(error, source).catch(async (failure: unknown) => {
    console.error(failure)
    shuttingDown = true
    await stopOperationReports()
    app.exit(1)
  })
}

protocol.registerSchemesAsPrivileged([{
  scheme: SCHEME,
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
    stream: true,
    codeCache: true,
  },
}])

interface RuntimeResources {
  readonly nodeBin: string
  readonly node: string
  readonly pnpm: string
  readonly dsh: string
}

function runtimeResources(): RuntimeResources {
  const development = !app.isPackaged
  const node = process.execPath
  const nodeBin = development ? join(app.getAppPath(), 'scripts', 'node-bin') : join(process.resourcesPath, 'runtime', 'bin')
  const pnpm = (development ? process.env.DSH_DESKTOP_PNPM_ENTRY : undefined)
    ?? (development ? join(app.getAppPath(), 'node_modules', 'pnpm', 'bin', 'pnpm.mjs')
      : join(process.resourcesPath, 'runtime', 'primary-runtime', 'dependencies', 'pnpm', 'bin', 'pnpm.mjs'))
  const dsh = (development ? process.env.DSH_DESKTOP_DSH_DIR : undefined)
    ?? (development ? join(app.getAppPath(), '.desktop-build', 'development', 'project') : join(app.getAppPath(), 'dsh'))
  return { node, nodeBin, pnpm, dsh }
}

function developmentPrimaryRuntime(): string {
  const directory = process.env.DSH_DESKTOP_PRIMARY_RUNTIME_DIR
  if (directory === undefined || directory === '') {
    throw new Error('dsh desktop: DSH_DESKTOP_PRIMARY_RUNTIME_DIR is required for an unpackaged launch')
  }
  return directory
}

function developmentHostInspectPort(enabled: boolean): number | undefined {
  const configured = process.env.DSH_DESKTOP_HOST_INSPECT_PORT
  if (!enabled || configured === undefined || configured === '') return undefined
  const port = Number(configured)
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error('dsh desktop: DSH_DESKTOP_HOST_INSPECT_PORT must be an integer from 1 through 65535')
  }
  return port
}

/**
 * Opaque chrome fallback matching Muse paper (DESKTOP-CHROME.md). Windows
 * swaps in the renderer's measured palette over the windowsAppearance IPC;
 * macOS shows it only while minimized or hidden.
 * @returns the paper fill hex for the active system color scheme.
 */
function chromeFallbackFill(): string {
  return nativeTheme.shouldUseDarkColors ? WINDOWS_TITLEBAR_COLOR_DARK : WINDOWS_TITLEBAR_COLOR_LIGHT
}

/**
 * Caption-button tint matching Muse ink on the paper overlay.
 * @returns the symbol hex for the active system color scheme.
 */
function chromeFallbackSymbol(): string {
  return nativeTheme.shouldUseDarkColors ? WINDOWS_TITLEBAR_SYMBOL_DARK : WINDOWS_TITLEBAR_SYMBOL_LIGHT
}

/**
 * Add the effective Desktop palette to a Platform authorization URL so the
 * login page opens in the application's theme. `system` resolves through
 * `nativeTheme.shouldUseDarkColors`, which follows the theme source the
 * application preload publishes.
 * @param authorizeUrl - validated Platform authorization URL.
 * @returns the authorization URL carrying `theme=light` or `theme=dark`.
 */
function platformLoginUrl(authorizeUrl: string): string {
  const url = new URL(authorizeUrl)
  url.searchParams.set('theme', nativeTheme.shouldUseDarkColors ? 'dark' : 'light')
  return url.href
}

/**
 * Keep the native and document titles on Persona even if the bundled web
 * client still ships a DeepSeek / local-build document title.
 */
function pinPersonaWindowTitle(window: BrowserWindow): void {
  const apply = (): void => {
    if (window.isDestroyed()) return
    window.setTitle(PERSONA_PRODUCT_NAME)
  }
  apply()
  window.on('page-title-updated', (event) => {
    event.preventDefault()
    apply()
  })
  window.webContents.on('did-finish-load', () => {
    apply()
  })
}

function createWindow(preload: string, show = false, primary = false): BrowserWindow {
  const window = new BrowserWindow({
    title: PERSONA_PRODUCT_NAME,
    width: 1280,
    height: 820,
    minWidth: 520,
    minHeight: 600,
    show,
    ...(process.platform === 'win32' && primary ? {
      titleBarStyle: 'hidden' as const,
      titleBarOverlay: {
        height: WINDOWS_TITLEBAR_HEIGHT,
        color: chromeFallbackFill(),
        symbolColor: chromeFallbackSymbol(),
      },
    } : {}),
    // hiddenInset places traffic lights inside the sidebar; sidebar vibrancy
    // needs a transparent window background to show through the page.
    backgroundColor: process.platform === 'darwin' ? '#00000000' : chromeFallbackFill(),
    ...(process.platform === 'darwin' ? {
      titleBarStyle: 'hiddenInset' as const,
      trafficLightPosition: { x: 16, y: 18 },
      vibrancy: 'sidebar' as const,
      // 'active' keeps the vibrancy material stable when the window blurs;
      // 'followWindow' washes the sidebar out behind an unfocused window.
      visualEffectState: 'active' as const,
    } : {}),
    webPreferences: { ...secureWebPreferences(preload), devTools: true },
  })
  pinPersonaWindowTitle(window)
  window.webContents.setWindowOpenHandler((details) => {
    if (isExternalHttpUrl(details.url)) {
      void dialog.showMessageBox(window, {
        type: 'question',
        message: currentDesktopLocale().messages.openExternalConfirm,
        detail: details.url,
        buttons: [currentDesktopLocale().messages.cancel, currentDesktopLocale().messages.openInBrowser],
        defaultId: 0,
        cancelId: 0,
      }).then((choice) => {
        if (choice.response === 1) void shell.openExternal(details.url)
      }).catch((error: unknown) => { console.error(error) })
    }
    return windowOpenAction(details)
  })
  if (process.platform === 'darwin' || process.platform === 'win32') {
    // Fullscreen hides native window controls; overlays drop their caption clearance.
    const sendFullscreen = (): void => {
      if (!window.isDestroyed()) window.webContents.send(DESKTOP_IPC.windowFullscreen, window.isFullScreen())
    }
    window.on('enter-full-screen', sendFullscreen)
    window.on('leave-full-screen', sendFullscreen)
    // Reloads and navigations re-register the preload listener; resend the
    // current state so a fullscreen reload does not fall back to windowed CSS.
    window.webContents.on('did-finish-load', sendFullscreen)
  }
  if (process.platform === 'win32' && primary) {
    const applyOverlay = (): void => {
      if (window.isDestroyed()) return
      window.setTitleBarOverlay({
        height: WINDOWS_TITLEBAR_HEIGHT,
        color: chromeFallbackFill(),
        symbolColor: chromeFallbackSymbol(),
      })
    }
    nativeTheme.on('updated', applyOverlay)
  }
  if (process.platform === 'darwin') {
    // Deminiaturize reattaches the NSVisualEffectView material late
    // (electron/electron#25368), so a transparent window shows the desktop
    // through the sidebar until then. Paint an opaque base while minimized or
    // hidden so the deminiaturize animation and the reattachment gap show a
    // solid fill; restoring flips back, and the null -> 'sidebar' transition
    // forces the material to reattach.
    const applyBackdrop = (): void => {
      if (window.isDestroyed()) return
      if (window.isMinimized() || !window.isVisible()) {
        window.setVibrancy(null)
        window.setBackgroundColor(chromeFallbackFill())
      } else {
        window.setVibrancy('sidebar')
        window.setBackgroundColor('#00000000')
      }
    }
    window.on('minimize', applyBackdrop)
    window.on('hide', applyBackdrop)
    window.on('restore', applyBackdrop)
    window.on('show', applyBackdrop)
  }
  window.webContents.on('context-menu', (_event, { isEditable, selectionText, editFlags }) => {
    const items: MenuItemConstructorOptions[] = []
    if (isEditable) {
      items.push(
        { role: 'undo', enabled: editFlags.canUndo },
        { role: 'redo', enabled: editFlags.canRedo },
        { type: 'separator' },
        { role: 'cut', enabled: editFlags.canCut },
        { role: 'copy', enabled: editFlags.canCopy },
        { role: 'paste', enabled: editFlags.canPaste },
        { type: 'separator' },
        { role: 'selectAll', enabled: editFlags.canSelectAll },
      )
    } else if (selectionText.length > 0) {
      items.push({ role: 'copy', enabled: editFlags.canCopy })
    }
    // Empty accelerators suppress Electron's default shortcut labels for native roles.
    if (items.length > 0) {
      const messages = currentDesktopLocale().messages
      Menu.buildFromTemplate(items.map(item => ({
        ...item,
        ...(process.platform === 'win32' && item.role !== undefined && item.role in messages
          ? { label: messages[item.role as keyof typeof messages] } : {}),
        accelerator: '',
      }))).popup({ window })
    }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (allowShellNavigation(url)) return
    event.preventDefault()
    if (isExternalHttpUrl(url)) {
      void dialog.showMessageBox(window, {
        type: 'question',
        message: currentDesktopLocale().messages.openExternalConfirm,
        detail: url,
        buttons: [currentDesktopLocale().messages.cancel, currentDesktopLocale().messages.openInBrowser],
        defaultId: 0,
        cancelId: 0,
      }).then((choice) => {
        if (choice.response === 1) void shell.openExternal(url)
      }).catch((error: unknown) => { console.error(error) })
    }
  })
  return window
}

async function main(): Promise<void> {
  const desktopSettings = await readDesktopSettings(app.getPath('userData'))
  void pruneCrashReports(app.getPath('logs'))
  const personaLogger = createPersonaLogger(resolvePersonaProcessHome())
  void personaLogger.rotate().catch((error: unknown) => { console.error(error) })
  void personaLogger.write('main', `desktop start v${app.getVersion()}`).catch((error: unknown) => { console.error(error) })
  const journalDirectory = process.env.DSH_DESKTOP_UPDATE_JOURNAL_DIR
  const updateJournal = journalDirectory === undefined ? undefined : new DesktopUpdateJournal(journalDirectory, app.getVersion())
  const resources = runtimeResources()
  const paths = resolveDesktopPaths()
  const development = !app.isPackaged
  const primaryRuntime = development
    ? developmentPrimaryRuntime()
    : join(process.resourcesPath, 'runtime', 'primary-runtime')
  const activeProject = paths.profile
  const manager = new DesktopProjectManager(paths, resources)
  // Dock and Finder launches inherit only launchd's environment; every Host shares one login-shell read.
  const loginShellRead = new AbortController()
  // The probe runs in its own process group, which outlives Desktop unless the read is aborted.
  app.on('will-quit', () => { loginShellRead.abort() })
  const loginShell = readDesktopLoginShellEnvironment(process.env, resolveDesktopLoginShellConfig(process.env), {
    signal: loginShellRead.signal,
  }).then((result) => {
    for (const failure of result.failures) console.warn(`desktop login shell: ${failure.shell} failed (${failure.reason})`)
    return result.environment
  })
  let hostEnvironment: NodeJS.ProcessEnv = process.env
  const prepareHostEnvironment = async (): Promise<void> => {
    hostEnvironment = withPersonaE2ePath(await loginShell, process.env.PERSONA_E2E_EXTRA_PATH)
  }
  let quitting = false
  let startup: Promise<void> | undefined
  let workspaceRecovery: Promise<void> | undefined
  let mainWindow: BrowserWindow | undefined
  let bootFailure: { code: string; message: string } | undefined
  const showBootFailure = (error: unknown): void => {
    bootFailure = { code: 'boot_failed', message: (error instanceof Error ? error.message : String(error)).split('\n')[0] ?? '' }
    mainWindow?.webContents.send(DESKTOP_IPC.bootState, bootFailure)
    console.error(error)
    void persistCrashReport(error, 'host')
  }
  let welcomeWindow: BrowserWindow | undefined
  const installFileDrag = (): (() => Promise<void>) => installDesktopFileDrag(
    event => assertProductSender(event),
    (address, signal) => {
      const host = backend.host
      if (host === undefined) return Promise.reject(new Error('File drag Host unavailable'))
      return host.resolveDragResource(address, signal)
    },
  )
  const fileDragCleanups = new Set([installFileDrag()])
  let fileDragStopped = false
  const disposeFileDrag = async (): Promise<void> => {
    fileDragStopped = true
    const results = await Promise.allSettled([...fileDragCleanups].map(async (release) => {
      await release()
      fileDragCleanups.delete(release)
    }))
    const failure = results.find(result => result.status === 'rejected')
    if (failure?.status === 'rejected') throw failure.reason
  }
  let enteredWorkspace = false
  // NSIS passes --updated when it launches the application after installation.
  let raiseAfterUpdate = process.platform === 'win32' && process.argv.includes('--updated')
  let shellInstallerOwnsQuit = false
  let requireCleanStop = false
  let updateStoppedHost = false
  let updateStopFailure: DesktopHostUncleanExitError | undefined
  let updateState: DesktopUpdateState = { phase: 'idle' }
  let channelState: DesktopChannelState | undefined
  const updatePresentation = (state: DesktopUpdateState) => ({ ...presentDesktopUpdate(state),
    ...(channelState?.error === undefined ? {} : { configurationError: channelState.error }) })
  const systemLanguages = app.getPreferredSystemLanguages()
  let locale = windowsLanguage === undefined
    ? resolveDesktopStartupLocale(null, systemLanguages) : resolveDesktopLocale(windowsLanguage)
  windowsLanguage = locale.id
  let mandatoryPolicy: DesktopMandatoryUpdatePolicy | undefined
  let mandatoryUI: DesktopMandatoryUpdateWindow | undefined
  let policyAuth: DesktopPolicyTestAuth | undefined
  let tray: DesktopTray | undefined
  let trayWorking = 0
  let trayNeedsYou = 0
  /**
   * The operating system is ending the session: the quit skips its confirmation. Windows sets it
   * on the definitive session-end message. macOS sets it on the power-off notification, which
   * another application can still cancel, so the next focus or show of the main window clears it.
   */
  let sessionEnding = false
  const isQuitting = (): boolean => quitting
  const currentMainWindow = (): BrowserWindow | undefined => mainWindow
  const ordinaryDialogs = new Set<AbortController>()
  const currentDialogWindow = (): BrowserWindow | undefined => welcomeWindow ?? mainWindow
  const updateOverlays = new DesktopUpdateOverlays()
  const updateDialog = new DesktopUpdateDialog(fileURLToPath(new URL('./preload-update-dialog.cjs', import.meta.url)), () => locale, updateOverlays)
  const isMandatory = (): boolean => mandatoryPolicy?.state.blocking === true
  const ordinaryMessageBox = async (options: UpdateDialogOptions,
    parent = currentDialogWindow()): Promise<Electron.MessageBoxReturnValue> => {
    const controller = new AbortController()
    ordinaryDialogs.add(controller)
    try {
      if (parent === undefined) return { response: options.cancelId ?? 0, checkboxChecked: false }
      return await updateDialog.show(parent, { ...options, signal: controller.signal })
    }
    finally { ordinaryDialogs.delete(controller) }
  }
  // Copy comes from the same locale as the update prompts so the dialog
  // chrome and its content never mix languages.
  const showAbout = async (): Promise<void> => {
    let notices: string | undefined
    try {
      notices = await readFile(join(process.resourcesPath, 'THIRD_PARTY_NOTICES.txt'), 'utf8')
    } catch (error) {
      void error
      try {
        notices = await readFile(fileURLToPath(new URL('../resources/THIRD_PARTY_NOTICES.txt', import.meta.url)), 'utf8')
      } catch (devError) {
        void devError
      }
    }
    await ordinaryMessageBox({ type: 'info', title: locale.messages.aboutMenu, message: locale.messages.aboutProduct,
      detail: `${formatDesktopMessage(locale.messages.aboutVersion, { version: app.getVersion() })}\n${locale.messages.aboutCredits}\n${aboutLegalText(notices) || formatDesktopLegalNotices()}`,
      buttons: [locale.messages.updateAcknowledge], cancelId: 0 })
  }
  const commandManager = new DesktopCommandManager({
    resources: process.resourcesPath,
    isPackaged: app.isPackaged,
    isInstalledLocation: () => process.platform !== 'darwin' || app.isInApplicationsFolder(),
    isInstalling: () => updateState.phase === 'installing',
    isQuitting,
    messages: () => currentDesktopLocale().messages,
    show: ordinaryMessageBox,
  })
  const appPreload = fileURLToPath(new URL('./preload-app.cjs', import.meta.url))
  const applicationUrl = `${SCHEME}://app/`
  let hostUrl: string | undefined
  let hostCookie: string | undefined
  const browserGuests = new DesktopBrowserGuests(() => hostUrl)
  let injections: readonly unknown[] = []
  const bootScripts = createPersonaBootScriptStore()
  let welcomeBackend: DesktopWelcomeBackend | undefined
  let reportedLaunch = false
  let analyticsEnabled = false
  const track = async <K extends keyof ProductEventMap>(eventName: K, attributes: ProductEventMap[K]): Promise<void> => {
    const event = { eventName, attributes, timestamp: Date.now() } as ProductEvent
    try {
      if (analyticsEnabled) await welcomeBackend?.report(event)
    } catch (_error) { /* Analytics cannot interrupt native actions. */ }
  }
  let stopAccount: (() => void) | undefined
  let openedAttempt: string | undefined
  let returnedAttempt: string | undefined
  let pendingWelcomeNotice: WelcomeNotice | undefined
  let previousAccountStatus: string | undefined
  const assertProductSender = (event: IpcMainInvokeEvent): BrowserWindow => {
    assertDesktopSender(event, ['app'])
    if (mainWindow === undefined || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents
      || event.senderFrame === null || event.senderFrame !== mainWindow.webContents.mainFrame) {
      throw new Error('dsh desktop: rejected IPC from an unowned renderer')
    }
    return mainWindow
  }
  let navigation: { window: BrowserWindow; url: string; promise: Promise<void> } | undefined
  const navigateMain = (url: string): Promise<void> => {
    const window = mainWindow
    if (quitting || window === undefined || window.isDestroyed()) return Promise.resolve()
    if (navigation?.window === window && navigation.url === url) return navigation.promise
    const next = { window, url, promise: Promise.resolve() }
    next.promise = window.loadURL(url).catch((error: unknown) => {
      if (quitting || shuttingDown || window.isDestroyed() || navigation !== next
        || (error instanceof Error && 'code' in error && error.code === 'ERR_ABORTED')) return
      navigation = undefined
      throw error
    })
    navigation = next
    return next.promise
  }
  const platformView = new DesktopPlatformView(join(app.getAppPath(), 'lib', 'preload-platform-account.cjs'),
    () => locale.id === 'zh-CN' ? 'zh_CN' : 'en_US', process.platform === 'win32' ? 'win32' : 'darwin',
    owner => isMandatory() || updateOverlays.input(owner).blocked)
  const backend = new DesktopBackendController((onFailure) => {
    const hostInspectPort = developmentHostInspectPort(development)
    const host = new DesktopHostProcess(resources.node, resources.dsh, activeProject,
      hostInspectPort, {
        ...hostEnvironment,
        DSH_CLIENT_VERSION: desktopClientVersion(),
        ...(process.env.VITEST === 'true' || process.env.PERSONA_SCRIPTED === '1'
          ? {}
          : { PERSONA_REAL_CLI: '1' }),
      }, onFailure,
      primaryRuntime,
      resources, (next) => { platformView.setSession(next) }, (record) => {
        operationJournal ??= new OperationJournal(join(app.getPath('userData'), 'plugin-operations'), {
          segmentBytes: 256 * 1024, recordBytes: 4096, queuedBytes: 64 * 1024,
        })
        operationJournal.enqueue(JSON.stringify(record))
      })
    return {
      start: async () => {
        if (process.env.PERSONA_TEST_BOOT_FAILURE === '1') throw new Error('Forced startup failure')
        const ready = await host.start()
        const cookie = await authenticateWebHost(ready.url)
        hostCookie = cookie
        hostUrl = ready.url
        void removeLegacyHostCookies(session.defaultSession.cookies, ready.url)
          .catch((error: unknown) => { console.error('desktop: legacy Host cookie cleanup failed', error) })
        if (ready.injections === undefined) throw new Error('Desktop Host did not provide boot injections')
        injections = applyRewrittenBootInjections(ready.injections, bootScripts)
        welcomeBackend = connectDesktopWelcome(ready.url, cookie)
        analyticsEnabled = await welcomeBackend.analyticsEnabled().catch(() => false)
        if (!reportedLaunch) { reportedLaunch = true; void track('desktop_app_launch', {}) }
        stopAccount?.()
        const accountBackend = welcomeBackend.account
        stopAccount = accountBackend.watch((state) => {
          if (quitting) return
          if (welcomeWindow !== undefined && !welcomeWindow.isDestroyed()) welcomeWindow.webContents.send(WELCOME_IPC.state, state)
          const attempt = state.attempt
          if (attempt?.phase === 'waiting-browser' && attempt.authorizeUrl !== undefined && openedAttempt !== attempt.id) {
            openedAttempt = attempt.id
            void shell.openExternal(platformLoginUrl(attempt.authorizeUrl)).catch(() => undefined)
          }
          if ((attempt?.phase === 'failed' || attempt?.phase === 'expired') && returnedAttempt !== attempt.id) {
            returnedAttempt = attempt.id
            focusPrimaryWindow()
          }
          if (state.status === 'credential-stored' && attempt?.phase === 'succeeded' && welcomeWindow !== undefined) void enterWorkspace({ activate: false }).catch(() => undefined)
          if (previousAccountStatus === 'credential-stored' && state.status === 'signed-out') {
            void readWelcomeState().then(async (value) => {
              if (shouldShowDeepSeekWelcome() && needsWelcome(value) && !quitting) {
                enteredWorkspace = false
                await showWelcome()
                if (welcomeWindow !== undefined && !welcomeWindow.isDestroyed()) welcomeWindow.webContents.send(WELCOME_IPC.state, state)
              }
              return undefined
            }).catch(() => undefined)
          }
          previousAccountStatus = state.status
        }, () => {
          // The stream reconnects; a transport failure does not change account state.
        }, () => {
          void readWelcomeState().then(async (value) => {
            if (!shouldShowDeepSeekWelcome() || !needsWelcome(value) || quitting) return
            pendingWelcomeNotice = 'session-expired'
            enteredWorkspace = false
            await showWelcome()
            const state = await accountBackend.state()
            if (welcomeWindow !== undefined && !welcomeWindow.isDestroyed()) welcomeWindow.webContents.send(WELCOME_IPC.state, state)
          }).catch(() => undefined)
        }, (enabled) => { analyticsEnabled = enabled })
      },
      stop: async () => {
        analyticsEnabled = false
        stopAccount?.()
        try { await host.stop(requireCleanStop) }
        catch (error) {
          if (!requireCleanStop || !(error instanceof DesktopHostUncleanExitError)) throw error
          // Backend cleanup succeeded; installation still rejects the unsuccessful task teardown.
          updateStopFailure = error
        }
      },
      updateTasks: (action: 'inspect' | 'lock' | 'unlock') => host.updateTasks(action),
      inspectQuit: () => host.inspectQuit(),
      resolveDragResource: (address: string, signal?: AbortSignal) => host.resolveDragResource(address, signal),
    }
  }, (state) => {
    if (state.phase === 'reconnecting') {
      backendReady = false
      if (mainWindow !== undefined && !mainWindow.isDestroyed()) {
        void mainWindow.loadURL(reconnectingPageUrl(state.message, currentDesktopLocale().id))
          .catch((error: unknown) => { console.error(error) })
      }
      return
    }
    if (state.phase === 'ready' && !shuttingDown && mainWindow !== undefined && !mainWindow.isDestroyed()
      && mainWindow.webContents.getURL().startsWith('data:text/html')) {
      void navigateMain(applicationUrl).catch((error: unknown) => { reportFatal(error, 'main') })
    }
    if (state.phase === 'error') {
      showBootFailure(state.failure)
    }
    else if (!shuttingDown) backendReady = state.phase === 'ready'
  }, process.env.VITEST === 'true' ? undefined : {
    attempts: 3,
    backoffMs: HOST_RECONNECT_BACKOFF_MS,
    message: currentDesktopLocale().messages.reconnecting,
  })

  const updateErrors = new WeakMap<DesktopUpdateState, Promise<void>>()
  const showUpdateFailure = (state: DesktopUpdateState): Promise<void> => {
    if (state.phase !== 'error') return Promise.resolve()
    if (isMandatory()) { mandatoryUI?.sync(); return Promise.resolve() }
    let shown = updateErrors.get(state)
    if (shown === undefined) {
      shown = ordinaryMessageBox({ type: 'error', title: locale.messages.updateFailedTitle,
        message: desktopUpdateErrorSummary(state, locale.messages),
        technicalDetails: state.technicalDetails ?? state.message ?? '' }).then(() => {})
      updateErrors.set(state, shown)
    }
    return shown
  }
  const publishUpdate = (state: DesktopUpdateState): DesktopUpdateState => {
    updateJournal?.state(state)
    updateState = state
    mandatoryUI?.sync()
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(DESKTOP_IPC.updatesPresentation, updatePresentation(state))
    }
    if (state.phase === 'error' && state.failedOperation !== 'check' && state.failedOperation !== 'configuration') {
      if (state.failedOperation === 'install' && fileDragStopped && !quitting) {
        fileDragCleanups.add(installFileDrag())
        fileDragStopped = false
      }
      const restoreHost = state.failedOperation === 'install' && updateStoppedHost && !quitting
      if (state.failedOperation === 'install' && !quitting) {
        operationReportsStopping = shuttingDown
        operationReportStop = undefined
      }
      shellInstallerOwnsQuit = false
      updateStoppedHost = false
      if (restoreHost) {
        // Only confirmed process exit permits replacement before another installation confirmation.
        const hostReady = backend.start(prepareHostEnvironment)
        startup = hostReady
        const recovery = hostReady.then(async () => {
          if (quitting) return
          // A replacement Host can have a new port, cookie, or boot injections even at the same URL.
          navigation = undefined
          await navigateMain(applicationUrl)
          if (backend.host !== undefined) updateJournal?.action('workspace-ready')
        })
        workspaceRecovery = recovery
        void recovery.catch((error: unknown) => { reportFatal(error, 'main') }).finally(() => {
          if (startup === hostReady) startup = undefined
          if (workspaceRecovery === recovery) workspaceRecovery = undefined
        })
      }
      void showUpdateFailure(state).catch((error: unknown) => { console.error(error) })
    }
    return state
  }

  const readWelcomeState = async () => {
    if (backend.host === undefined || welcomeBackend === undefined) throw new Error('desktop welcome: backend unavailable')
    return welcomeBackend.read()
  }
  stopForRecovery = async () => {
    const reports = stopOperationReports()
    try { await backend.close() }
    finally { await Promise.all([operationJournal?.drain(500), reports]) }
  }

  const reconcileBackend = (): Promise<void> => {
    startup ??= (async () => {
      await navigateMain(applicationUrl)
      await backend.start(async () => {
        await Promise.all([manager.applyRelease(), prepareHostEnvironment()])
      })
      if (backend.host !== undefined) await openInitialWindow()
      if (backend.host !== undefined) updateJournal?.action('workspace-ready')
      // The existing Web document resumes through the boot IPC response.
    })().catch((error: unknown) => {
      updateJournal?.action('workspace-failed')
      showBootFailure(error)
    }).finally(() => { startup = undefined })
    return startup
  }

  const manifest: unknown = JSON.parse(await readFile(join(app.getAppPath(), 'package.json'), 'utf8'))
  const packagedChannel = desktopUpdateChannel(manifest)
  const channelSettings = new DesktopUpdateSettings(app.getPath('userData'), packagedChannel)
  const initialChannel = await channelSettings.load()
  channelState = { channel: initialChannel.kind === 'ready' ? initialChannel.channel : null,
    packagedChannel, changing: false,
    ...(initialChannel.kind === 'error' ? { error: configurationFailure(initialChannel.error) } : {}) }
  const updateChannel = initialChannel.kind === 'ready' ? initialChannel.channel : packagedChannel
  const updates = new DesktopUpdateCoordinator(
    publishUpdate,
    async () => {
      await commandManager.idle()
      await workspaceRecovery
      await startup?.catch(() => undefined)
      const host = backend.host
      if (host === undefined) throw new DesktopUpdatePreparationError('tasks-unavailable', locale.messages.updateTasksUnavailable)
      const active = await host.updateTasks('inspect')
      const parent = currentDialogWindow()
      if (parent === undefined || !await prepareDesktopUpdateWindow(parent, locale.messages.updateFullscreenTimeout)) return false
      const ready = desktopUpdateReadyConfirmation(locale.messages, updates.state.version ?? '', process.platform)
      const confirmation: Electron.MessageBoxOptions = {
        type: active ? 'warning' : 'info', title: locale.messages.updateTitle,
        message: active ? locale.messages.updateActiveTasks : ready.message,
        detail: active ? locale.messages.updateActiveTasksDetail : ready.detail,
        buttons: active ? [locale.messages.updateStopTasks, locale.messages.updateLater] : [locale.messages.installAndRestart],
        defaultId: 1, cancelId: 1,
      }
      if (isMandatory()) {
        if (!await mandatoryUI?.confirm(updates.state.version ?? '', active)) return false
      } else {
        const result = await updateDialog.show(parent, confirmation)
        if (result.response !== 0 || isMandatory()) return false
      }
      // The update lock rejects new HTTP requests, including analytics intake.
      await track('desktop_upgrade_install_restart_click', {})
      if (backend.host !== host) throw new DesktopUpdatePreparationError('tasks-unavailable', locale.messages.updateTasksUnavailable)
      try {
        const stillActive = await host.updateTasks('lock')
        if (stillActive && !active) throw new DesktopUpdatePreparationError('tasks-changed', locale.messages.updateTasksChanged)
        mandatoryUI?.preparingRestart(stillActive)
        // The embedded Platform document holds credentials issued by the Host that is about to stop.
        await platformView.closeAndWait()
        await disposeFileDrag().catch((error: unknown) => { console.error(error) })
        requireCleanStop = true
        updateStopFailure = undefined
        await Promise.all([backend.stop(), stopOperationReports()])
        updateStoppedHost = true
        // The backend's async cleanup callback can assign this after the reset above.
        const stopFailure = updateStopFailure as DesktopHostUncleanExitError | undefined
        if (stopFailure !== undefined) throw new DesktopUpdatePreparationError('stop-failed', locale.messages.updateStopFailed, stopFailure.message)
        await operationJournal?.drain(500)
        updateJournal?.action('install-confirmed')
        shellInstallerOwnsQuit = true
      } catch (error) {
        operationReportsStopping = shuttingDown
        operationReportStop = undefined
        if (!updateStoppedHost) await host.updateTasks('unlock').catch((unlockError: unknown) => { console.error(unlockError) })
        throw error
      } finally {
        requireCleanStop = false
      }
      return true
    },
    undefined, undefined, undefined,
    (success, reason) => { void track('desktop_upgrade_download_result', { is_success: success, ...reason === undefined ? {} : { error_reason: reason } }) },
    updateChannel,
  )

  if (initialChannel.kind === 'error') updates.suspendConfiguration(initialChannel.error.path)
  const publishChannel = (state: DesktopChannelState): DesktopChannelState => {
    channelState = state
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(DESKTOP_IPC.updatesChannelChanged, state)
      window.webContents.send(DESKTOP_IPC.updatesPresentation, updatePresentation(updates.state))
    }
    return state
  }

  const updateSchedule = new DesktopUpdateSchedule(updates, resolveDesktopUpdateScheduleConfig(process.env))

  const downloadUpdate = async (version: string, revision = updates.revision): Promise<DesktopUpdateState> => {
    void track('desktop_upgrade_click', {})
    updateJournal?.action('download-requested')
    const state = await updates.download(version, revision)
    if (state.phase !== 'ready' || quitting) return state
    // Only a completed user-driven download opens this prompt; cancelling installation does not reopen it.
    // A confirmation on a hidden window would go unseen, so it waits for the next show; the mandatory
    // flow keeps its own taskbar and Dock attention instead.
    if (!isMandatory()) await windowShown()
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- A quit can begin while the show is awaited.
    if (quitting) return state
    return updates.install(version, revision)
  }
  const windowShown = (): Promise<void> => new Promise((resolve) => {
    const window = currentDialogWindow()
    if (window === undefined || window.isDestroyed() || window.isVisible()) { resolve(); return }
    window.once('show', () => { resolve() })
    window.once('closed', () => { resolve() })
  })

  protocol.handle(SCHEME, (request) => {
    const url = new URL(request.url)
    // Shell-owned documents live in the application bundle and never pass through the Host.
    if (url.hostname === 'shell') return serveWebDocument(request, join(app.getAppPath(),
      url.pathname === '/design-platform.css' ? 'lib/welcome' : 'renderer'))
    if (url.hostname === 'app') {
      if (url.pathname.startsWith(BOOT_UI_PATH)) {
        const asset = new URL(request.url)
        asset.pathname = url.pathname.slice(BOOT_UI_PATH.length)
        return serveWebDocument(new Request(asset, request), join(app.getAppPath(), 'renderer', 'persona-boot'))
      }
      const boot = servePersonaBootScript(request, bootScripts)
      if (boot !== undefined) return Promise.resolve(boot)
      if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname.startsWith('/assets/')
        || ['/favicon.svg', '/manifest.webmanifest'].includes(url.pathname)) {
        return serveWebDocument(request, join(resources.dsh, 'node_modules', '@deepseek-ai', 'dsh-web-frontend', 'dist')).then(async (response) => {
          if (!response.ok || request.method === 'HEAD' || !['/', '/index.html'].includes(url.pathname)) return response
          const html = await attachBootUi(await response.text(), join(app.getAppPath(), 'renderer'),
            !existsSync(join(resolvePersonaProcessHome(), 'db', 'persona.db')), locale.id)
          return new Response(html, { headers: response.headers })
        })
      }
      if (backend.host === undefined || hostUrl === undefined || hostCookie === undefined) {
        return Promise.resolve(new Response(null, { status: 503 }))
      }
      return forwardWebRequest(request, hostUrl, hostCookie)
    }
    return Promise.resolve(new Response(null, { status: 404 }))
  })

  installDesktopDirectoryPicker(() => mainWindow, {
    personaHome: () => resolvePersonaProcessHome(),
  })
  installPersonaAboutShellIpc(() => mainWindow, {
    resourcesPath: process.resourcesPath,
    importMetaUrl: import.meta.url,
    openExternalConfirm: async (window, url) => {
      const messages = currentDesktopLocale().messages
      const choice = await dialog.showMessageBox(window, {
        type: 'question',
        message: messages.openExternalConfirm,
        detail: url,
        buttons: [messages.cancel, messages.openInBrowser],
        defaultId: 0,
        cancelId: 0,
      })
      return choice.response === 1
    },
  })
  installTeachCapture(() => mainWindow, {
    personaHome: () => resolvePersonaProcessHome(),
    listSources: async () => {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] })
      return sources.map(source => ({
        id: source.id,
        name: source.name,
        kind: source.id.startsWith('screen:') ? 'screen' as const : 'window' as const,
      }))
    },
  })
  let computerUseBind!: ReturnType<typeof installComputerUseBind>
  computerUseBind = installComputerUseBind(() => mainWindow, {
    ...createComputerUseComHost({
      spawn: (command, args, env) => {
        const result = spawnSync(command, [...args], {
          encoding: 'utf8', windowsHide: true, timeout: 8_000, env,
        })
        return { stdout: result.stdout ?? '', status: result.status }
      },
      displays: () => screen.getAllDisplays().map(display => ({
        id: display.id,
        bounds: display.bounds,
        scaleFactor: display.scaleFactor,
      })),
      createWindow: (spec) => {
        const overlay = new BrowserWindow({
          ...overlayBrowserWindowOptions(spec),
          webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
        })
        overlay.setAlwaysOnTop(true, spec.alwaysOnTopLevel)
        overlay.setIgnoreMouseEvents(spec.ignoreMouseEvents.ignore, { forward: spec.ignoreMouseEvents.forward })
        overlay.webContents.on('console-message', (_event, _level, message) => {
          const action = interpretOverlayConsole(message)
          if (action === undefined) return
          if (action.kind === 'devolver') computerUseBind.resumeHeld()
          else {
            const ignore = overlayMouseIgnore(action.hovered)
            overlay.setIgnoreMouseEvents(ignore.ignore, { forward: ignore.forward })
          }
        })
        return overlay
      },
    }),
    subscribeHook: (listener) => {
      const window = mainWindow
      if (window === undefined) return () => undefined
      const onInput = (_event: Electron.Event, input: Input) => {
        listener({
          kind: 'key',
          control: input.control || input.meta,
          shift: input.shift,
          key: input.key,
        })
      }
      window.webContents.on('before-input-event', onInput)
      return () => { window.webContents.off('before-input-event', onInput) }
    },
    registerShortcut: (accelerator, callback) => {
      globalShortcut.register(accelerator, callback)
      return () => { globalShortcut.unregister(accelerator) }
    },
  })
  desktopComputerUseActions(computerUseBind)
  installMicrophonePermissions(session.defaultSession, () => mainWindow?.webContents)
  hardenSession(session.defaultSession)
  const shortcuts = installDesktopShortcuts(() => mainWindow, app.getPath('userData'),
    process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux', () => { refreshApplicationMenu() }, window => updateOverlays.input(window))
  app.on('will-quit', () => {
    shortcuts.dispose()
    computerUseBind.close()
  })

  ipcMain.handle(DESKTOP_IPC.boot, async (event) => {
    assertDesktopSender(event, ['app'])
    await startup
    if (backend.host === undefined || hostUrl === undefined) throw new Error('Desktop Host is unavailable')
    return { injections, streamBaseUrl: new URL(hostUrl).origin }
  })

  ipcMain.handle(DESKTOP_IPC.bootFailed, (event, message: unknown) => {
    assertDesktopSender(event, ['app'])
    if (event.sender !== mainWindow?.webContents || event.senderFrame !== event.sender.mainFrame) {
      throw new Error('dsh desktop: rejected startup failure from a non-primary frame')
    }
    if (typeof message !== 'string') throw new Error('dsh desktop: startup failure must be text')
    showBootFailure(new Error(message))
  })

  ipcMain.handle(DESKTOP_IPC.bootState, (event) => {
    assertProductSender(event)
    return bootFailure
  })
  ipcMain.handle(DESKTOP_IPC.bootDiagnostic, (event) => {
    assertProductSender(event)
    const diagnostic = `Persona ${app.getVersion()} · ${bootFailure?.code ?? 'boot_timeout'} · ${app.getPath('logs')}`
    clipboard.writeText(diagnostic)
    return diagnostic
  })
  let retryingBoot: Promise<void> | undefined
  ipcMain.handle(DESKTOP_IPC.bootRetry, (event) => {
    assertProductSender(event)
    retryingBoot ??= (async () => {
      await backend.stop()
      bootFailure = undefined
      delete process.env.PERSONA_TEST_BOOT_FAILURE
      navigation = undefined
      await reconcileBackend()
    })().catch(showBootFailure).finally(() => { retryingBoot = undefined })
    return retryingBoot
  })

  ipcMain.handle(DESKTOP_IPC.browserAcquire, (event, workspace: unknown) => {
    assertProductSender(event)
    return browserGuests.acquire(event.sender, workspace)
  })
  ipcMain.handle(DESKTOP_IPC.browserRelease, (event, lease: unknown) => {
    assertProductSender(event)
    return browserGuests.release(event.sender, lease)
  })

  session.defaultSession.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
    if (isDeepSeekHost(details.url)) {
      callback({ cancel: true })
      return
    }
    callback({})
  })
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['ws://127.0.0.1/*', 'wss://127.0.0.1/*'] }, (details, callback) => {
    if (hostUrl === undefined || hostCookie === undefined || details.webContentsId !== mainWindow?.webContents.id) {
      callback({})
      return
    }
    const target = new URL(hostUrl)
    const requested = new URL(details.url)
    if (requested.host !== target.host || requested.protocol !== (target.protocol === 'https:' ? 'wss:' : 'ws:')) { callback({}); return }
    const headers = Object.fromEntries(Object.entries(details.requestHeaders).map(([name, value]) => [name.toLowerCase(), value]))
    if (headers.origin !== 'dsh-app://app') { callback({ cancel: true }); return }
    callback({ requestHeaders: { ...headers, origin: target.origin, cookie: hostCookie, 'sec-fetch-site': 'same-origin' } })
  })

  const assertMainApplication = (event: IpcMainInvokeEvent): BrowserWindow => {
    const owner = mainWindow
    if (owner === undefined || event.sender !== owner.webContents || event.senderFrame !== owner.webContents.mainFrame
      || !event.senderFrame.url.startsWith('dsh-app://app/')) throw new Error('Rejected Platform command')
    return owner
  }
  installFileActions(assertMainApplication, () => hostUrl)
  ipcMain.on(PLATFORM_IPC.bootstrap, (event) => {
    if (event.sender !== mainWindow?.webContents) { event.returnValue = null; return }
    try { event.returnValue = platformView.bootstrap(event) }
    catch { event.returnValue = null }
  })
  ipcMain.handle(PLATFORM_IPC.open, (event, page: unknown, bounds: unknown) => {
    const owner = assertMainApplication(event)
    if (page !== 'usage' && page !== 'top-up') throw new Error('Invalid Platform page')
    return platformView.open(owner, page, platformBounds(bounds))
  })
  ipcMain.handle(PLATFORM_IPC.bounds, (event, bounds: unknown) => {
    assertMainApplication(event)
    platformView.setBounds(platformBounds(bounds))
  })
  ipcMain.handle(PLATFORM_IPC.close, (event) => { assertMainApplication(event); platformView.close() })
  // Only the main window may synchronize its palette with the native material.
  ipcMain.on(DESKTOP_IPC.nativeThemeSet, (event, source: unknown) => {
    if (mainWindow === undefined || event.sender !== mainWindow.webContents) return
    if (source === 'light' || source === 'dark' || source === 'system') nativeTheme.themeSource = source
  })
  ipcMain.handle(DESKTOP_IPC.localeBootstrap, async (event) => {
    if (event.sender !== mainWindow?.webContents || event.senderFrame !== mainWindow.webContents.mainFrame
      || new URL(event.senderFrame.url).origin !== new URL(applicationUrl).origin) {
      throw new Error('desktop welcome: rejected locale request from an unowned frame')
    }
    if (welcomeBackend === undefined) throw new Error('desktop welcome: backend unavailable')
    return { languages: systemLanguages, preference: await welcomeBackend.readLocalePreference() }
  })
  ipcMain.on(DESKTOP_IPC.localeChanged, (event, next: unknown) => {
    const window = mainWindow
    if (window === undefined || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame
      || typeof next !== 'string') return
    const current = resolveDesktopStartupLocale(next, systemLanguages)
    writeDesktopLocaleCache(app.getPath('userData'), current.id)
    if (current.id === locale.id) return
    locale = current
    platformView.notifyLocaleChanged()
    windowsLanguage = locale.id
    refreshApplicationMenu()
  })
  ipcMain.handle(DESKTOP_IPC.updatesChannelGet, (event) => {
    assertProductSender(event)
    return channelState
  })
  let channelRequests = 0
  ipcMain.handle(DESKTOP_IPC.updatesChannelSet, async (event, channel: unknown): Promise<DesktopChannelChangeResult> => {
    assertProductSender(event)
    if (!isDesktopUpdateChannel(channel)) throw new Error('desktop update: unsupported channel')
    if (channelState === undefined) throw new Error('desktop update: settings are not initialized')
    channelRequests++
    publishChannel({ ...channelState, changing: true })
    try {
      const kind = await updates.switchChannel(channel, async () => {
        try { await channelSettings.save(channel) } catch (error) {
          if (channelSaveFailure(error) === 'uncertain') {
            updates.suspendConfiguration('desktop update: settings save outcome is unknown')
            publishChannel({ channel: updates.selectedChannel, packagedChannel, changing: true, error: 'read' })
          }
          throw error
        }
      })
      if (kind === 'applied') void mandatoryPolicy?.check('channel-change', true).catch((error: unknown) => { console.error(error) })
      return { kind, state: publishChannel({ channel: updates.selectedChannel, packagedChannel, changing: --channelRequests > 0 }) }
    } catch (error) {
      console.error('desktop update: channel change failed', error)
      const state = publishChannel({ ...channelState, changing: --channelRequests > 0,
        ...(updates.configurationFailure === 'cleanup' ? { error: 'cleanup' as const } : {}) })
      return { kind: 'failed', state, reason: channelSaveFailure(error) }
    }
  })
  ipcMain.handle(DESKTOP_IPC.updatesStatus, (event) => {
    assertProductSender(event)
    return updatePresentation(updates.state)
  })
  ipcMain.handle(DESKTOP_IPC.deviceInfo, (event) => {
    assertProductSender(event)
    return readDeviceInfo()
  })
  ipcMain.handle(DESKTOP_IPC.onboardingApiKey, async (event) => {
    assertProductSender(event)
    return (await readWelcomeState()).hasApiKey
  })
  ipcMain.on(DESKTOP_IPC.onboardingActive, (event, active: unknown) => {
    const window = mainWindow
    if (window === undefined || window.isDestroyed() || event.sender !== window.webContents
      || event.senderFrame !== window.webContents.mainFrame
      || !event.senderFrame.url.startsWith(`${SCHEME}://app/`) || typeof active !== 'boolean') return
    window.setMinimumSize(active ? 960 : 520, 600)
    if (active) {
      const { width, height } = window.getBounds()
      if (width < 960) window.setSize(960, height)
    }
  })
  ipcMain.handle(DESKTOP_IPC.updatesOpen, async (event) => {
    assertProductSender(event)
    await openUpdatePrompt()
  })

  let configurationPrompt: Promise<void> | undefined
  const showConfigurationError = (): Promise<void> => {
    configurationPrompt ??= Promise.resolve().then(async () => {
      while (channelState?.error !== undefined) {
        const result = await ordinaryMessageBox({ type: 'error', title: locale.messages.updateFailedTitle,
          message: configurationMessage(channelState.error, locale.messages),
          ...{ detail: channelSettings.path,
            buttons: [locale.messages.updateReloadSettings, locale.messages.updateShowSettingsFile, locale.messages.updateClose],
            defaultId: 0, cancelId: 2,
            keepOpenAction: { index: 1, run: () => { shell.showItemInFolder(channelSettings.path) } },
            action: { index: 0, run: async () => {
              if (channelRequests > 0 || channelState === undefined) return false
              channelRequests++
              publishChannel({ ...channelState, changing: true })
              try {
                const loaded = await channelSettings.load()
                if (loaded.kind === 'error') {
                  publishChannel({ ...channelState, changing: true, error: configurationFailure(loaded.error) })
                  return false
                }
                await updates.switchChannel(loaded.channel, async () => {})
                publishChannel({ channel: updates.selectedChannel, packagedChannel, changing: true })
                return true
              } catch (error) {
                console.error('desktop update: settings reload failed', error)
                publishChannel({ ...channelState,
                  ...(updates.configurationFailure === 'cleanup' ? { error: 'cleanup' as const } : {}) })
                return false
              } finally {
                publishChannel({ ...channelState, changing: --channelRequests > 0 })
              }
            } } },
        }, mandatoryUI?.confirmationWindow ?? currentDialogWindow())
        if (result.response !== 0) return
      }
    }).finally(() => { configurationPrompt = undefined })
    return configurationPrompt
  }

  let promptOperation: Promise<void> | undefined
  let policyAuthenticationQueued = false
  /** Present check results only while their captured channel revision remains current. */
  const openUpdatePrompt = (manual = false): Promise<void> => {
    if (channelState?.error !== undefined) {
      return showConfigurationError()
    }
    if (authenticationOperation !== undefined) {
      policyAuth?.focus(); updateDialog.focus()
    }
    let failedOperation: 'check' | 'download' | 'install' = 'check'
    promptOperation ??= Promise.resolve().then(async () => {
      if (manual) updateJournal?.action('check-requested')
      const joinedPolicyAuthentication = authenticationOperation !== undefined
      if (joinedPolicyAuthentication) await authenticatePolicy()
      if (isMandatory()) {
        mandatoryUI?.focus()
        if (manual) await Promise.all([checkPolicyManually(), updateSchedule.check(true)])
        return
      }
      let controller: AbortController | undefined
      let progress: Promise<unknown> | undefined
      try {
        let state = updates.state
        const revision = updates.revision
        if (manual || state.phase === 'idle' || (state.phase === 'error' && state.failedOperation === 'check')) {
          controller = new AbortController()
          ordinaryDialogs.add(controller)
          const parent = currentDialogWindow()
          progress = parent === undefined ? Promise.resolve() : updateDialog.show(parent, { type: 'info', title: locale.messages.updateCheckTitle,
            message: locale.messages.updateChecking, buttons: [locale.messages.later], cancelId: 0, signal: controller.signal })
          if (!joinedPolicyAuthentication) {
            void checkPolicyManually('deferred').catch((error: unknown) => { console.error(error) })
          }
          state = await updateSchedule.check(true)
        }
        if (revision !== updates.revision) return
        if (isMandatory()) { mandatoryUI?.focus(); return }
        if (state.phase === 'error' && state.failedOperation === 'check') { await showUpdateFailure(state); return }
        if (state.phase === 'idle') {
          await ordinaryMessageBox({ type: 'info', title: locale.messages.updateCheckTitle,
            message: locale.messages.updateCurrent,
            detail: formatDesktopMessage(locale.messages.updateCurrentDetail, { version: app.getVersion() }) })
          return
        }
        if (state.phase === 'ready' || (state.phase === 'error' && state.failedOperation === 'install')) {
          if (state.version !== undefined) {
            failedOperation = 'install'
            await showUpdateFailure(await updates.install(state.version, revision))
          }
          return
        }
        if (state.phase !== 'available' && !(state.phase === 'error' && state.failedOperation === 'download')) return
        if (manual) {
          const result = await ordinaryMessageBox({ title: locale.messages.updateCheckTitle,
            message: formatDesktopMessage(locale.messages.updateAvailable, { version: state.version ?? '' }),
            detail: locale.messages.updateDetail,
            buttons: [locale.messages.updateDownload], cancelId: 1 })
          if (result.response !== 0) return
        }
        if (!isMandatory() && state.version !== undefined) {
          controller?.abort()
          failedOperation = 'download'
          await showUpdateFailure(await downloadUpdate(state.version, revision))
        }
      } finally {
        controller?.abort()
        if (controller !== undefined) ordinaryDialogs.delete(controller)
        await progress
      }
    }).catch((error: unknown) => showUpdateFailure({ phase: 'error', failedOperation,
      message: desktopErrorState(error).message }))
      .finally(() => { promptOperation = undefined; flushQueuedPolicyAuthentication() })
    return promptOperation
  }

  let authenticationOperation: Promise<DesktopPolicyState | undefined> | undefined
  const authenticatePolicy = () => {
    if (authenticationOperation !== undefined) { policyAuth?.focus(); updateDialog.focus() }
    authenticationOperation ??= runPolicyAuthentication().finally(() => { authenticationOperation = undefined })
    return authenticationOperation
  }
  const flushQueuedPolicyAuthentication = (): void => {
    if (!policyAuthenticationQueued || promptOperation !== undefined || authenticationOperation !== undefined
      || isMandatory() || quitting) return
    policyAuthenticationQueued = false
    void authenticatePolicy().catch((error: unknown) => { console.error(error) })
  }
  const queuePolicyAuthentication = (): void => {
    if (!desktopSettings.updates.allowTestAuthPopupWindow) return
    if (authenticationOperation !== undefined) {
      policyAuth?.focus(); updateDialog.focus()
      return
    }
    policyAuthenticationQueued = true
    flushQueuedPolicyAuthentication()
  }
  const runPolicyAuthentication = async () => {
    if (!desktopSettings.updates.allowTestAuthPopupWindow
      || policyAuth === undefined || mandatoryPolicy === undefined || quitting) return undefined
    const parent = mandatoryUI?.confirmationWindow ?? currentDialogWindow()
    if (parent === undefined) return undefined
    const consent = await updateDialog.show(parent, { type: 'info', title: locale.messages.policyLoginTitle,
      message: locale.messages.policyLoginRequired, buttons: [locale.messages.policyLogin, locale.messages.later], cancelId: 1 })
    if (consent.response !== 0 || isQuitting()) return undefined
    const outcome = await policyAuth.login()
    if (isQuitting() || outcome === 'cancelled') return undefined
    if (outcome === 'failed') {
      await updateDialog.show(parent, { type: 'error', title: locale.messages.policyLoginTitle,
        message: locale.messages.policyLoginFailed, buttons: [locale.messages.updateAcknowledge], cancelId: 0 })
      return undefined
    }
    // Drain a pre-login request before asking the server to evaluate the new cookies.
    await mandatoryPolicy.check('login-return')
    if (isQuitting()) return undefined
    return mandatoryPolicy.check('login-return', true)
  }

  const checkPolicyManually = async (authentication: 'immediate' | 'deferred' = 'immediate') => {
    if (authenticationOperation !== undefined) return authenticatePolicy()
    const policy = await mandatoryPolicy?.check('manual', true)
    if (policy?.error !== 'authentication-required' || !desktopSettings.updates.allowTestAuthPopupWindow) return policy
    if (authentication === 'immediate') return authenticatePolicy()
    queuePolicyAuthentication()
    return policy
  }

  const automaticCheck = (): void => {
    if (skipUpdaterAtBoot() || !personaUpdatesEnabled()) return
    if (!quitting) void mandatoryPolicy?.check('foreground-or-resume').catch((error: unknown) => { console.error(error) })
    if (!quitting) void updateSchedule.check().catch((error: unknown) => { console.error(error) })
  }
  const loginItem = new DesktopLoginItem({
    apply: (settings) => {
      try { app.setLoginItemSettings(settings) } catch { /* Test doubles omit setLoginItemSettings. */ }
    },
  })
  void readPersonaShellPrefs(app.getPath('userData')).then((prefs) => {
    loginItem.setOpenAtLogin(prefs.startWithWindows)
  }).catch((error: unknown) => { console.error(error) })
  const desktopPower = new DesktopPower({
    blocker: powerSaveBlocker,
    onCatchUp: (limit) => {
      if (mainWindow !== undefined && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(ALWAYS_ON_IPC.catchUp, { limit })
      }
    },
  })
  const desktopNotifications = new DesktopNotifications({
    // Anvil Remote `getAutonomy` (proposalBudget / silenceStart / silenceEnd) — default until host posts it.
    policy: () => policyFromAutonomy({ delivery: 'ping', proposalBudget: 3, silenceStart: '22:00', silenceEnd: '07:00' }),
    locale: () => currentDesktopLocale().messages,
    notify: {
      show: (payload) => {
        try {
          const toast = new Notification({ title: payload.title, body: payload.body })
          toast.on('click', () => { openPersonaLink(payload.href) })
          toast.show()
        } catch (error) {
          void error
        }
        return {}
      },
    },
    open: (href) => { openPersonaLink(href) },
  })
  ipcMain.on(ALWAYS_ON_IPC.attention, (event, payload: unknown) => {
    assertDesktopSender(event, ['app'])
    if (isAlwaysOnAttention(payload)) {
      desktopNotifications.ingest(payload)
      if (payload.kind === 'needs-you') trayNeedsYou += 1
      tray?.setPresence({ working: trayWorking, needsYou: trayNeedsYou, paused: false })
    }
  })
  ipcMain.on(ALWAYS_ON_IPC.runningAssignments, (event, payload: unknown) => {
    assertDesktopSender(event, ['app'])
    const count = runningAssignmentCount(payload)
    if (count !== undefined) {
      desktopPower.setRunningAssignments(count)
      trayWorking = count
      tray?.setPresence({ working: trayWorking, needsYou: trayNeedsYou, paused: false })
    }
  })
  const openPersonaLink = (href: string): void => {
    const link = parsePersonaDeepLink(href)
    focusPrimaryWindow()
    if (link !== undefined && mainWindow !== undefined && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(ALWAYS_ON_IPC.openTask, link.ticketId)
    }
  }
  const runBackupNow = async (): Promise<void> => {
    const dest = await dialog.showSaveDialog({
      title: currentDesktopLocale().messages.backupNow,
      defaultPath: join(app.getPath('documents'), 'persona-backup.zip'),
    })
    if (dest.canceled || dest.filePath === undefined) return
    const result = await backupPersonaHome(resolvePersonaProcessHome(), dest.filePath)
    await ordinaryMessageBox({
      type: 'info',
      title: currentDesktopLocale().messages.backupNow,
      message: formatDesktopMessage(currentDesktopLocale().messages.backupDone, { path: result.path }),
      detail: currentDesktopLocale().messages.backupVaultNote,
      buttons: [currentDesktopLocale().messages.backgroundNoticeConfirm],
    })
  }
  const runRestoreBackup = async (): Promise<void> => {
    const confirm = await ordinaryMessageBox({
      type: 'warning',
      title: currentDesktopLocale().messages.restoreBackup,
      message: currentDesktopLocale().messages.restoreConfirm,
      detail: currentDesktopLocale().messages.backupVaultNote,
      buttons: [currentDesktopLocale().messages.cancel, currentDesktopLocale().messages.restoreBackup],
      defaultId: 0,
      cancelId: 0,
    })
    if (confirm.response !== 1) return
    const pick = await dialog.showOpenDialog({ properties: ['openFile'] })
    if (pick.canceled || pick.filePaths[0] === undefined) return
    await backend.stop()
    await restorePersonaBackup({
      home: resolvePersonaProcessHome(),
      archivePath: pick.filePaths[0],
      confirmed: true,
    })
    app.relaunch()
    quitWithoutConfirmation()
  }
  const pauseTeam = (): void => {
    void readPersonaShellPrefs(app.getPath('userData')).then(async (prefs) => {
      await writePersonaShellPrefs(app.getPath('userData'), { ...prefs, teamPaused: true })
      tray?.setPresence({ working: trayWorking, needsYou: trayNeedsYou, paused: true })
      if (mainWindow !== undefined && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(ALWAYS_ON_IPC.pauseTeam)
      }
    }).catch((error: unknown) => { console.error(error) })
  }
  const resumeTeam = (): void => {
    void readPersonaShellPrefs(app.getPath('userData')).then(async (prefs) => {
      await writePersonaShellPrefs(app.getPath('userData'), { ...prefs, teamPaused: false })
      tray?.setPresence({ working: trayWorking, needsYou: trayNeedsYou, paused: false })
    }).catch((error: unknown) => { console.error(error) })
  }
  powerMonitor.on('resume', automaticCheck)
  powerMonitor.on('resume', () => { desktopPower.onResume() })
  app.on('will-quit', () => {
    desktopPower.dispose()
    updateSchedule.dispose()
    powerMonitor.off('resume', automaticCheck)
    updates.dispose()
  })

  const applicationIconPath = development ? join(app.getAppPath(), 'resources', 'icon-windows.png')
    : join(process.resourcesPath, 'icon.png')
  app.setAboutPanelOptions({
    applicationName: PERSONA_PRODUCT_NAME,
    applicationVersion: app.getVersion(),
    // The release has no separate build number; omit Electron's bundle version.
    version: '',
    copyright: '',
    iconPath: applicationIconPath,
  })
  // A custom application menu replaces Electron's default menu, so macOS needs
  // its standard menus and application hide commands declared explicitly.
  // Keep app.name stable: Electron derives its default userData directory from it.
  const darwin = process.platform === 'darwin'
  const platformMenus = (): MenuItemConstructorOptions[] => darwin
    ? [shortcuts.fileMenu(currentDesktopLocale().messages), { role: 'editMenu' }, { role: 'windowMenu' }]
    : [{ role: 'editMenu' }]
  const hideCommands: MenuItemConstructorOptions[] = darwin
    ? [{ role: 'hide', label: currentDesktopLocale().messages.hideApplication },
      { role: 'hideOthers', label: currentDesktopLocale().messages.hideOtherApplications },
      { role: 'unhide', label: currentDesktopLocale().messages.showAllApplications }, { type: 'separator' }]
    : []
  const applicationItems = (): MenuItemConstructorOptions[] => [
    // Windows has no system About panel; Electron's fallback is a plain
    // message box, so the shell shows its own dimmed dialog instead.
    process.platform === 'win32'
      ? { label: currentDesktopLocale().messages.aboutMenu,
        click: () => { void showAbout().catch((error: unknown) => { console.error(error) }) } }
      : { label: currentDesktopLocale().messages.aboutMenu, role: 'about' },
    { type: 'separator' },
    ...personaUpdatesEnabled()
      ? [{ label: currentDesktopLocale().messages.checkUpdatesMenu, click: () => { void openUpdatePrompt(true) } }]
      : [],
    ...process.platform === 'darwin' || process.platform === 'win32'
      ? [{ label: currentDesktopLocale().messages.cliCommandMenu, click: () => { void commandManager.show() } }] : [],
    { type: 'separator' },
    {
      label: currentDesktopLocale().messages.startWithWindows,
      type: 'checkbox',
      checked: loginItem.openAtLogin,
      click: (item) => {
        const enabled = item.checked === true
        loginItem.setOpenAtLogin(enabled)
        void readPersonaShellPrefs(app.getPath('userData')).then(async (prefs) => {
          await writePersonaShellPrefs(app.getPath('userData'), { ...prefs, startWithWindows: enabled })
        }).catch((error: unknown) => { console.error(error) })
      },
    },
    {
      label: currentDesktopLocale().messages.backupNow,
      click: () => { void runBackupNow().catch((error: unknown) => { console.error(error) }) },
    },
    {
      label: currentDesktopLocale().messages.restoreBackup,
      click: () => { void runRestoreBackup().catch((error: unknown) => { console.error(error) }) },
    },
    {
      label: currentDesktopLocale().messages.openLogsFolder,
      click: () => { void shell.openPath(personaLogsDir(resolvePersonaProcessHome())) },
    },
    {
      label: currentDesktopLocale().messages.copyDiagnostic,
      click: () => {
        void copyPersonaDiagnostic(resolvePersonaProcessHome()).then(async () => {
          await ordinaryMessageBox({
            type: 'info',
            title: currentDesktopLocale().messages.copyDiagnostic,
            message: currentDesktopLocale().messages.diagnosticCopied,
            buttons: [currentDesktopLocale().messages.backgroundNoticeConfirm],
          })
        }).catch((error: unknown) => { console.error(error) })
      },
    },
    { type: 'separator' },
    ...development ? [
      { label: currentDesktopLocale().messages.reloadPageMenu, role: 'reload' as const },
      { label: currentDesktopLocale().messages.restartAppHostMenu, click: () => {
        if (quitting) return
        app.relaunch()
        quitWithoutConfirmation()
      } },
    ] : [],
    { role: 'toggleDevTools', label: currentDesktopLocale().messages.toggleDevToolsMenu },
    { type: 'separator' },
    ...hideCommands,
    { role: 'quit', ...(darwin ? { label: currentDesktopLocale().messages.quitApplication }
      : process.platform === 'win32' ? { label: currentDesktopLocale().messages.exitApplication } : {}) },
  ]
  const devToolsF12Shortcut: MenuItemConstructorOptions = { role: 'toggleDevTools', visible: false, accelerator: 'F12' }
  const windowsDevToolsShortcuts: MenuItemConstructorOptions[] = [
    { role: 'toggleDevTools', visible: false },
    devToolsF12Shortcut,
  ]
  const refreshApplicationMenu = (): void => {
    Menu.setApplicationMenu(Menu.buildFromTemplate(process.platform === 'win32'
      ? windowsDevToolsShortcuts : [{
        label: darwin ? app.name : currentDesktopLocale().messages.application,
        submenu: [...applicationItems(), devToolsF12Shortcut],
      }, ...platformMenus()]))
    tray?.relabel()
  }
  refreshApplicationMenu()
  const trayIconPath = development ? join(app.getAppPath(), 'resources', 'tray-windows.ico') : join(process.resourcesPath, 'tray.ico')
  if (process.platform === 'win32') {
    // The tray is the way back to a hidden window; without it, relaunching the application still focuses it.
    try {
      tray = new DesktopTray({
        iconPath: trayIconPath,
        iconDir: development ? join(app.getAppPath(), 'resources') : process.resourcesPath,
        locale: currentDesktopLocale,
        open: () => { focusPrimaryWindow() },
        openNeedsYou: () => { focusPrimaryWindow() },
        pause: pauseTeam,
        resume: resumeTeam,
        openLogs: () => { void shell.openPath(personaLogsDir(resolvePersonaProcessHome())) },
        copyDiagnostic: () => {
          void copyPersonaDiagnostic(resolvePersonaProcessHome()).then(async () => {
            await ordinaryMessageBox({
              type: 'info',
              title: currentDesktopLocale().messages.copyDiagnostic,
              message: currentDesktopLocale().messages.diagnosticCopied,
              buttons: [currentDesktopLocale().messages.backgroundNoticeConfirm],
            })
          }).catch((error: unknown) => { console.error(error) })
        },
        quit: () => { app.quit() },
      })
    } catch (error) { console.warn('desktop tray: unavailable', error) }
  }
  const backgroundNotice = process.platform === 'win32'
    ? new DesktopBackgroundNotice({ markerPath: join(app.getPath('userData'), 'background-close-confirmed'),
      locale: () => locale, show: ordinaryMessageBox, focus: () => { updateDialog.focus() } })
    : undefined
  const quitConfirmation = new DesktopQuitConfirmation({
    locale: () => locale,
    inspect: () => backend.host?.inspectQuit(),
    // No owner window: a hidden window stays hidden and the native box is its own top-level window.
    show: options => dialog.showMessageBox(options),
    // macOS raises the open alert with the application; Electron exposes no handle to the Windows task
    // dialog, so a repeated request there only joins the open decision.
    focus: () => { if (process.platform === 'darwin') app.focus({ steal: true }) },
    // The task dialog draws its main icon at the system icon size; the multi-size ICO yields that
    // size directly, where the 1024 px PNG would be scaled down by GDI.
    ...(process.platform === 'win32' ? { icon: nativeImage.createFromPath(trayIconPath) } : {}),
  })

  if (process.platform === 'win32') {
    ipcMain.handle(DESKTOP_IPC.windowsMenu, (event, name: unknown, x: unknown, y: unknown) => {
      assertDesktopSender(event, ['app'])
      if (mainWindow === undefined || event.sender !== mainWindow.webContents
        || event.senderFrame !== mainWindow.webContents.mainFrame) throw new Error('desktop menu: rejected sender')
      if ((name !== 'application' && name !== 'edit')
        || typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)
        || x < 0 || y < 0 || x > 100_000 || y > 100_000) throw new Error('desktop menu: invalid popup request')
      const window = mainWindow
      // Editor-owned history listens to key events rather than Chromium's native undo stack.
      const editItem = (label: string, keyCode: string, modifiers: Array<'control'>, accelerator?: string): MenuItemConstructorOptions => ({
        label,
        ...(accelerator === undefined ? {} : { accelerator }),
        click: () => {
          shortcuts.sendEditingKey(keyCode, modifiers)
        },
      })
      const items: MenuItemConstructorOptions[] = name === 'application' ? applicationItems() : [
        editItem(currentDesktopLocale().messages.undo, 'Z', ['control'], 'Ctrl+Z'),
        editItem(currentDesktopLocale().messages.redo, 'Y', ['control'], 'Ctrl+Y'),
        { type: 'separator' },
        editItem(currentDesktopLocale().messages.cut, 'X', ['control'], 'Ctrl+X'),
        editItem(currentDesktopLocale().messages.copy, 'C', ['control'], 'Ctrl+C'),
        editItem(currentDesktopLocale().messages.paste, 'V', ['control'], 'Ctrl+V'),
        editItem(currentDesktopLocale().messages.delete, 'Delete', []),
        { type: 'separator' },
        editItem(currentDesktopLocale().messages.selectAll, 'A', ['control'], 'Ctrl+A'),
      ]
      const zoom = mainWindow.webContents.getZoomFactor()
      return new Promise<void>((resolve) => {
        Menu.buildFromTemplate(items).popup({ window, x: Math.round(x * zoom), y: Math.round(y * zoom), callback: resolve })
      })
    })
    ipcMain.on(DESKTOP_IPC.windowsAppearance, (event, _language: unknown, color: unknown, symbolColor: unknown) => {
      if (mainWindow === undefined || event.sender !== mainWindow.webContents
        || event.senderFrame !== mainWindow.webContents.mainFrame) return
      if (!event.senderFrame.url.startsWith(`${SCHEME}://app/`)) return
      // Document lang starts as English before Host locale bootstrap; only localeChanged owns shell language.
      // Empty colors precede client stylesheet installation; only CSS color values cross IPC.
      const validColor = (value: unknown): value is string => typeof value === 'string'
        && /^(?:#[\da-f]{3,8}|rgba?\([\d.,%\s]+\))$/iu.test(value)
      if (validColor(color) && validColor(symbolColor)) mainWindow.setTitleBarOverlay({ color, symbolColor })
    })
  }

  const hideMainWindow = (window: BrowserWindow): void => {
    if (process.platform === 'darwin' && window.isFullScreen()) {
      // Hiding a fullscreen window leaves an empty black space; leave fullscreen first.
      window.once('leave-full-screen', () => { if (!window.isDestroyed()) window.hide() })
      window.setFullScreen(false)
    } else {
      window.hide()
    }
  }
  const createMainWindow = (): BrowserWindow => {
    const window = createWindow(appPreload, false, true)
    mainWindow = window
    void navigateMain(applicationUrl)
      .catch((error: unknown) => { console.error(error) })
    browserGuests.bind(window, (guest, name) => shortcuts.attachGuest(window, guest, name))
    shortcuts.attach(window)
    window.on('focus', automaticCheck)
    // Closing hides: the page and the Host keep running, and the next show resumes the same document.
    window.on('close', (event) => {
      if (quitting || shellInstallerOwnsQuit || sessionEnding) return
      event.preventDefault()
      if (updateDialog.isOpen) { updateDialog.focus(); return }
      const hide = (): void => {
        if (!quitting && !shellInstallerOwnsQuit && !sessionEnding && !window.isDestroyed()) hideMainWindow(window)
      }
      if (backgroundNotice === undefined) hide()
      else backgroundNotice.close(hide)
    })
    if (process.platform === 'win32') {
      // Shutdown, restart, and log-off must not wait on a confirmation. query-session-end is only a
      // question that another application can veto without any follow-up message, so it does not count.
      window.on('session-end', () => { sessionEnding = true })
    } else {
      // The macOS power-off notification arrives before the terminate request; a cancelled shutdown
      // leaves the process running, and user attention on the window shows the session continues.
      window.on('focus', () => { sessionEnding = false })
      window.on('show', () => { sessionEnding = false })
    }
    window.on('closed', () => { if (mainWindow === window) mainWindow = undefined })
    window.webContents.on('console-message', (details) => {
      if (details.level !== 'error') return
      rendererConsole.push(`${details.sourceId}:${String(details.lineNumber)} ${details.message}`)
    })
    window.webContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
      if (isMainFrame && code !== -3 && !quitting && !window.isDestroyed()) {
        reportFatal(new Error(`Desktop page failed to load: ${url} (${String(code)}: ${description})`), 'renderer')
      }
    })
    window.webContents.on('preload-error', (_event, _path, error) => {
      if (!quitting && !window.isDestroyed()) reportFatal(error, 'renderer')
    })
    window.webContents.on('render-process-gone', (_event, details) => {
      navigation = undefined
      if (!quitting && !window.isDestroyed() && details.reason !== 'clean-exit') {
        reportFatal(new Error(`Desktop renderer exited: ${details.reason}`), 'renderer')
      }
    })
    return window
  }
  const enterWorkspace = async ({ activate = true }: { activate?: boolean } = {}): Promise<void> => {
    if (quitting) return
    const window = mainWindow ?? createMainWindow()
    await navigateMain(applicationUrl)
    if (isQuitting() || recovery.active || window.isDestroyed()) return
    if (activate) window.show()
    else window.showInactive()
    enteredWorkspace = true
    if (welcomeWindow !== undefined) {
      welcomeWindow.close()
      window.webContents.send(DESKTOP_IPC.enterWorkspace)
    }
    welcomeWindow = undefined
    if (raiseAfterUpdate) {
      raiseAfterUpdate = false
      window.moveTop()
      window.focus()
    }
    if (activate && development && process.env.DSH_DESKTOP_OPEN_DEVTOOLS !== '0') {
      window.webContents.openDevTools({ mode: 'detach' })
    }
  }
  let openingWelcome: Promise<void> | undefined
  const showWelcome = (): Promise<void> => {
    if (skipWelcomeAtBoot() || quitting) return Promise.resolve()
    if (welcomeWindow !== undefined && !welcomeWindow.isDestroyed()) {
      if (!welcomeWindow.isVisible()) void track('auth_page_view', {})
      welcomeWindow.show()
      welcomeWindow.focus()
      return Promise.resolve()
    }
    openingWelcome ??= (async () => {
      welcomeWindow = await openWelcomeWindow(locale, {
        analytics: track,
        analyticsEnabled: () => Promise.resolve(analyticsEnabled),
        takeNotice: () => {
          const notice = pendingWelcomeNotice
          pendingWelcomeNotice = undefined
          return Promise.resolve(notice)
        },
        startSignIn: async () => {
          if (welcomeBackend === undefined) throw new Error('desktop welcome: backend unavailable')
          return welcomeBackend.account.start(desktopClientMetadata(locale.id))
        },
        cancelSignIn: async (id) => {
          if (welcomeBackend === undefined) throw new Error('desktop welcome: backend unavailable')
          return welcomeBackend.account.cancel(id)
        },
        copySignInLink: async (id) => {
          const state = await welcomeBackend?.account.state()
          if (state?.attempt?.id !== id || state.attempt.phase !== 'waiting-browser' || state.attempt.authorizeUrl === undefined) {
            throw new Error('desktop welcome: login link is unavailable')
          }
          await clipboard.writeText(platformLoginUrl(state.attempt.authorizeUrl))
        },
        saveApiKey: async (apiKey) => {
          if (backend.host === undefined || welcomeBackend === undefined) return { ok: false }
          const saved = await welcomeBackend.save(apiKey)
          if (!saved.ok) return saved
          await enterWorkspace()
          return { ok: true }
        },
        skip: enterWorkspace,
      })
      const window = welcomeWindow
      window.once('closed', () => {
        void welcomeBackend?.account.state().then((state) => {
          if (state.attempt !== null && !enteredWorkspace) return welcomeBackend?.account.cancel(state.attempt.id)
          return undefined
        }).catch(() => undefined)
      })
      window.once('closed', () => {
        if (welcomeWindow === window) welcomeWindow = undefined
        if (enteredWorkspace || recovery.active) return
        // Nothing runs before the workspace opens. macOS keeps the Dock convention and drops the
        // unused main window so the next activation rebuilds the welcome; elsewhere the close quits.
        if (process.platform === 'darwin') mainWindow?.destroy()
        else app.quit()
      })
      if (isQuitting() || recovery.active || enteredWorkspace) window.close()
      else mainWindow?.hide()
    })().finally(() => { openingWelcome = undefined })
    return openingWelcome
  }
  const openInitialWindow = async (): Promise<void> => {
    if (quitting || recovery.active) return
    const state = await readWelcomeState()
    if (isQuitting() || backend.state.phase !== 'ready') return
    locale = resolveDesktopStartupLocale(state.localePreference, systemLanguages)
    writeDesktopLocaleCache(app.getPath('userData'), locale.id)
    windowsLanguage = locale.id
    refreshApplicationMenu()
    if (!enteredWorkspace && shouldShowDeepSeekWelcome() && needsWelcome({ loggedIn: state.loggedIn, hasApiKey: state.hasApiKey })) {
      // A later login must retain its own activation policy instead of replaying startup focus.
      raiseAfterUpdate = false
      await showWelcome()
    } else {
      await enterWorkspace()
    }
  }
  focusPrimaryWindow = () => {
    if (quitting) return
    if (isMandatory()) { mandatoryUI?.focus(); return }
    const window = welcomeWindow ?? mainWindow
    if (window === undefined || window.isDestroyed()) {
      try { createMainWindow() } catch (error) { reportFatal(error, 'main'); return }
      void (backend.state.phase === 'ready' ? openInitialWindow() : navigateMain(applicationUrl)).catch((error: unknown) => { reportFatal(error, 'main') })
      return
    }
    // Startup and sign-out select the visible window before activation may reveal the workspace.
    if (window === mainWindow && !enteredWorkspace) return
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
  }

  if (app.isPackaged || process.env.DSH_DESKTOP_DEV_APP === '1') {
    app.setAsDefaultProtocolClient(PERSONA_PROTOCOL)
    app.setAsDefaultProtocolClient('dsh')
  }
  app.on('open-url', (event, url) => {
    event.preventDefault()
    if (url === 'dsh://open' || url === 'dsh://open/'
      || url === `${PERSONA_PROTOCOL}://open` || url === `${PERSONA_PROTOCOL}://open/`) {
      focusPrimaryWindow()
      return
    }
    const task = parsePersonaDeepLink(url)
    if (task !== undefined) openPersonaLink(url)
  })

  app.on('activate', (_event, hasVisibleWindows) => {
    if (!hasVisibleWindows) focusPrimaryWindow()
  })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
  if (process.platform !== 'win32') powerMonitor.on('shutdown', () => { sessionEnding = true })
  const finishQuit = (): void => {
    quitting = true
    shuttingDown = true
    updateJournal?.action('quit-requested')
    quitConfirmation.dispose()
    backgroundNotice?.dispose()
    tray?.dispose()
    stopAccount?.()
    if (welcomeWindow !== undefined && !welcomeWindow.isDestroyed()) welcomeWindow.hide()
    if (mainWindow !== undefined && !mainWindow.isDestroyed()) mainWindow.hide()
    updateSchedule.dispose()
    updateDialog.dispose()
    mandatoryUI?.dispose()
    void Promise.all([stopOperationReports(), Promise.resolve(mandatoryPolicy?.dispose()).then(() => policyAuth?.dispose()),
      backend.close().then(async () => { await operationJournal?.drain(500) }, async (error: unknown) => {
        await operationJournal?.drain(500)
        throw error
      }),
      platformView.dispose(),
      disposeFileDrag(),
    ].map(cleanup => cleanup.catch((error: unknown) => { console.error(error) })))
      .then(() => { app.quit() })
  }
  app.on('before-quit', (event) => {
    if (shellInstallerOwnsQuit) {
      shuttingDown = true
      quitConfirmation.dispose()
      backgroundNotice?.dispose()
      updateJournal?.action('quit-requested')
      tray?.dispose()
      updateDialog.dispose()
      mandatoryUI?.dispose()
      // Installation preparation already awaited Platform storage cleanup.
      void platformView.dispose().catch((error: unknown) => { console.error(error) })
      return
    }
    if (quitting) return
    event.preventDefault()
    if (skipQuitConfirmation || sessionEnding) { finishQuit(); return }
    void quitConfirmation.confirm().then((approved) => {
      if (quitting || shellInstallerOwnsQuit) return
      if (approved) { finishQuit(); return }
      // A quit that started from closing the welcome window destroyed it; a cancelled quit needs it back.
      if (!enteredWorkspace && !recovery.active && shouldShowDeepSeekWelcome()) {
        void showWelcome().catch((error: unknown) => { reportFatal(error, 'main') })
      }
    }).catch((error: unknown) => { console.error(error); if (!quitting && !shellInstallerOwnsQuit) finishQuit() })
  })

  mainWindow = createMainWindow()
  if (typeof manifest !== 'object' || manifest === null) throw new Error('desktop policy: invalid application manifest')
  const developmentPolicy = app.isPackaged ? undefined : process.env.DSH_DESKTOP_MANDATORY_UPDATE_CONFIG
  const policyInput: unknown = app.isPackaged
    ? ('dshMandatoryUpdatePolicy' in manifest ? manifest.dshMandatoryUpdatePolicy : undefined)
    : developmentPolicy === undefined ? undefined : JSON.parse(developmentPolicy) as unknown
  const policyConfig = skipUpdaterAtBoot() ? undefined : resolveDesktopPolicyConfig(policyInput, !app.isPackaged)
  if (policyConfig !== undefined) {
    if (policyConfig.authentication === 'feishu-test') {
      policyAuth = new DesktopPolicyTestAuth(policyConfig.origin, policyConfig.allowedAuthOrigins, locale,
        () => mandatoryUI?.confirmationWindow ?? currentDialogWindow(),
        (event) => { console.info(`desktop policy authentication: ${event}`); updateJournal?.action(`policy-login-${event}`) })
    }
    if (!['win32', 'darwin'].includes(process.platform) || !['x64', 'arm64'].includes(process.arch)) throw new Error('desktop policy: unsupported platform')
    let wasBlocking = false
    mandatoryPolicy = new DesktopMandatoryUpdatePolicy(policyConfig, {
      platform: process.platform as 'win32' | 'darwin', arch: process.arch as 'x64' | 'arm64',
      get channel() { return updates.selectedChannel },
      bundledDshVersion: app.isPackaged ? readDesktopRuntime(resources.dsh).release.version : app.getVersion(),
    }, (state) => {
      if (state.error !== 'authentication-required') policyAuthenticationQueued = false
      if (state.blocking) {
        for (const controller of ordinaryDialogs) controller.abort()
        if (!wasBlocking) updateDialog.cancel()
      }
      mandatoryUI?.sync()
      if (state.blocking && !wasBlocking) void updateSchedule.check(false, true).catch((error: unknown) => { console.error(error) })
      wasBlocking = state.blocking
    }, policyAuth?.request, () => desktopClientMetadata(locale.id))
    const policy = mandatoryPolicy
    mandatoryUI = new DesktopMandatoryUpdateWindow({
      overlays: updateOverlays,
      preload: fileURLToPath(new URL('./preload-mandatory.cjs', import.meta.url)), locale,
      allowedPageOrigins: policyConfig.allowedPageOrigins, parent: () => mainWindow,
      policy: () => policy.state, update: () => updates.state,
      refresh: async () => {
        if (channelState?.error !== undefined) await showConfigurationError()
        if (channelState?.error === undefined) await Promise.all([checkPolicyManually(), updateSchedule.check(true)])
      },
      download: downloadUpdate, install: version => updates.install(version),
    })
    void mandatoryPolicy.check('launch').then((state) => {
      if (app.isPackaged && state.error === 'authentication-required' && !isQuitting()) queuePolicyAuthentication()
    }).catch((error: unknown) => { console.error(error) })
  }
  automaticCheck()
  await reconcileBackend().catch(() => undefined)
  // Window lifecycle callbacks run while backend startup is pending.
  if (isQuitting()) return
  const window = currentMainWindow()
  if (window !== undefined && development && process.env.DSH_DESKTOP_OPEN_DEVTOOLS !== '0') {
    window.webContents.openDevTools({ mode: 'detach' })
  }
  publishUpdate(updateState)
}

const ownsDesktopInstance = claimDesktopSingleInstance(app, () => { focusPrimaryWindow() })

if (ownsDesktopInstance) void app.whenReady().then(main).catch(async (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(error)
  const diagnosticFile = process.env.DSH_DESKTOP_DIAGNOSTIC_FILE
  if (diagnosticFile !== undefined) {
    await writeFile(diagnosticFile, `${error instanceof Error ? error.stack ?? message : message}\n`).catch(() => undefined)
  }
  reportFatal(error, 'main')
}).catch(async (error: unknown) => {
  console.error(error)
  shuttingDown = true
  await stopOperationReports()
  app.exit(1)
})
