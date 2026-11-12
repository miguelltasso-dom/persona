// "Acordando o time" (COLHEITA-MUSE §30): capturas da cena de espera do overlay de boot, sem host e sem instalador.
// O overlay REAL (boot.html + boot.css + boot.js + assets) é servido por um servidor estático no mesmo caminho do app
// (/__persona-boot-ui__/) dentro de um documento montado como `attachBootUi` monta. `window.personaBoot` é um stand-in controlado pela página.
// Run: node scripts/persona/with-lock.mjs "Prism boot scene shots" --lock check -- node scripts/persona/prism-boot-scene-shots.mjs
// Saída: .maestri/tmp/shots/design/boot-acordando/<estado>-<claro|escuro>[-reduzido]-<1280|960>.png + frames.json (opacidade medida).
import { createServer } from 'node:http'
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { extname, join, normalize } from 'node:path'

const root = 'C:/Users/migue/dev/persona'
const require = createRequire(`${root}/packages/persona/persona-e2e/package.json`)
const { chromium } = require('playwright')
const bootDir = process.env.BOOT_DIR ?? `${root}/apps/desktop/renderer/persona-boot`
const outDir = process.env.BOOT_OUT ?? `${root}/.maestri/tmp/shots/design/boot-acordando`
mkdirSync(outDir, { recursive: true })

