// BUG-QUIT-1: how long until the LAST process of the app is gone after each way a person leaves it, and what is left over.
// usage: node bug-quit.mjs <exe> <outDir> <method: window-close | app-quit | taskkill-soft>
//   window-close  : WM_CLOSE to the app (what the X button and Alt+F4 send). By design this HIDES the window (the tray keeps the app alive).
//   app-quit      : app.quit() (what the tray "Sair" and the app menu "Sair" call); the native confirmation is answered by this script.
//   taskkill-soft : taskkill /PID <root> without /F (what "End task" and installers send first).
// SAFETY: only the processes of THIS launch are ever looked at or touched. They are tracked by PID + creation time, starting from the pid we
// spawned and following descendants; another instance of the same executable (another builder's run) is never selected, and no process outside
// the recorded set is ever signalled. The only end-of-run cleanup is `process.kill` on recorded survivors of this launch.
import { spawn, spawnSync } from 'node:child_process'
import { appendFileSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve as resolvePath } from 'node:path'
import { walkOwned } from './scan-core.mjs'

const clean = process.argv.includes('--clean')
// --turn: onboarding + the first delivery against the fake CLI with a LONG turn, so a CLI process is mid-turn when "Sair" is asked (implies --fake-cli).
const withTurn = process.argv.includes('--turn')
const fakeCli = process.argv.includes('--fake-cli') || withTurn
const [exeArg, outArg, method = 'app-quit'] = process.argv.slice(2).filter(item => item !== '--turn' && item !== '--probe-overlay' && item !== '--fake-cli' && item !== '--detach' && item !== '--clean' && item !== '--chromium-log' && item !== '--no-cdp' && item !== '--relaunch')
if (exeArg === undefined || outArg === undefined) { console.log('usage: node bug-quit.mjs <exe> <outDir> <window-close|app-quit|taskkill-soft>'); process.exit(2) }
mkdirSync(outArg, { recursive: true })
const freePort = () => new Promise((resolve, reject) => {
  const server = createServer()
  server.once('error', reject)
  server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => resolve(port)) })
})
/** The faithful stubs of packages/persona/persona-e2e/fixtures/fake-cli, so detection and any turn spawn real child processes without a model. */
function fakeCliEnv() {
  const dir = join(import.meta.dirname, '..', '..', '..', 'packages', 'persona', 'persona-e2e', 'fixtures', 'fake-cli')
  // Same pins as persona-e2e `withFakeCliOnPath` (Probe's flow). The installed app rebuilds its PATH from the person's login shell, so a PATH prefix alone does not
  // put the stub in front of anything: `PERSONA_E2E_EXTRA_PATH` is the one thing it prefixes AFTER that merge (apps/desktop/src/main.ts `withPersonaE2ePath`), and the
  // OAR_<TOOL>_BIN pins make a real engine unreachable. A run that detected the person's REAL `claude` would look like a stub that never got the turn.
  return { PATH: `${dir}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`, PERSONA_E2E_EXTRA_PATH: dir,
    OAR_CLAUDE_BIN: join(dir, 'claude.cmd'), OAR_CODEX_BIN: join(dir, 'codex.cmd'), OAR_OPENCODE_BIN: join(dir, 'opencode.cmd'), FAKE_CLI_REPLY: 'resposta do stub',
    ...(withTurn ? { FAKE_CLI_TURN_MS: '600000', FAKE_CLI_LOG: resolvePath(outArg, 'fake-cli.log') } : {}) }
}
const inspectPort = await freePort()
const cdpPort = await freePort()
const home = mkdtempSync(join(tmpdir(), 'persona-quit-'))
const DIALOG_FILE = join(outArg, `dialogs-${method}.jsonl`).split(String.fromCharCode(92)).join('/')
const t0 = Date.now()
const events = []
const note = (name, extra = {}) => { const row = { at: Date.now() - t0, name, ...extra }; events.push(row); console.log(JSON.stringify(row)) }
const noInspector = method === 'cdp-browser-close'
const noCdp = process.argv.includes('--no-cdp')
const chromiumLog = process.argv.includes('--chromium-log')
const child = spawn(exeArg, [...(noInspector ? [] : [`--inspect=${inspectPort}`]), ...(noCdp ? [] : [`--remote-debugging-port=${cdpPort}`]), ...(chromiumLog ? ['--enable-logging=stderr', '--v=1'] : [])], {
  windowsHide: false,
  env: {
    ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !['ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS', 'NODE_PATH', 'VITEST'].includes(name))),
    PERSONA_HOME: join(home, 'home'), DSH_HOME: join(home, 'home'), DSH_PROFILE: 'persona',
    DSH_DESKTOP_USER_DATA_DIR: join(home, 'user'), DSH_TELEMETRY_DISABLED: '1', DSH_DESKTOP_WELCOME: '0', DSH_DESKTOP_UPDATES: '0',
    ...(fakeCli ? fakeCliEnv() : {}),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
const log = []
child.stdout.on('data', chunk => { log.push(chunk.toString()); try { appendFileSync(join(outArg, 'app-stdio.log'), chunk) } catch { /* best effort */ } })
child.stderr.on('data', chunk => { log.push(chunk.toString()); try { appendFileSync(join(outArg, 'app-stdio.log'), chunk) } catch { /* best effort */ } })
let rootExitedAt
child.once('exit', () => { rootExitedAt = Date.now() })

async function waitFor(fn, ms, step = 100) {
  const end = Date.now() + ms
  for (;;) {
    try { const value = await fn(); if (value) return value } catch { /* not yet */ }
    if (Date.now() > end) return undefined
    await new Promise(resolve => setTimeout(resolve, step))
  }
}

/** pid -> { ppid, name, cmd, created }: this launch's processes seen so far (descendants of the spawned root, followed even after re-parenting). */
const known = new Map()

/**
 * A PERSISTENT PowerShell lister (lister.ps1) prints one machine-wide listing after another, each stamped with the instants right before and after it
 * was taken. A fresh PowerShell per reading cost 1-2 s of resolution on a loaded machine; this one starts once. Read-only.
 */
let lister
let latestListing
let listingWaiters = []
function startLister() {
  if (lister !== undefined) return
  lister = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', join(import.meta.dirname, 'lister.ps1')], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
  let pending = ''
  lister.stdout.on('data', (chunk) => {
    pending += chunk.toString()
    for (let newline = pending.indexOf('\n'); newline >= 0; newline = pending.indexOf('\n')) {
      const line = pending.slice(0, newline).trim()
      pending = pending.slice(newline + 1)
      if (line === '') continue
      try {
        const listing = JSON.parse(line)
        listing.rows = [].concat(listing.rows ?? [])
        if (listing.rows.length === 0) continue
        latestListing = listing
        for (const waiter of listingWaiters.splice(0)) waiter(listing)
      } catch { /* a partial line: the next one is whole */ }
    }
  })
}
function stopLister() { try { lister?.kill() } catch { /* gone */ } }

/** The first listing that STARTED after `atMs`: its snapshot is entirely after that instant. */
function listingAfter(atMs, timeoutMs = 30_000) {
  startLister()
  if (latestListing !== undefined && latestListing.from >= atMs) return Promise.resolve(latestListing)
  return new Promise((resolveListing, rejectListing) => {
    const timer = setTimeout(() => rejectListing(new Error('process listing did not come back: the numbers of this run cannot be trusted')), timeoutMs)
    const waiter = (listing) => {
      if (listing.from < atMs) { listingWaiters.push(waiter); return }
      clearTimeout(timer)
      resolveListing(listing)
    }
    listingWaiters.push(waiter)
  })
}

/** The listing the last scan() was made from: its snapshot lies between `from` and `to` (unix ms). */
let lastListing

/** One scan: the processes of THIS launch right now (ownership proven by walkOwned, never assumed). A listing that did not come back is an error, never "no processes". */
async function scan() {
  const listing = await listingAfter(Date.now())
  lastListing = listing
  return [...walkOwned(listing.rows, { rootPid: child.pid, startedAtMs: t0, known }).values()]
}

/**
 * D-093: the first painted frame must already be the splash (never a blank/white window). From spawn: wait for the first renderer target, then read
 * its paint timing (absolute, relative to the spawn instant), what it shows, and keep a screenshot.
 */
const spawnedAt = Date.now()
async function probeFirstFrame() {
  const target = await waitFor(async () => (await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json()).find(item => item.type === 'page'), 120_000, 40)
  if (target === undefined) return { error: 'no renderer target' }
  const foundAt = Date.now() - spawnedAt
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error('page socket')) })
  let n = 0
  const waiters = new Map()
  ws.onmessage = event => { const m = JSON.parse(event.data); const w = m.id === undefined ? undefined : waiters.get(m.id); if (w) { waiters.delete(m.id); w(m.result) } }
  const call = (name, params = {}) => new Promise((resolve) => { const id = ++n; waiters.set(id, resolve); ws.send(JSON.stringify({ id, method: name, params })) })
  let shot
  let paint
  for (let attempt = 0; attempt < 6000 && paint === undefined; attempt += 1) {
    const got = await call('Runtime.evaluate', { returnByValue: true, expression: `(() => {
      const entries = performance.getEntriesByType('paint').map(p => [p.name, Math.round(p.startTime)])
      if (entries.length === 0) return null
      const body = document.body
      return { entries, timeOrigin: performance.timeOrigin, url: location.href.split('?')[0], bootNodes: document.querySelectorAll('[data-dsh-boot]').length,
        bg: body ? getComputedStyle(body).backgroundColor : null, text: body ? body.innerText.split(String.fromCharCode(10)).join(' ').slice(0, 80) : null, hasRoot: Boolean(document.querySelector('#root')) } })()` })
    if (got?.result?.value) { paint = got.result.value; break }
    await new Promise(resolve => setTimeout(resolve, 30))
  }
  if (paint !== undefined) {
    const png = await call('Page.captureScreenshot', { format: 'png' })
    if (png?.data) { shot = join(outArg, 'first-frame.png'); writeFileSync(shot, Buffer.from(png.data, 'base64')) }
  }
  ws.close()
  const firstPaint = paint?.entries.find(row => row[0] === 'first-paint')?.[1]
  const firstContentful = paint?.entries.find(row => row[0] === 'first-contentful-paint')?.[1]
  return { targetFoundAfterMs: foundAt, firstPaintAfterSpawnMs: firstPaint === undefined ? null : Math.round(paint.timeOrigin + firstPaint - spawnedAt),
    firstContentfulPaintAfterSpawnMs: firstContentful === undefined ? null : Math.round(paint.timeOrigin + firstContentful - spawnedAt),
    ...(paint ?? {}), screenshot: shot }
}
const firstFrame = noCdp ? Promise.resolve({ skipped: 'no CDP' }) : probeFirstFrame().catch(error => ({ error: String(error) }))

