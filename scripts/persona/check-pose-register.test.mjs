// node --test scripts/persona/check-pose-register.test.mjs
// Imagens 100% sintéticas: um "corpo" circular opaco de 64×64 com um "rosto" (a máscara) onde a expressão muda.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { alphaStats, compareAlpha, compareRegister, diffOutside, loadSharp, parseArgs, parseMask, pixelDelta, readRgba, renderText, UsageError } from './check-pose-register.mjs'

const CLI = fileURLToPath(new URL('./check-pose-register.mjs', import.meta.url))
const sharp = loadSharp()
const W = 64
const H = 64
const FACE = { x: 22, y: 18, w: 20, h: 16 } // o rosto: a máscara
const FACE_ARG = '22,18,20,16'

/** RGBA em memória: corpo circular (centro 32,32, raio 24) cor de pão; olhos 2×2 dentro do rosto. Mexa em `img.data` depois. */
function body({ w = W, h = H, cx = 32, cy = 32, r = 24, eyes = [[28, 24], [36, 24]] } = {}) {
  const data = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    if (Math.hypot(x - cx, y - cy) <= r) { const o = (y * w + x) * 4; data[o] = 200; data[o + 1] = 150; data[o + 2] = 90; data[o + 3] = 255 }
  }
  for (const [ex, ey] of eyes) for (let dy = 0; dy < 2; dy += 1) for (let dx = 0; dx < 2; dx += 1) { const o = ((ey + dy) * w + ex + dx) * 4; data[o] = 20; data[o + 1] = 20; data[o + 2] = 20; data[o + 3] = 255 }
  return { width: w, height: h, data }
}
const set = (img, x, y, rgba) => { const o = (y * img.width + x) * 4; img.data.set(rgba, o) }
const clone = (img) => ({ width: img.width, height: img.height, data: new Uint8Array(img.data) })
async function save(dir, name, img) {
  const path = join(dir, name)
  await sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength), { raw: { width: img.width, height: img.height, channels: 4 } }).png().toFile(path)
  return path
}
const tmp = () => mkdtempSync(join(tmpdir(), 'pose-'))
const cli = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' })
const masks = [FACE]

test('máscara: x,y,w,h inteiros; lixo, negativo e zero são erro de uso', () => {
  assert.deepEqual(parseMask('22,18,20,16'), FACE)
  assert.deepEqual(parseMask('1 2 3 4'), { x: 1, y: 2, w: 3, h: 4 })
  for (const bad of ['22,18,20', 'a,b,c,d', '-1,0,5,5', '0,0,0,5', '1.5,2,3,4', '']) assert.throws(() => parseMask(bad), UsageError, bad)
})

test('alfa: caixa e centroide medidos certo; vazio dos dois lados passa, vazio de um lado falha', () => {
  const stats = alphaStats(body())
  assert.deepEqual(stats.bbox, { x0: 8, y0: 8, x1: 56, y1: 56 })
  assert.ok(Math.abs(stats.cx - 32) < 0.01 && Math.abs(stats.cy - 32) < 0.01)
  const empty = { width: 4, height: 4, data: new Uint8Array(64) }
  assert.equal(compareAlpha(empty, empty).ok, true)
  assert.equal(compareAlpha(body(), empty).ok, false)
  assert.match(compareAlpha(empty, body()).reasons[0], /base não tem desenho/u)
})

test('alfa: o limiar descarta o halo quase transparente da caixa', () => {
  const img = body()
  set(img, 2, 2, [0, 0, 0, 5]) // alfa 5 ≤ 8: não é desenho
  assert.deepEqual(alphaStats(img).bbox, { x0: 8, y0: 8, x1: 56, y1: 56 })
  set(img, 2, 2, [0, 0, 0, 200])
  assert.equal(alphaStats(img).bbox.x0, 2)
})

test('pixel: transparente nos dois lados é igual (o RGB escondido não conta); pré-multiplicado por alfa', () => {
  const a = new Uint8Array([10, 20, 30, 0])
  const b = new Uint8Array([200, 100, 50, 0])
  assert.equal(pixelDelta(a, 0, b, 0), 0)
  assert.equal(pixelDelta(new Uint8Array([255, 0, 0, 255]), 0, new Uint8Array([250, 0, 0, 255]), 0), 5)
  assert.equal(pixelDelta(new Uint8Array([255, 0, 0, 255]), 0, new Uint8Array([255, 0, 0, 100]), 0), 155) // só o alfa mudou: 155
})

