// INSTALLED-EXE CHECK (Rivet, 07/11, Keel asked): can the PACKAGED runtime load `sharp` and rasterize an SVG to PNG? Run INSIDE the exe's own node:
//   ELECTRON_RUN_AS_NODE=1 <win-unpacked>/Persona.exe scripts/persona/exe-sharp-probe.mjs      (zero AI, no window, ~5 s; exit 0 only when it works)
// The v1.1 image features rely on it, and the native binary lives OUTSIDE the asar (app.asar.unpacked/dsh/node_modules/@img/sharp-win32-x64): if a pack ever
// forgets to unpack it, this is where it shows. pack-after-dir.mjs runs it right after the verifier.
import { createRequire } from 'node:module'
import { existsSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

const resources = join(dirname(process.execPath), 'resources')
const asarRoot = join(resources, 'app.asar')
const unpacked = join(resources, 'app.asar.unpacked')
const out = { exe: process.execPath, electron: process.versions.electron ?? null, node: process.versions.node, abi: process.versions.modules }

// where the files are (asar vs unpacked)
const look = (base, rel) => ({ rel, exists: existsSync(join(base, rel)) })
out.layout = [
  look(asarRoot, 'dsh/node_modules/sharp/package.json'),
  look(unpacked, 'dsh/node_modules/sharp/package.json'),
  look(asarRoot, 'dsh/node_modules/@img'),
  look(unpacked, 'dsh/node_modules/@img'),
]
for (const base of [asarRoot, unpacked]) {
  const img = join(base, 'dsh', 'node_modules', '@img')
  try { out[`${base === asarRoot ? 'asar' : 'unpacked'}@img`] = readdirSync(img) } catch { /* not there */ }
}
// the native binary must be on the real disk (a .node cannot be loaded out of an asar)
out.nativeOnDisk = ['sharp-win32-x64', 'sharp-libvips-win32-x64'].map((name) => {
  const dir = join(unpacked, 'dsh', 'node_modules', '@img', name)
  let files = []
  try { files = readdirSync(dir, { recursive: true }).map(String).filter(file => /\.(node|dll)$/u.test(file)) } catch { /* absent */ }
  return { name, dir, files: files.slice(0, 6) }
})

// resolve it the way the persona-host would (from its own package, inside the asar) and from the runtime root
const attempts = []
for (const from of ['dsh/node_modules/@deepseek-ai/dsh-persona-host/package.json', 'dsh/package.json']) {
  const attempt = { from }
  try {
    const require = createRequire(join(asarRoot, from))
    attempt.resolved = require.resolve('sharp')
    const sharp = require('sharp')
    attempt.versions = sharp.versions ?? null
    const rects = Array.from({ length: 420 }, (_, i) => `<rect x="${String((i % 30) * 20)}" y="${String(Math.floor(i / 30) * 20)}" width="18" height="18" fill="hsl(${String(i * 7 % 360)},70%,55%)"/>`).join('')
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300" viewBox="0 0 600 300"><rect width="600" height="300" fill="#fff"/>${rects}<text x="12" y="290" font-size="18" fill="#222">Persona sharp probe</text></svg>`
    attempt.svgBytes = Buffer.byteLength(svg)
    const t0 = Date.now()
    const png = await sharp(Buffer.from(svg)).png().toBuffer()
    const meta = await sharp(png).metadata()
    attempt.png = { bytes: png.length, signature: png.subarray(0, 8).toString('hex'), width: meta.width, height: meta.height, format: meta.format, ms: Date.now() - t0 }
    attempt.ok = png.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' && meta.width === 600 && meta.height === 300
  } catch (error) {
    attempt.ok = false
    attempt.error = String(error?.message ?? error).slice(0, 400)
  }
  attempts.push(attempt)
}
out.attempts = attempts
out.ok = attempts.some(attempt => attempt.ok === true)
console.log(`SHARP-PROBE ${JSON.stringify(out)}`)
process.exit(out.ok ? 0 : 1)