const TYPES = { '.css': 'text/css', '.js': 'text/javascript', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' }
const markup = readFileSync(`${bootDir}/boot.html`, 'utf8')
const documentFor = (query) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Persona</title>`
  + `<link rel="stylesheet" href="/__persona-boot-ui__/boot-fonts.css"></head><body>${markup}`
  + `<script defer src="/__persona-boot-ui__/boot.js?${query}"></script><div id="root" hidden inert aria-hidden="true"></div></body></html>`

const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://x')
  if (url.pathname === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(documentFor(url.search.slice(1)))
    return
  }
  if (url.pathname === '/favicon.ico') { response.writeHead(204); response.end(); return } // the browser asks once; the app has its own icon
  const prefix = '/__persona-boot-ui__/'
  const file = url.pathname.startsWith(prefix) ? normalize(join(bootDir, url.pathname.slice(prefix.length))) : ''
  if (file === '' || !file.startsWith(normalize(bootDir)) || !existsSync(file) || !statSync(file).isFile()) { response.writeHead(404); response.end(); return }
  response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
  createReadStream(file).pipe(response)
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`

// The stand-in for the preload bridge: the page (this script) pushes a phase or a failure.
const BRIDGE = `
  (() => {
    const listeners = { fail: [], phase: [] }
    window.__bridge = { fail: (d) => listeners.fail.forEach((l) => l(d)), phase: (p) => listeners.phase.forEach((l) => l(p)) }
    window.personaBoot = {
      retry: async () => {}, diagnostic: async () => 'Persona 1.0.0 · boot_timeout · C:\\\\Users\\\\Maria\\\\AppData\\\\Roaming\\\\Persona\\\\logs',
      subscribe: (l) => { listeners.fail.push(l); return () => {} },
      onPhase: (l) => { listeners.phase.push(l); return () => {} },
    }
  })()`

const VIEWPORTS = [{ name: '1280', width: 1280, height: 800 }, { name: '960', width: 960, height: 640 }]
const SCHEMES = [{ name: 'claro', scheme: 'light' }, { name: 'escuro', scheme: 'dark' }]
const FACES = JSON.stringify(['capivara', 'lobo-guara', 'nina', 'tucano', 'panda'])
const report = []
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  for (const viewport of VIEWPORTS) {
    for (const { name: schemeName, scheme } of SCHEMES) {
      for (const reduced of [false, true]) {
        if (reduced && viewport.name !== '1280') continue
        const suffix = `${schemeName}${reduced ? '-reduzido' : ''}-${viewport.name}`
        const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, colorScheme: scheme, reducedMotion: reduced ? 'reduce' : 'no-preference' })
        const page = await context.newPage()
        const errors = []
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
        page.on('pageerror', error => errors.push(String(error)))
        await context.addInitScript(BRIDGE)
        await context.addInitScript(`try { localStorage.setItem('persona.boot.faces.v1', ${JSON.stringify(FACES)}) } catch {}`)
        await page.clock.install()
        await page.goto(`${base}/?lang=pt-BR&first=0`)
        const shot = async (state) => { await page.screenshot({ path: `${outDir}/${state}-${suffix}.png` }) }
        const probe = async (state) => report.push({ state, suffix, ...(await page.evaluate(() => {
          const root = document.getElementById('persona-boot-overlay').shadowRoot
          const face = [...root.querySelectorAll('.face')].map(el => Number(getComputedStyle(el).opacity).toFixed(2))
          return { scene: root.querySelector('.boot').dataset.scene, status: root.getElementById('boot-status').textContent,
            hint: root.getElementById('boot-hint').hidden ? '' : root.getElementById('boot-hint').textContent, faces: face,
            htmlBackground: getComputedStyle(document.documentElement).backgroundColor,
            dotsAnimation: getComputedStyle(root.querySelector('.dots i')).animationName,
            focusable: [...root.querySelectorAll('button, summary')].filter(el => !el.closest('[hidden]')).length }
        })) })

        await page.waitForTimeout(150); await shot('0-trilho'); await probe('0-trilho')
        await page.clock.runFor(450)           // 400 ms: the scene starts (faces begin to arrive in real time)
        await page.waitForTimeout(420); await shot('1-chegando'); await probe('1-chegando')
        await page.waitForTimeout(900); await shot('2-acordando'); await probe('2-acordando')
        await page.evaluate(() => window.__bridge.phase('host-ready')); await page.waitForTimeout(80); await shot('3-arrumando'); await probe('3-arrumando')
        await page.evaluate(() => window.__bridge.phase('starting'))
        await page.clock.runFor(6000); await page.waitForTimeout(80); await shot('4-ainda-abrindo'); await probe('4-ainda-abrindo')
        await page.clock.runFor(20_000); await page.waitForTimeout(400); await shot('5-erro'); await probe('5-erro')
        await page.getByText('Detalhes para o suporte').click()
        await page.waitForTimeout(150); await shot('6-erro-detalhes')
        report.push({ state: 'errors', suffix, errors })
        await context.close()
      }
    }
  }
  // The first opening (no remembered faces): the animals arriving at the office instead of the lamp and the faces (Muse 12/11).
  for (const { name: schemeName, scheme } of SCHEMES) {
    const first = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: scheme })
    const firstPage = await first.newPage()
    const firstErrors = []
    firstPage.on('console', message => { if (message.type() === 'error') firstErrors.push(message.text()) })
    await first.addInitScript(BRIDGE)
    await firstPage.clock.install()
    await firstPage.goto(`${base}/?lang=pt-BR&first=1`)
    await firstPage.clock.runFor(450)
    await firstPage.waitForTimeout(900)
    await firstPage.screenshot({ path: `${outDir}/2-primeira-vez-${schemeName}-1280.png` })
    report.push({ state: 'primeira-vez', suffix: `${schemeName}-1280`, ...(await firstPage.evaluate(() => {
      const root = document.getElementById('persona-boot-overlay').shadowRoot
      const picture = root.querySelector('.first img')
      return { variant: root.querySelector('.boot').dataset.variant, status: root.getElementById('boot-status').textContent,
        opacity: getComputedStyle(root.querySelector('.first')).opacity, pictureLoaded: picture.complete && picture.naturalWidth > 0,
        lampHidden: getComputedStyle(root.querySelector('.lamp')).display === 'none', facesHidden: getComputedStyle(root.querySelector('.faces')).display === 'none' }
    })), errors: firstErrors })
    await first.close()
  }
  // The "host answers in time" path: the app paints at 700 ms and the overlay crossfades out over it.
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'light' })
  const page = await context.newPage()
  await context.addInitScript(BRIDGE)
  await page.clock.install()
  await page.goto(`${base}/?lang=pt-BR&first=0`)
  await page.clock.runFor(450)
  await page.waitForTimeout(500)
  await page.evaluate(() => { document.getElementById('root').innerHTML = '<main data-persona-shell="" style="padding:40px;font:20px sans-serif">Sua equipe</main>' })
  await page.clock.runFor(1500)
  await page.waitForTimeout(500)
  report.push({ state: 'handover', overlayRemoved: await page.evaluate(() => document.getElementById('persona-boot-overlay') === null), rootHidden: await page.evaluate(() => document.getElementById('root').hidden) })
  await context.close()
} finally {
  await browser.close()
  server.close()
}
writeFileSync(`${outDir}/frames.json`, JSON.stringify(report, null, 2))
// The measured facts the acceptance rests on: faces fully in place once arrived (also with reduced motion), the dots still only when
// reduced, no white html background, nothing focusable until the error, no console errors, and the hand-over removes the overlay.
const problems = []
for (const row of report) {
  if (row.state === '2-acordando' && !row.faces.every(opacity => opacity === '1.00')) problems.push(`${row.suffix}: faces not fully in place ${row.faces}`)
  if (row.suffix?.includes('reduzido') && row.state === '2-acordando' && row.dotsAnimation !== 'none') problems.push(`${row.suffix}: dots still animate`)
  if (row.htmlBackground !== undefined && row.htmlBackground === 'rgb(255, 255, 255)') problems.push(`${row.suffix} ${row.state}: white html background`)
  if (['0-trilho', '1-chegando', '2-acordando', '3-arrumando', '4-ainda-abrindo'].includes(row.state) && row.focusable !== 0) problems.push(`${row.suffix} ${row.state}: ${row.focusable} focusable`)
  if (row.state === '5-erro' && row.focusable !== 2) problems.push(`${row.suffix}: error state has ${row.focusable} focusable, expected 2 (Retry + the folded details)`)
  if (row.state === 'errors' && row.errors.length > 0) problems.push(`${row.suffix}: console errors ${row.errors.join(' | ')}`)
  if (row.state === 'handover' && (!row.overlayRemoved || row.rootHidden)) problems.push('handover did not remove the overlay')
  if (row.state === 'primeira-vez') {
    if (row.variant !== 'first' || row.opacity !== '1' || !row.pictureLoaded || !row.lampHidden || !row.facesHidden) problems.push(`${row.suffix}: first-opening scene not right ${JSON.stringify(row)}`)
    if (row.errors.length > 0) problems.push(`${row.suffix}: console errors ${row.errors.join(' | ')}`)
  }
}
if (problems.length > 0) { console.log(`PROBLEMS:\n${problems.join('\n')}`); process.exitCode = 1 } else console.log('ALL MEASURED CHECKS OK')
console.log(JSON.stringify(report.filter(row => row.state === 'errors' || row.state === 'handover' || row.state === '2-acordando' || row.state === '5-erro'), null, 1))
