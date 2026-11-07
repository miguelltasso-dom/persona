// Runs INSIDE the packaged exe's own node (ELECTRON_RUN_AS_NODE=1 Persona.exe packaged-runners-probe.mjs <mode> <runners lib> [...]).
// Three modes, all used by verify-persona-package.mjs so a build that cannot do what the product needs fails the PACK, not the person:
//   imports <lib>                 -> every runner runtime loads (OAR, Claude, Codex, OpenCode, Cursor SDK). Prints RUNTIME-IMPORTS <json>. (ENG-1)
//   turn <lib> <stubDir> <cwd>    -> the product's own resolveRunner drives the faithful `claude` stub through a full turn. Prints
//                                    RUNNER-TURN <json>. The stub lives in packages/persona/persona-e2e/fixtures/fake-cli; no model, no spend.
//   sharp <package.json>          -> `sharp` loads from that package's place in the packaged runtime (its native binary lives OUTSIDE the asar, in
//                                    app.asar.unpacked) and rasterizes an SVG of ~20 KB to a valid PNG. Prints SHARP-RASTER <json>. (v1.1 image features)
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const [mode, lib, stubDir, workDir] = process.argv.slice(2)
if (mode === undefined || lib === undefined) {
  console.log('usage: packaged-runners-probe.mjs <imports|turn|sharp> <runners lib/index.js | a package.json for sharp> [stubDir cwd]')
  process.exit(2)
}

const describe = error => (error instanceof Error ? `${error.name}: ${error.message}` : String(error)).replace(/\s+/gu, ' ').slice(0, 400)

if (mode === 'sharp') {
  const report = { ok: false }
  try {
    const sharp = createRequire(lib)('sharp')
    const rects = []
    let svg = ''
    // ~20 KB of vector content (the size Keel asked for): a grid of coloured squares plus a line of text
    for (let i = 0; svg.length < 20_000; i += 1) {
      rects.push(`<rect x="${String((i % 30) * 20)}" y="${String(Math.floor(i / 30) * 20)}" width="18" height="18" fill="hsl(${String((i * 7) % 360)},70%,55%)"/>`)
      svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300" viewBox="0 0 600 300"><rect width="600" height="300" fill="#fff"/>${rects.join('')}<text x="12" y="290" font-size="18" fill="#222">Persona</text></svg>`
    }
    const started = Date.now()
    const png = await sharp(Buffer.from(svg)).png().toBuffer()
    const meta = await sharp(png).metadata()
    Object.assign(report, {
      sharp: sharp.versions?.sharp ?? null, vips: sharp.versions?.vips ?? null, rsvg: sharp.versions?.rsvg ?? null,
      svgBytes: Buffer.byteLength(svg), png: { bytes: png.length, width: meta.width, height: meta.height, format: meta.format }, ms: Date.now() - started,
    })
    report.ok = png.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' && meta.width === 600 && meta.height === 300 && meta.format === 'png'
    if (!report.ok) report.error = 'the output is not a 600x300 PNG'
    // The product's own path (Forge, persona-host/src/svg-to-png.ts): when the packaged host library exposes `svgToPng`, the SAME SVG must come out as a PNG through it.
    // Not exposed = noted, not a failure (the raw check above already proved the engine); exposed but wrong = the gate fails.
    const hostLib = join(lib, '..', 'lib')
    for (const file of ['svg-to-png.js', 'index.js']) {
      let owner
      try { owner = await import(pathToFileURL(join(hostLib, file)).href) } catch { continue }
      if (typeof owner.svgToPng !== 'function') continue
      const viaProduct = await owner.svgToPng(svg, { maxWidth: 800 })
      report.product = { module: file, ok: viaProduct.ok === true, width: viaProduct.width ?? null, height: viaProduct.height ?? null, png: viaProduct.png ? viaProduct.png.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' : false }
      if (!report.product.ok || !report.product.png) { report.ok = false; report.error = `the packaged svgToPng refused or returned no PNG (${JSON.stringify(report.product)})` }
      break
    }
    if (report.product === undefined) report.product = 'svgToPng not exposed by the packaged host library'
  } catch (error) {
    report.error = describe(error)
  }
  console.log(`SHARP-RASTER ${JSON.stringify(report)}`)
  process.exit(0)
}

let runners
try {
  runners = await import(pathToFileURL(lib).href)
} catch (error) {
  console.log(`${mode === 'imports' ? 'RUNTIME-IMPORTS' : 'RUNNER-TURN'} ${JSON.stringify({ ok: false, stage: 'load persona-runners', error: describe(error) })}`)
  process.exit(0)
}

if (mode === 'imports') {
  if (typeof runners.checkRuntimeImports !== 'function') {
    console.log(`RUNTIME-IMPORTS ${JSON.stringify({ ok: false, stage: 'checkRuntimeImports', error: 'the packaged persona-runners has no checkRuntimeImports (build predates the ENG-1 gate)' })}`)
    process.exit(0)
  }
  const rows = await runners.checkRuntimeImports()
  console.log(`RUNTIME-IMPORTS ${JSON.stringify({ ok: rows.every(row => row.ok), rows })}`)
  process.exit(0)
}

// mode === 'turn'
const home = mkdtempSync(join(tmpdir(), 'persona-runner-probe-'))
const cwd = workDir ?? mkdtempSync(join(tmpdir(), 'persona-runner-probe-cwd-'))
mkdirSync(join(home, '.claude'), { recursive: true })
process.env.HOME = home
process.env.USERPROFILE = home
process.env.PATH = `${stubDir}${delimiter}${process.env.PATH ?? ''}`
process.env.OAR_CLAUDE_BIN = join(stubDir, process.platform === 'win32' ? 'claude.cmd' : 'claude')
process.env.FAKE_CLI_REPLY = 'resposta do stub'
const out = { ok: false, ms: 0, ended: undefined, text: '', error: undefined }
const t0 = Date.now()
try {
  const inner = await runners.resolveRunner({
    spec: { kind: 'cli', cli: 'claude', model: 'haiku' },
    permissionMode: 'deny', autonomy: 'asked', purpose: 'task', accountHome: join(home, '.claude'),
  })
  const handle = await inner.start({
    ticketId: 'probe-t', assignmentId: 'probe-a', personaId: 'probe', cwd, model: 'haiku', permissionMode: 'deny',
    prompt: 'Primeira entrega: responda em texto.',
  })
  const timer = setTimeout(() => { out.error = 'turn timeout (150 s)'; process.exit(0) }, 150_000)
  for await (const event of inner.stream(handle)) {
    if (event.type === 'delta') out.text += event.text
    if (event.type === 'ended') out.ended = event.report?.state
  }
  clearTimeout(timer)
  await inner.dispose?.()
  await runners.disposeRunnerSessions?.()
  out.ok = out.ended === 'ready' && out.text.includes('resposta do stub')
} catch (error) {
  out.error = describe(error)
}
out.ms = Date.now() - t0
console.log(`RUNNER-TURN ${JSON.stringify(out)}`)
for (const dir of [home]) { try { rmSync(dir, { recursive: true, force: true }) } catch { /* temp */ } }
process.exit(0)
