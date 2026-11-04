#!/usr/bin/env node
// See claude.mjs: the script name, not the shim arguments, carries the tool identity.
process.env.FAKE_CLI_TOOL = 'cursor-agent'
await import('./fake-cli.mjs')
