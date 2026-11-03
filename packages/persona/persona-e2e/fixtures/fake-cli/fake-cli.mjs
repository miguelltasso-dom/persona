#!/usr/bin/env node
/** Fake CLI stub for Persona E2E (version + auth probes only). */

const tool = process.argv[2] ?? 'unknown'
const args = process.argv.slice(3)
const joined = args.join(' ')

const versions = {
  claude: '2.1.317 (fake-persona-e2e)',
  codex: '0.166.0-fake-persona-e2e',
  opencode: '1.19.3-fake-persona-e2e',
  'cursor-agent': '2026.10.22-fake-persona-e2e',
}

if (args.includes('--version') || args.includes('-V')) {
  console.log(versions[tool] ?? `${tool}-fake-persona-e2e`)
  process.exit(0)
}

if (/auth/i.test(joined)) {
  console.log(JSON.stringify({ status: 'authenticated', tool, source: 'persona-e2e-fake-cli' }))
  process.exit(0)
}

process.exit(0)
