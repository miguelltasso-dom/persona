#!/usr/bin/env node
// Fail when the packaged web client constructs Function at module init (D8 #root / CSP).
// Lazy `new Function` inside a function body is allowed (host !!js).
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const dir = join(root, 'apps/web/dist/assets')
const eager = /(?:const|let|var)\s+\w+\s*=\s*new\s+Function\b/
const files = readdirSync(dir).filter((name) => /^(index|vendor)-.+\.js$/.test(name))
if (files.length === 0) {
  console.error('assert-client-no-eval: no index/vendor chunks in apps/web/dist/assets')
  process.exit(2)
}
const hits = []
for (const name of files) {
  const text = readFileSync(join(dir, name), 'utf8')
  if (eager.test(text)) hits.push(name)
}
if (hits.length > 0) {
  console.error(`assert-client-no-eval FAIL eager new Function: ${hits.join(', ')}`)
  process.exit(1)
}
console.log(`assert-client-no-eval ok ${files.join(', ')}`)