/** CPU time over 3 s and the wait state of each thread of THE ROOT process we spawned: busy loop, or blocked waiting on something. */
function osThreadView(pid) {
  const script = `
$p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue
if (-not $p) { '{"gone":true}'; exit }
$t0 = $p.TotalProcessorTime.TotalMilliseconds
Start-Sleep -Seconds 3
$p.Refresh()
$t1 = $p.TotalProcessorTime.TotalMilliseconds
$threads = @($p.Threads | ForEach-Object { [pscustomobject]@{ state = [string]$_.ThreadState; wait = [string]$_.WaitReason } })
$groups = $threads | Group-Object state,wait | ForEach-Object { [pscustomobject]@{ k = $_.Name; n = $_.Count } }
[pscustomobject]@{ cpuMsIn3s = [math]::Round($t1 - $t0); threads = $threads.Count; groups = @($groups); workingSetMB = [math]::Round($p.WorkingSet64 / 1MB) } | ConvertTo-Json -Compress -Depth 4`
  const run = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', windowsHide: true, timeout: 30_000 })
  try { return JSON.parse((run.stdout ?? '').trim()) } catch { return { error: (run.stdout + run.stderr).slice(0, 200) } }
}

let main
let report
try {
  const endpoint = noInspector ? undefined : await waitFor(async () => (await (await fetch(`http://127.0.0.1:${inspectPort}/json/list`)).json())[0]?.webSocketDebuggerUrl, 60_000, 100)
  if (!noInspector && !endpoint) throw new Error('main inspector not reachable')
  const socket = noInspector ? { send() { throw new Error('no node inspector in this mode') }, close() {} } : new WebSocket(endpoint)
  if (!noInspector) await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = () => reject(new Error('socket')) })
  let seq = 0
  const pending = new Map()
  if (!noInspector) socket.onmessage = event => { const m = JSON.parse(event.data); const w = m.id === undefined ? undefined : pending.get(m.id); if (w) { pending.delete(m.id); m.error ? w.reject(new Error(m.error.message)) : w.resolve(m.result) } }
  const request = (name, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`inspector deadline: ${name} (main gone?)`)) }, 8000)
    pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value) }, reject: error => { clearTimeout(timer); reject(error) } })
    socket.send(JSON.stringify({ id, method: name, params }))
  })
  main = { request, close: () => socket.close() }
  if (!noInspector) await main.request('Runtime.enable')

  const mounted = noCdp ? await new Promise(resolve => setTimeout(() => resolve(true), 30_000)) : await waitFor(async () => {
    const pages = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json()
    const page = pages.find(item => String(item.url).startsWith('dsh-app://app'))
    if (!page) return false
    const ws = new WebSocket(page.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error('page socket')) })
    const answer = await new Promise((resolve) => {
      ws.onmessage = event => { const m = JSON.parse(event.data); if (m.id === 1) resolve(m.result?.result?.value) }
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: "Boolean(document.querySelector('[data-persona-shell]'))", returnByValue: true } }))
    })
    ws.close()
    return answer === true
  }, 180_000, 250)
  note(mounted ? 'app-mounted' : 'mount-timeout')
  await new Promise(resolve => setTimeout(resolve, 3000)) // let the host settle
  const before = await scan()
  note('processes-before', { count: before.length, names: before.map(item => item.name) })
  if (withTurn) {
    const repoRoot = join(import.meta.dirname, '..', '..', '..')
    const driven = spawnSync(process.execPath, ['--import', 'tsx/esm', join(import.meta.dirname, 'turn-driver.mjs'), String(cdpPort), resolvePath(outArg, 'fake-cli.log')],
      { encoding: 'utf8', timeout: 300_000, windowsHide: true, cwd: repoRoot })
    note('turn-driver', { status: driven.status, out: String(driven.stdout ?? '').trim().slice(-400), err: String(driven.stderr ?? '').trim().slice(-400) })
    await new Promise(resolve => setTimeout(resolve, 2000))
    const during = await scan()
    note('processes-with-turn', { count: during.length, names: during.map(item => `${item.name}${/claude|fake-cli/iu.test(item.cmd ?? '') ? '(cli)' : ''}`) })
  }

  // --probe-overlay: does the overlay window take the mouse or the keyboard from the person? (window styles, who owns the pixel under it, who
  // is foreground, whether the global Devolver chord is held). Read-only: nothing is clicked or typed.
  if (process.argv.includes('--probe-overlay') && !noInspector) {
    const raw = await main.request('Runtime.evaluate', { returnByValue: true, expression: `(() => { const e = process.getBuiltinModule('node:module').createRequire(process.execPath)('electron'); return JSON.stringify({ chordHeld: e.globalShortcut.isRegistered('CommandOrControl+Shift+Space'), windows: e.BrowserWindow.getAllWindows().map(w => ({ id: w.id, kind: String(w.webContents.getURL()).startsWith('data:') ? 'overlay' : 'app', hwnd: w.getNativeWindowHandle().readBigUInt64LE(0).toString(), bounds: w.getBounds(), focusable: w.isFocusable(), topmost: w.isAlwaysOnTop(), visible: w.isVisible(), focused: w.isFocused() })) }) })()` })
    const fromMain = JSON.parse(raw.result?.value ?? 'null')
    const ran = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', join(import.meta.dirname, 'overlay-probe.ps1')],
      { encoding: 'utf8', windowsHide: true, timeout: 30_000, env: { ...process.env, PROBE_JSON: JSON.stringify(fromMain) } })
    let os
    try { os = JSON.parse(String(ran.stdout).trim()) } catch { os = { error: (String(ran.stdout) + String(ran.stderr)).slice(0, 400) } }
    const probe = { fromMain, os }
    writeFileSync(join(outArg, 'overlay-probe.json'), `${JSON.stringify(probe, null, 1)}\n`)
    note('overlay-probe', { chordHeld: fromMain?.chordHeld, windows: fromMain?.windows?.map(w => ({ id: w.id, kind: w.kind, focusable: w.focusable, topmost: w.topmost, visible: w.visible, focused: w.focused })), styles: os.windows, pixelOwners: os.points?.map(p => `${p.kind}/${p.where}: ${p.owner.process}${p.owner.hwnd === fromMain.windows.find(w => w.id === p.window)?.hwnd ? ' (the window itself)' : ''}`), foreground: os.foreground })
  }

  // Answer the native quit confirmation ourselves and record what it said (the real one is a modal nobody is there to click).
  if (!noInspector) await main.request('Runtime.evaluate', {
    expression: `(() => { const dialog = process.getBuiltinModule('node:module').createRequire(process.execPath)('electron').dialog; globalThis.__dialogs = []; dialog.showMessageBox = async (...args) => { const o = args.at(-1); globalThis.__dialogs.push({ at: Date.now(), message: o.message, detail: o.detail, buttons: o.buttons }); process.getBuiltinModule('node:fs').appendFileSync('${DIALOG_FILE}', JSON.stringify({ at: Date.now(), message: o.message, detail: o.detail, buttons: o.buttons }) + String.fromCharCode(10)); return { response: 0, checkboxChecked: false } }; return 'dialog patched' })()`,
    returnByValue: true,
  })

  // Trace the shutdown from inside the main (listeners + sync wrappers write one line each, synchronously, so the LAST line is where it stalled).
  const traceFile = join(outArg, `trace-${method}.log`).split(String.fromCharCode(92)).join('/')
  const traced = noInspector || clean ? 'skipped (clean run)' : await main.request('Runtime.evaluate', { returnByValue: true, expression: `(() => {
    const fs = process.getBuiltinModule('node:fs'); const FILE = '${traceFile}'; fs.writeFileSync(FILE, '');
    const log = (m) => fs.appendFileSync(FILE, Date.now() + ' ' + m + String.fromCharCode(10));
    const e = process.getBuiltinModule('node:module').createRequire(process.execPath)('electron');
    for (const ev of ['before-quit', 'will-quit', 'quit', 'window-all-closed']) e.app.on(ev, () => log('app:' + ev));
    for (const w of e.BrowserWindow.getAllWindows()) { for (const ev of ['close', 'closed', 'hide']) w.on(ev, () => log('win:' + ev)) }
    const sqlite = process.getBuiltinModule('node:sqlite'); const origExec = sqlite.DatabaseSync.prototype.exec;
    sqlite.DatabaseSync.prototype.exec = function (sql) { log('sqlite.exec begin ' + String(sql).slice(0, 50)); try { return origExec.apply(this, arguments) } finally { log('sqlite.exec end') } };
    const cp = process.getBuiltinModule('node:child_process');
    for (const k of ['spawnSync', 'execSync', 'execFileSync']) { const o = cp[k]; cp[k] = function () { log(k + ' ' + String(arguments[0]).slice(0, 80)); try { return o.apply(this, arguments) } finally { log(k + ' returned') } } }
    for (const k of ['execFile', 'spawn']) { const o = cp[k]; cp[k] = function () { log(k + ' ' + String(arguments[0]).slice(0, 60) + ' ' + String(Array.isArray(arguments[1]) ? arguments[1].join(' ') : '').slice(0, 60)); return o.apply(this, arguments) } }
    process.getBuiltinModule('node:module').syncBuiltinESMExports();
    process.on('exit', (code) => log('process:exit ' + code));
    log('trace installed');
    return 'traced';
  })()` }).then(r => r.result?.value ?? r.exceptionDetails?.exception?.description).catch(error => String(error))
  note('trace', { traced })
  const startedAt = Date.now()
  if (method === 'cdp-browser-close') {
    const version = await (await fetch(`http://127.0.0.1:${cdpPort}/json/version`)).json()
    const ws = new WebSocket(version.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error('browser socket')) })
    ws.send(JSON.stringify({ id: 1, method: 'Browser.close' }))
    note('Browser.close sent (CDP, no node inspector)')
    setTimeout(() => { try { ws.close() } catch { /* done */ } }, 500)
  } else if (method === 'window-close' || method === 'taskkill-soft') {
    // taskkill WITHOUT /F posts WM_CLOSE to the windows of that one pid: exactly what the X button does.
    const hit = spawnSync('taskkill', ['/PID', String(child.pid)], { encoding: 'utf8', windowsHide: true })
    note(method === 'window-close' ? 'WM_CLOSE sent (taskkill /PID, no /F)' : 'taskkill soft sent', { out: (hit.stdout + hit.stderr).trim().slice(0, 140) })
  } else {
    const asked = await main.request('Runtime.evaluate', { expression: "(() => { process.getBuiltinModule('node:module').createRequire(process.execPath)('electron').app.quit(); return 'quit requested' })()", returnByValue: true })
    if (asked.exceptionDetails) throw new Error('quit evaluate failed: ' + (asked.exceptionDetails.exception?.description ?? asked.exceptionDetails.text))
    note('app.quit() requested')
    // --detach: a debugger session left connected can itself keep a Node/Electron process alive after exit; let go of it and watch the OS only.
    if (process.argv.includes('--detach')) { await new Promise(resolve => setTimeout(resolve, 150)); main.close(); note('inspector detached') }
  }

  const mainPulse = []
  const pulse = noInspector || clean ? Promise.resolve() : (async () => {
    let misses = 0
    while (misses < 3 && Date.now() - startedAt < 40_000) {
      const at = Date.now() - startedAt
      const state = await main.request('Runtime.evaluate', { returnByValue: true, expression: "(() => { const e = process.getBuiltinModule('node:module').createRequire(process.execPath)('electron'); return JSON.stringify({ windows: e.BrowserWindow.getAllWindows().map(w => w.isDestroyed() ? 'destroyed' : (w.isVisible() ? 'visible' : 'hidden')), uptimeS: Math.round(process.uptime()) }) })()" })
        .then(r => JSON.parse(r.result?.value ?? 'null')).catch(error => ({ timeout: String(error).slice(0, 60) }))
      if (state && state.timeout) misses += 1; else misses = 0
      mainPulse.push({ at, ...state })
      await new Promise(resolve => setTimeout(resolve, 250))
    }
  })()
  const timeline = []
  let lastCount = -1
  let detail10
  let inspectedAt10
  let osView
  let liveness
  const deadline = startedAt + (method === 'window-close' ? 15_000 : 60_000)
  for (;;) {
    const alive = await scan()
    // The snapshot lies between the instants the persistent lister stamped right before and after the machine-wide listing. The END (`afterMs`) is
    // what counts: a result is never flattered by the time the listing began. `fromMs` is kept so the interval is visible.
    const now = Date.now()
    if (alive.length !== lastCount) {
      timeline.push({ fromMs: lastListing.from - startedAt, afterMs: lastListing.to - startedAt, count: alive.length, names: [...new Set(alive.map(item => item.name))], rootExited: rootExitedAt !== undefined })
      lastCount = alive.length
      writeFileSync(join(outArg, `quit-${method}.timeline.json`), JSON.stringify(timeline, null, 1))
    }
    if (detail10 === undefined && now - startedAt >= 10_000 && alive.length > 0) detail10 = alive
    if (osView === undefined && now - startedAt >= 10_000 && alive.length > 0 && rootExitedAt === undefined) osView = osThreadView(child.pid)
    if (liveness === undefined && now - startedAt >= 10_000 && alive.length > 0 && rootExitedAt === undefined) {
      const quick = async (url) => { try { const r = await fetch(url, { signal: AbortSignal.timeout(4000) }); return `${r.status} ${(await r.text()).slice(0, 60).split(String.fromCharCode(10)).join(' ')}` } catch (error) { return `no answer (${String(error?.name ?? error).slice(0, 40)})` } }
      liveness = { browserDevtools: await quick(`http://127.0.0.1:${cdpPort}/json/version`), mainInspectorList: await quick(`http://127.0.0.1:${inspectPort}/json/list`), inspectorSocketState: main ? 'see error above' : 'none' }
    }
    if (!clean && inspectedAt10 === undefined && now - startedAt >= 10_000 && alive.length > 0 && method === 'app-quit') {
      // what keeps the MAIN process alive: windows left, active libuv resources/handles (the main may still answer the inspector)
      inspectedAt10 = await main.request('Runtime.evaluate', { returnByValue: true, expression: "(() => { const e = process.getBuiltinModule('node:module').createRequire(process.execPath)('electron'); const count = (list) => list.reduce((m, k) => { m[k] = (m[k] || 0) + 1; return m }, {}); return JSON.stringify({ uptimeS: Math.round(process.uptime()), windows: e.BrowserWindow.getAllWindows().map(w => ({ visible: w.isVisible(), destroyed: w.isDestroyed(), url: w.isDestroyed() ? '' : w.webContents.getURL().split('?')[0].slice(0, 60) })), resources: count(process.getActiveResourcesInfo()), handles: count(process._getActiveHandles().map(h => h && h.constructor ? h.constructor.name : typeof h)), ready: e.app.isReady() }) })()" }).then(r => JSON.parse(r.result?.value ?? 'null')).catch(error => ({ inspectorError: String(error).slice(0, 160) }))
    }
    if (alive.length === 0 || now > deadline) break
    await new Promise(resolve => setTimeout(resolve, 600))
  }
  await pulse
  // --relaunch: what the person sees when they open Persona again while the old process is still there (same user-data dir = same single-instance lock).
  let relaunch
  if (process.argv.includes('--relaunch') && (timeline.at(-1)?.count ?? 0) > 0) {
    const second = spawn(exeArg, [], { windowsHide: false, stdio: 'ignore', env: { ...child.spawnargs ? process.env : process.env, PERSONA_HOME: join(home, 'home'), DSH_HOME: join(home, 'home'), DSH_PROFILE: 'persona', DSH_DESKTOP_USER_DATA_DIR: join(home, 'user'), DSH_TELEMETRY_DISABLED: '1', DSH_DESKTOP_WELCOME: '0', DSH_DESKTOP_UPDATES: '0' } })
    const at = Date.now()
    const result = await Promise.race([new Promise(resolve => second.once('exit', code => resolve({ exitedAfterMs: Date.now() - at, code }))), new Promise(resolve => setTimeout(() => resolve({ stillRunningAfterMs: 20_000 }), 20_000))])
    relaunch = { ...result, note: result.exitedAfterMs !== undefined ? 'the second launch handed over to the old instance and quit: nothing new appears for the person' : 'the second launch is running (it got its own instance)' }
    if (result.stillRunningAfterMs !== undefined) { try { process.kill(second.pid) } catch { /* gone */ } }
  }
  const dialogs = (() => { try { return readFileSync(join(outArg, `dialogs-${method}.jsonl`), 'utf8').split(String.fromCharCode(10)).filter(Boolean).map(line => JSON.parse(line)) } catch { return [] } })()
  const last = timeline.at(-1)
  report = {
    method, exe: exeArg, firstFrame: await Promise.race([firstFrame, new Promise(resolve => setTimeout(() => resolve({ error: 'no first paint seen' }), 2000))]),
    outcome: last?.count === 0 ? 'all processes gone' : method === 'window-close' ? 'app still running (hidden to tray by design)' : 'processes still alive',
    endedAfterMs: last?.count === 0 ? last.afterMs : null,
    /** Exact (the child's own exit event): when the root process left, measured from the quit request. */
    rootExitedAfterMs: rootExitedAt === undefined ? null : rootExitedAt - startedAt,
    timeline, survivorsAt10s: detail10 ?? [], mainInspectedAt10s: inspectedAt10 ?? null, rootProcessOsView: osView ?? null, traceTail: (() => { try { return readFileSync(join(outArg, `trace-${method}.log`), 'utf8').split(String.fromCharCode(10)).filter(Boolean).slice(-40) } catch { return [] } })(), liveness: liveness ?? null, mainPulse, relaunch: relaunch ?? null, events, dialogs,
    processesBefore: before.map(item => ({ name: item.name, cmd: item.cmd })),
  }
} catch (error) {
  report = { method, error: String(error?.stack ?? error).slice(0, 800) }
} finally {
  // Cleanup: only recorded processes of this launch that are still running.
  let survivors = []
  let cleanupError
  try { survivors = await scan() } catch (error) { cleanupError = String(error).slice(0, 200) }
  report = { ...(report ?? {}), cleanedUp: survivors.map(item => ({ pid: item.pid, name: item.name })), ...(cleanupError === undefined ? {} : { cleanupError }) }
  for (const item of survivors) { try { process.kill(item.pid) } catch { /* already gone */ } }
  try { main?.close() } catch { /* done */ }
  stopLister()
  writeFileSync(join(outArg, `quit-${method}.json`), `${JSON.stringify(report, null, 2)}\n`)
  writeFileSync(join(outArg, `quit-${method}.log`), log.join('').replace(/([?&]token=)[^\s]+/gu, '$1[redacted]'))
  console.log(JSON.stringify({ method, outcome: report.outcome, endedAfterMs: report.endedAfterMs, dialogs: report.dialogs, timeline: report.timeline, cleanedUp: report.cleanedUp }, null, 1))
}
