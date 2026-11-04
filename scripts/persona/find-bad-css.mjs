// Keel (D-060 gate helper): find the CSS file that lightningcss rejects ("Invalid token in pseudo element") by transforming every client-ui-persona CSS one by one.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = (process.argv[2] ?? resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')).replaceAll(String.fromCharCode(92), '/')
const require = createRequire(`${root}/package.json`)
let lightningcss
try { lightningcss = require('lightningcss') } catch {
  const found = readdirSync(`${root}/node_modules/.pnpm`).find((name) => name.startsWith('lightningcss@'))
  lightningcss = require(`${root}/node_modules/.pnpm/${found}/node_modules/lightningcss`)
}
const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name)
  return statSync(path).isDirectory() ? (name === 'node_modules' ? [] : walk(path)) : /\.css$/u.test(name) ? [path] : []
})
const bad = []
for (const file of walk(`${root}/packages/persona/client-ui-persona/src`)) {
  try {
    lightningcss.transform({ filename: file, code: Buffer.from(readFileSync(file)), cssModules: file.endsWith('.module.css'), minify: false })
  } catch (error) {
    bad.push({ file: file.replace(`${root}/`, ''), message: String(error.message).slice(0, 200), line: error.loc?.line, column: error.loc?.column })
  }
}
console.log(JSON.stringify(bad, null, 1))
