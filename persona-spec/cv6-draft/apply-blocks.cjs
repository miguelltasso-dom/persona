// Applies a blocks file: each block is `@@@ file=<path under persona-host> name=<n>` then `<<<FROM` .. `===TO` .. `>>>`.
// Every FROM must match exactly once in its file; nothing is written unless ALL blocks match. `--dry` only checks.
// Usage: node apply-blocks.cjs <blocks.txt> [--dry]
const fs = require('fs')
const root = 'C:/Users/migue/dev/persona/packages/persona/persona-host/'
const blocksFile = process.argv[2]
const dry = process.argv.includes('--dry')
const raw = fs.readFileSync(blocksFile, 'utf8').replace(/\r\n/g, '\n')
const blocks = []
for (const chunk of raw.split(/^@@@ /m).slice(1)) {
  const head = chunk.slice(0, chunk.indexOf('\n'))
  const file = /file=(\S+)/.exec(head)?.[1]
  const name = /name=(\S+)/.exec(head)?.[1]
  const body = chunk.slice(chunk.indexOf('\n') + 1)
  const from = body.slice(body.indexOf('<<<FROM\n') + 8, body.indexOf('\n===TO\n'))
  const to = body.slice(body.indexOf('\n===TO\n') + 7, body.lastIndexOf('\n>>>'))
  blocks.push({ file, name, from, to })
}
const texts = new Map()
const crlf = new Map()
let failed = false
for (const block of blocks) {
  if (!texts.has(block.file)) {
    const text = fs.readFileSync(root + block.file, 'utf8')
    crlf.set(block.file, text.includes('\r\n'))
    texts.set(block.file, text.replace(/\r\n/g, '\n'))
  }
  const text = texts.get(block.file)
  const count = text.split(block.from).length - 1
  if (count !== 1) { console.error(`${block.file} [${block.name}] matched ${String(count)} (expected 1)`); failed = true; continue }
  texts.set(block.file, text.replace(block.from, () => block.to))
}
if (failed) process.exit(1)
if (dry) { console.log(`dry OK: ${String(blocks.length)} blocks`); process.exit(0) }
for (const [file, text] of texts) {
  fs.writeFileSync(root + file, crlf.get(file) ? text.replace(/\n/g, '\r\n') : text)
  console.log('patched', file)
}
