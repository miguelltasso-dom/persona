// Runs the persistent lister (lister.ps1) for real: it must print whole JSON lines of the machine's processes, fast, with stamps around each listing.
import { spawn } from 'node:child_process'
import { walkOwned } from './scan-core.mjs'

const lister = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', new URL('./lister.ps1', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1')], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
const listings = []
let pending = ''
const finish = (code) => { try { lister.kill() } catch { /* gone */ } process.exit(code) }
setTimeout(() => { console.log(`FAIL only ${String(listings.length)} listing(s) in 30 s`); finish(1) }, 30_000)
lister.stdout.on('data', (chunk) => {
  pending += chunk.toString()
  for (let newline = pending.indexOf('\n'); newline >= 0; newline = pending.indexOf('\n')) {
    const line = pending.slice(0, newline).trim()
    pending = pending.slice(newline + 1)
    if (line === '') continue
    let listing
    try { listing = JSON.parse(line) } catch (error) { console.log(`FAIL a line did not parse: ${String(error).slice(0, 100)}`); finish(1); return }
    listings.push(listing)
    if (listings.length === 4) {
      const rows = listings.map(item => [].concat(item.rows).length)
      const spans = listings.map(item => item.to - item.from)
      const gaps = listings.slice(1).map((item, index) => item.from - listings[index].to)
      const mine = walkOwned([].concat(listings[3].rows), { rootPid: process.pid, startedAtMs: Date.now() - 600_000, known: new Map() })
      console.log(JSON.stringify({ rows, listingMs: spans, gapBetweenMs: gaps, thisTestProcessSeen: mine.has(process.pid) }))
      finish(rows.every(count => count > 50) && spans.every(ms => ms < 10_000) ? 0 : 1)
    }
  }
})
