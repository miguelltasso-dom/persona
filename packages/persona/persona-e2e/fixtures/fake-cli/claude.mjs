#!/usr/bin/env node
// Launcher whose NAME carries the tool identity. OAR "unwraps" `.cmd` shims and runs `node <script>` directly, which drops
// any tool name baked into the shim's arguments (codex/opencode then behaved as claude), so identity lives in the script.
process.env.FAKE_CLI_TOOL = 'claude'
await import('./fake-cli.mjs')