test('idêntico → PASSOU; expressão trocada SÓ dentro da máscara → PASSOU', () => {
  const base = body()
  const same = compareRegister(base, clone(base), { masks })
  assert.equal(same.ok, true)
  assert.deepEqual(same.checks.map((c) => c.ok), [true, true, true])
  const happy = body({ eyes: [[27, 22], [37, 22]] }) // olhos em outro lugar, dentro do rosto (22..41, 18..33)
  const report = compareRegister(base, happy, { masks })
  assert.equal(report.ok, true, renderText(report))
  assert.ok(report.outside.insideDiffering > 0)
})

test('UM pixel fora da máscara → FALHOU, e diz onde (coordenada, cor dos dois lados, célula)', () => {
  const base = body()
  const cand = clone(base)
  set(cand, 5, 60, [255, 0, 0, 255]) // canto inferior esquerdo, fora do corpo
  const report = compareRegister(base, cand, { masks })
  assert.equal(report.ok, false)
  const outside = report.outside
  assert.equal(outside.differing, 1)
  assert.deepEqual(outside.bbox, { x0: 5, y0: 60, x1: 5, y1: 60 })
  assert.deepEqual(outside.samples[0], { x: 5, y: 60, base: [0, 0, 0, 0], cand: [255, 0, 0, 255], delta: 255 })
  assert.deepEqual(outside.cells[0], { row: 7, col: 0, x: 0, y: 56, w: 8, h: 8, count: 1 })
  const text = renderText(report, { base: 'base.png', candidate: 'cand.png', masks })
  assert.match(text, /FALHOU \[pixels fora da máscara\] 1 pixel\(s\) diferem fora da máscara/u)
  assert.match(text, /na caixa x=5\.\.5, y=60\.\.60/u)
  assert.match(text, /linha 8\/coluna 1 \(x=0\.\.7, y=56\.\.63\): 1 px/u)
  assert.match(text, /\(5,60\) base rgba\(0,0,0,0\) → candidato rgba\(255,0,0,255\)/u)
  assert.match(text, /^FALHOU — registro de pose: base\.png × cand\.png; máscara: 22,18,20,16\./mu)
})

test('dimensões diferentes → FALHOU na primeira checagem e as outras ficam "pulado"', () => {
  const report = compareRegister(body(), body({ w: 128, h: 128, cx: 64, cy: 64, r: 48, eyes: [] }), { masks })
  assert.equal(report.ok, false)
  assert.deepEqual(report.checks.map((c) => c.ok), [false, null, null])
  assert.match(renderText(report), /FALHOU {1}\[dimensões iguais\] base 64×64, candidato 128×128/u)
  assert.match(renderText(report), /pulado {1}\[caixa e centroide do alfa\] não avaliado/u)
})

