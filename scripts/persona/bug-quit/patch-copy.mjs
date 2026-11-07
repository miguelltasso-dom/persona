// Measurement tooling for BUG-QUIT-1 (not product). Patches a COPY of win-unpacked/resources/app/lib/main.js:
//  - always: diagnostics file with the WebContents / windows that still exist around the quit (RIVET_DIAG_FILE)
//  - RIVET_MITIGATE=1: the same mitigation as apps/desktop/src/main.ts (watchdog from quit-watchdog.ts + app.exit(0) after cleanup)
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'

const target = process.argv[2]
const watchdogSource = process.argv[3]
if (!target || !watchdogSource) throw new Error('usage: patch-copy.mjs <main.js> <quit-watchdog.ts>')
const backup = `${target}.orig`
if (!existsSync(backup)) copyFileSync(target, backup)
let code = readFileSync(backup, 'utf8')

const stripped = stripTypeScriptTypes(readFileSync(watchdogSource, 'utf8'), { mode: 'strip' })
const watchdog = stripped
  .split('\n')
  .filter(line => !line.startsWith('import '))
  .join('\n')
  .replaceAll('export function ', 'function ')
  .replaceAll('export const ', 'const ')

const helpers = `
//#region rivet bug-quit diagnostics
${watchdog}
function rivetLog(label, extra) {
	try {
		const file = process.env.RIVET_DIAG_FILE || ((process.env.TEMP || "/tmp") + "/persona-quit-diag.log");
		const wcs = electron.webContents.getAllWebContents().map((w) => ({ id: w.id, type: w.getType(), destroyed: w.isDestroyed(), osPid: w.isDestroyed() ? 0 : w.getOSProcessId(), url: w.isDestroyed() ? "" : String(w.getURL()).slice(0, 70) }));
		const wins = BrowserWindow.getAllWindows().map((w) => ({ id: w.id, destroyed: w.isDestroyed(), visible: w.isDestroyed() ? false : w.isVisible() }));
		appendFileSync(file, JSON.stringify({ t: Date.now(), pid: process.pid, label, wcs, wins, extra }) + String.fromCharCode(10));
	} catch (error) { try { appendFileSync(((process.env.TEMP || "/tmp") + "/persona-quit-diag.err"), String(error) + String.fromCharCode(10)); } catch {} }
}
let rivetInstalled = false;
function rivetInstall() {
	if (rivetInstalled) return;
	rivetInstalled = true;
	for (const name of ["before-quit", "will-quit", "quit", "window-all-closed"]) app.on(name, () => rivetLog("event:" + name));
	app.on("browser-window-created", (_event, win) => rivetLog("window-created", { id: win.id }));
	setInterval(() => rivetLog("tick"), 2000);
}
async function rivetEnd() {
	try {
		await Promise.race([Promise.all([session.defaultSession.cookies.flushStore(), Promise.resolve(session.defaultSession.flushStorageData())]), new Promise((resolve) => { setTimeout(resolve, 1500); })]);
	} catch (error) { console.error(error); }
	try { app.emit("will-quit", { preventDefault: () => void 0 }); } catch (error) { console.error(error); }
	rivetLog("exit-0");
	app.exit(0);
}
//#endregion
`

const anchorStart = 'const finishQuit = () => {\n'
if (!code.includes(anchorStart)) throw new Error('finishQuit anchor not found')
code = code.replace(anchorStart, `${anchorStart}\t\trivetInstall();\n\t\trivetLog("finishQuit");\n\t\tif (process.env.RIVET_MITIGATE === "1" || process.env.RIVET_WATCHDOG_ONLY === "1") armQuitWatchdog({ pid: process.pid, execPath: process.execPath });\n`)

const anchorEnd = '}))).then(() => {\n\t\t\tapp.quit();\n\t\t});'
if (!code.includes(anchorEnd)) throw new Error('quit anchor not found')
code = code.replace(anchorEnd, '}))).then(() => {\n\t\t\trivetLog("cleanup-done");\n\t\t\tif (process.env.RIVET_MITIGATE === "1") return rivetEnd();\n\t\t\tapp.quit();\n\t\t});')

// Lead from the diagnostics: window id 1 is the computer-use overlay (transparent, screen-saver level, visible at idle, rAF loop forever).
//  RIVET_NO_OVERLAY=1    -> the overlay is never created
//  RIVET_CLOSE_OVERLAY=1 -> finishQuit closes it (computerUseBind.close()) like every other subsystem it disposes
const overlayAnchor = 'const overlays = host.createWindow === void 0 ? void 0 :'
if (!code.includes(overlayAnchor)) throw new Error('overlay anchor not found')
code = code.replace(overlayAnchor, 'const overlays = host.createWindow === void 0 || process.env.RIVET_NO_OVERLAY === "1" ? void 0 :')
code = code.replace('\t\trivetLog("finishQuit");\n', '\t\trivetLog("finishQuit");\n\t\tif (process.env.RIVET_CLOSE_OVERLAY === "1") { try { computerUseBind?.close(); rivetLog("overlay-closed"); } catch (error) { console.error(error); } }\n')
if (!code.includes('RIVET_CLOSE_OVERLAY')) throw new Error('close-overlay anchor not applied')

// Where the time before finishQuit goes: the first before-quit (the request), and the answer of the confirmation (the host's inspectQuit).
const beforeQuit = 'app.on("before-quit", (event) => {\n'
if (!code.includes(beforeQuit)) throw new Error('before-quit anchor not found')
code = code.replace(beforeQuit, `${beforeQuit}\t\trivetLog("before-quit-enter");\n`)
const approvedAnchor = 'quitConfirmation.confirm().then((approved) => {\n'
if (!code.includes(approvedAnchor)) throw new Error('confirmation anchor not found')
code = code.replace(approvedAnchor, `${approvedAnchor}\t\t\trivetLog("confirmation-answered", { approved });\n`)

code += helpers
writeFileSync(target, code)
console.log('patched', target, 'bytes', code.length)
