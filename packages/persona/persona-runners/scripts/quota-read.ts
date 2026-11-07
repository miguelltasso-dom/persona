/**
 * Read the OFFICIAL quota of the Claude account (the windows the vendor publishes: 5 hours, week, per model) — read only, ZERO model call,
 * zero spend. It answers "how much of the window is used right now" so that a spend can be put as a share of the window (D-092: a subscription
 * account never shows dollars, it shows the impact on the quota). Prints the windows' ids, used percent and reset instants; never the account
 * name or email.
 *
 *   node --import tsx/esm packages/persona/persona-runners/scripts/quota-read.ts [--label before|after] [--out <file.json>]
 *
 * Run it before and after a real run (the OPT-8b round, a first delivery) to measure what the run took from the window.
 */

import { writeFileSync } from 'node:fs'
import { readOarAccountUsage } from '@deepseek-ai/dsh-persona-usage'

function argOf(name: string): string | undefined {
  const at = process.argv.indexOf(name)
  return at >= 0 ? process.argv[at + 1] : undefined
}

async function main(): Promise<void> {
  const oar = await import('@botiverse/oar')
  const runtime = oar.defaultRuntimes.get('claude')
  const installation = runtime?.installation === undefined ? undefined : await runtime.installation()
  if (runtime === undefined || installation === undefined || installation.kind !== 'available') throw new Error('the claude CLI is not available')
  if (runtime.accountUsage === undefined) throw new Error('this CLI exposes no account usage')
  const raw = await runtime.accountUsage(installation)
  const quota = readOarAccountUsage('claude', raw)
  const at = new Date().toISOString()
  const windows = quota.windows.map(window => ({ id: window.id, usedPercent: window.usedPercent ?? null, resetsAt: window.resetsAt ?? null, origin: window.origin }))
  const label = argOf('--label') ?? 'now'
  process.stdout.write(`quota ${label} @ ${at}: origin=${quota.origin} ${windows.map(w => `${w.id}=${w.usedPercent === null ? 'n/d' : `${String(w.usedPercent)}%`}${w.resetsAt === null ? '' : ` (reset ${w.resetsAt})`}`).join(' | ') || 'no windows'}\n`)
  if (process.argv.includes('--raw')) {
    // The SHAPE only: keys, numbers and booleans; strings are replaced (no account name, no email).
    const outline = (value: unknown): unknown => Array.isArray(value) ? value.map(outline) : value !== null && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, outline(item)])) : typeof value === 'string' ? (/^\d{4}-\d{2}-\d{2}T/u.test(value) ? '<instant>' : value.length <= 24 && /^[\w:.-]+$/u.test(value) ? value : '<text>') : value
    process.stdout.write(`raw shape: ${JSON.stringify(outline(raw))}\n`)
  }
  const out = argOf('--out')
  if (out !== undefined) writeFileSync(out, `${JSON.stringify({ label, at, origin: quota.origin, windows, rawKeys: raw !== null && typeof raw === 'object' ? Object.keys(raw as object) : [] }, null, 2)}\n`)
}

main().catch((error: unknown) => {
  process.stderr.write(`quota-read failed: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