test('o corpo andou 2 px → FALHOU: caixa do alfa, centroide e pixels fora da máscara acusam', () => {
  const report = compareRegister(body(), body({ cx: 34, eyes: [[30, 24], [38, 24]] }), { masks })
  assert.equal(report.ok, false)
  const alfa = report.checks.find((c) => c.id === 'alfa')
  assert.equal(alfa.ok, false)
  assert.match(alfa.detail, /lado esquerdo mudou \+2 px/u)
  assert.match(alfa.detail, /lado direito mudou \+2 px/u)
  assert.match(alfa.detail, /centroide do alfa andou 2 px \(dx 2, dy 0/u)
  assert.equal(report.checks.find((c) => c.id === 'fora-da-mascara').ok, false)
})

test('um pontinho solto longe do corpo estica a caixa → FALHOU no alfa', () => {
  const base = body()
  const cand = clone(base)
  set(cand, 62, 62, [0, 0, 0, 255])
  const alfa = compareRegister(base, cand, { masks }).checks.find((c) => c.id === 'alfa')
  assert.equal(alfa.ok, false)
  assert.match(alfa.detail, /lado direito mudou \+6 px/u)
  assert.match(alfa.detail, /lado de baixo mudou \+6 px/u)
})

test('tolerâncias: --max-diff-pixels, --channel-tol, --max-diff-ratio, --bbox-tol e --centroid-tol', () => {
  const base = body()
  const noisy = clone(base)
  set(noisy, 2, 2, [255, 0, 0, 255]); set(noisy, 3, 3, [255, 0, 0, 255]) // 2 pixels fora
  assert.equal(compareRegister(base, noisy, { masks }).ok, false)
  assert.equal(compareRegister(base, noisy, { masks, maxDiffPixels: 2 }).checks.find((c) => c.id === 'fora-da-mascara').ok, true)
  const area = W * H - FACE.w * FACE.h
  assert.equal(compareRegister(base, noisy, { masks, maxDiffRatio: 2 / area }).checks.find((c) => c.id === 'fora-da-mascara').ok, true) // o limite de proporção também relaxa
  assert.equal(compareRegister(base, noisy, { masks, maxDiffRatio: 1 / area }).checks.find((c) => c.id === 'fora-da-mascara').ok, false)
  // ruído de cor pequeno no corpo (≤ 3) passa com --channel-tol 3, falha com 2
  const tint = clone(base)
  for (let o = 0; o < tint.data.length; o += 4) if (tint.data[o + 3] === 255 && tint.data[o] === 200) tint.data[o] = 203
  assert.equal(diffOutside(base, tint, masks, { channelTol: 3 }).ok, true)
  assert.equal(diffOutside(base, tint, masks, { channelTol: 2 }).ok, false)
  // caixa e centroide
  const moved = body({ cx: 33, eyes: [[29, 24], [37, 24]] })
  assert.equal(compareAlpha(base, moved, { bboxTol: 1, centroidTol: 1 }).ok, true)
  assert.equal(compareAlpha(base, moved, { bboxTol: 0, centroidTol: 1 }).ok, false)
  assert.equal(compareAlpha(base, moved, { bboxTol: 1, centroidTol: 0.5 }).ok, false)
})

test('RGB escondido sob alfa 0 mudou: NÃO é diferença (exportadores trocam a cor do vazio)', () => {
  const base = body()
  const cand = clone(base)
  for (let o = 0; o < cand.data.length; o += 4) if (cand.data[o + 3] === 0) { cand.data[o] = 255; cand.data[o + 1] = 0; cand.data[o + 2] = 255 }
  assert.equal(compareRegister(base, cand, { masks }).ok, true)
})

test('várias máscaras: mudança em qualquer uma é permitida, fora de todas não', () => {
  const base = body()
  const cand = clone(base)
  set(cand, 30, 24, [255, 255, 255, 255]) // dentro do rosto
  set(cand, 10, 40, [255, 255, 255, 255]) // dentro da 2ª máscara (mão)
  const hand = { x: 8, y: 38, w: 6, h: 6 }
  assert.equal(compareRegister(base, cand, { masks: [FACE, hand] }).ok, true)
  assert.equal(compareRegister(base, cand, { masks }).ok, false)
  set(cand, 50, 50, [255, 255, 255, 255])
  assert.equal(compareRegister(base, cand, { masks: [FACE, hand] }).ok, false)
})

test('--require-change: candidato igual à base falha ("nada mudou"); com expressão nova passa', () => {
  const base = body()
  const same = compareRegister(base, clone(base), { masks, requireChange: true })
  assert.equal(same.ok, false)
  assert.match(same.checks.at(-1).detail, /nada mudou dentro da máscara/u)
  assert.equal(compareRegister(base, body({ eyes: [[27, 22], [37, 22]] }), { masks, requireChange: true }).ok, true)
})

test('máscara maior que a imagem é erro de uso, não resultado', () => {
  assert.throws(() => compareRegister(body(), body(), { masks: [{ x: 50, y: 50, w: 30, h: 30 }] }), /passa da imagem \(64×64\)/u)
})

test('sem máscara nenhuma: qualquer diferença falha (a nota aparece no resultado)', () => {
  const base = body()
  const report = compareRegister(base, body({ eyes: [[27, 22], [37, 22]] }), { masks: [] })
  assert.equal(report.ok, false)
  assert.match(renderText(report), /máscara: nenhuma \(qualquer diferença falha\)/u)
})

test('readRgba: PNG com e sem alfa, e arquivo que não é imagem', async () => {
  const dir = tmp()
  try {
    const rgb = join(dir, 'rgb.png')
    await sharp({ create: { width: 4, height: 3, channels: 3, background: { r: 10, g: 20, b: 30 } } }).png().toFile(rgb)
    const img = await readRgba(rgb, sharp)
    assert.deepEqual([img.width, img.height, img.data.length], [4, 3, 48])
    assert.deepEqual([...img.data.subarray(0, 4)], [10, 20, 30, 255]) // sem alfa vira opaco
    writeFileSync(join(dir, 'lixo.png'), 'isto não é um png')
    await assert.rejects(() => readRgba(join(dir, 'lixo.png'), sharp), /não consegui ler a imagem/u)
    await assert.rejects(() => readRgba(join(dir, 'nao-existe.png'), sharp), /arquivo não existe/u)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('CLI de ponta a ponta: 0 passou, 1 falhou, 2 uso; --json, --report, --quiet', async () => {
  const dir = tmp()
  try {
    const base = body()
    const basePng = await save(dir, 'base.png', base)
    const happyPng = await save(dir, 'feliz.png', body({ eyes: [[27, 22], [37, 22]] }))
    const bad = clone(base)
    set(bad, 5, 60, [255, 0, 0, 255])
    const badPng = await save(dir, 'ruim.png', bad)
    const ok = cli('--base', basePng, '--candidate', happyPng, '--mask', FACE_ARG)
    assert.equal(ok.status, 0, ok.stdout + ok.stderr)
    assert.match(ok.stdout, /^PASSOU — registro de pose/mu)
    const fail = cli('--base', basePng, '--candidate', badPng, '--mask', FACE_ARG)
    assert.equal(fail.status, 1)
    assert.match(fail.stdout, /FALHOU \[pixels fora da máscara\] 1 pixel\(s\)/u)
    const json = JSON.parse(cli('--base', basePng, '--candidate', badPng, '--mask', FACE_ARG, '--json').stdout)
    assert.equal(json.ok, false)
    assert.equal(json.outside.differing, 1)
    const report = join(dir, 'rel.json')
    cli('--base', basePng, '--candidate', happyPng, '--mask', FACE_ARG, '--report', report, '--quiet')
    assert.equal(JSON.parse(readFileSync(report, 'utf8')).ok, true)
    assert.equal(cli('--base', basePng, '--candidate', happyPng, '--mask', FACE_ARG, '--quiet').stdout, '')
    // tolerância pela linha de comando: o pixel solto também estica a caixa do alfa (3 e 4 px), então os dois limites precisam ser relaxados
    assert.equal(cli('--base', basePng, '--candidate', badPng, '--mask', FACE_ARG, '--max-diff-pixels', '1').status, 1, 'só relaxar os pixels não basta: a caixa do alfa também acusa')
    assert.equal(cli('--base', basePng, '--candidate', badPng, '--mask', FACE_ARG, '--max-diff-pixels', '1', '--bbox-tol', '5').status, 0)
    assert.equal(cli('--base', basePng, '--candidate', basePng, '--mask', FACE_ARG, '--require-change').status, 1)
    // uso errado = 2
    assert.equal(cli('--base', basePng).status, 2)
    assert.equal(cli('--base', basePng, '--candidate', happyPng, '--mask', '1,2,3').status, 2)
    assert.equal(cli('--base', basePng, '--candidate', happyPng, '--mask', '50,50,30,30').status, 2)
    assert.equal(cli('--base', basePng, '--candidate', join(dir, 'nao-existe.png'), '--mask', FACE_ARG).status, 2)
    assert.equal(cli('--base', basePng, '--candidate', happyPng, '--bbox-tol', '-1', '--mask', FACE_ARG).status, 2)
    assert.equal(cli('solto').status, 2)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('--diff-out grava o PNG de diferenças: magenta fora, amarelo dentro, ciano no contorno da máscara', async () => {
  const dir = tmp()
  try {
    const base = body()
    const cand = clone(base)
    set(cand, 5, 60, [255, 0, 0, 255]) // fora
    set(cand, 30, 24, [255, 255, 255, 255]) // dentro (era olho: muda)
    const out = join(dir, 'dif.png')
    const run = cli('--base', await save(dir, 'b.png', base), '--candidate', await save(dir, 'c.png', cand), '--mask', FACE_ARG, '--diff-out', out)
    assert.equal(run.status, 1)
    assert.ok(existsSync(out))
    const diff = await readRgba(out, sharp)
    assert.deepEqual([diff.width, diff.height], [W, H])
    const at = (x, y) => [...diff.data.subarray((y * W + x) * 4, (y * W + x) * 4 + 4)]
    assert.deepEqual(at(5, 60), [255, 0, 200, 255]) // fora → magenta
    assert.deepEqual(at(30, 24), [255, 200, 0, 255]) // dentro → amarelo
    assert.deepEqual(at(FACE.x, FACE.y), [0, 190, 230, 255]) // canto da máscara → ciano
    assert.deepEqual(at(0, 0), [235, 235, 235, 255]) // fundo claro
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('parseArgs: máscaras repetidas, alias --cand, estrito', () => {
  const args = parseArgs(['--base', 'a.png', '--cand', 'b.png', '--mask', '1,2,3,4', '--mask', '5,6,7,8', '--json'])
  assert.equal(args.candidate, 'b.png')
  assert.equal(args.masks.length, 2)
  assert.equal(args.flags.has('json'), true)
  assert.throws(() => parseArgs(['--mask']), UsageError)
  assert.throws(() => parseArgs(['--base']), UsageError)
  assert.throws(() => parseArgs(['solto']), UsageError)
})
