// node --test scripts/persona/vivas-assets.test.mjs
// Animais sintéticos: um corpo circular opaco no canvas, "rosto" = máscara. Nada de arte real.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { loadSharp, readRgba, alphaStats } from './check-pose-register.mjs'
import { buildVivas, cropRectOf, maskToOutput, parseMaskFile, targetSizeOf, validateVivas, VivasBuildError, VIVAS_MARGIN } from './vivas-assets.mjs'

const sharp = loadSharp()
sharp.cache(false) // no Windows o cache do sharp segura os arquivos abertos e o rmSync da limpeza dá EPERM
const FACE = [40, 30, 30, 24]

/** RGBA: corpo circular opaco (centro cx,cy; raio r) com 2 olhos 3×3. `mutate` mexe depois. */
function animal({ w = 120, h = 140, cx = 60, cy = 70, r = 40, eyes = [[48, 38], [60, 38]], mutate } = {}) {
  const data = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) if (Math.hypot(x - cx, y - cy) <= r) { const o = (y * w + x) * 4; data.set([200, 150, 90, 255], o) }
  for (const [ex, ey] of eyes) for (let dy = 0; dy < 3; dy += 1) for (let dx = 0; dx < 3; dx += 1) data.set([20, 20, 20, 255], ((ey + dy) * w + ex + dx) * 4)
  const img = { width: w, height: h, data }
  mutate?.(img)
  return img
}
const px = (img, x, y, rgba) => img.data.set(rgba, (y * img.width + x) * 4)
async function png(dir, rel, img) {
  const path = join(dir, rel)
  mkdirSync(dirname(path), { recursive: true })
  await sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength), { raw: { width: img.width, height: img.height, channels: 4 } }).png().toFile(path)
}
const writeJson = (dir, rel, value) => { const path = join(dir, rel); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(value)) }

/** src com persona-assets/vivas, out vazio, e um "track" que anota o que entrou no manifesto. */
function env() {
  const root = mkdtempSync(join(tmpdir(), 'vivas-'))
  const src = join(root, 'persona-assets')
  const out = join(root, 'out')
  mkdirSync(src, { recursive: true }); mkdirSync(out, { recursive: true })
  const tracked = []
  return { root, src, out, tracked, track: (rel) => tracked.push(rel), run: (extra = {}) => buildVivas({ src, out, sharp, track: (rel) => tracked.push(rel), ...extra }), done: () => rmSync(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 }) }
}
const happy = async (e, name = 'panda', over = {}) => {
  await png(e.src, `vivas/${name}/base.png`, animal(over))
  await png(e.src, `vivas/${name}/feliz.png`, animal({ ...over, eyes: [[47, 40], [61, 40]] })) // olhos mexem DENTRO do rosto (40..69, 30..53)
  await png(e.src, `vivas/${name}/pensando.png`, animal({ ...over, eyes: [[50, 36], [62, 36]] }))
  writeJson(e.src, `vivas/${name}/mask.json`, { mask: FACE })
}
const outFiles = (e) => readdirSync(join(e.out, 'vivas')).sort()

test('pura: corte = caixa do alfa da base + margem fixa, preso ao canvas', () => {
  const crop = cropRectOf(animal())
  assert.deepEqual(crop, { left: 20 - VIVAS_MARGIN, top: 30 - VIVAS_MARGIN, width: 81 + 2 * VIVAS_MARGIN, height: 81 + 2 * VIVAS_MARGIN })
  const edge = cropRectOf(animal({ cx: 40, cy: 40, r: 38 }))
  assert.equal(edge.left, 0) // 2 - 8 < 0 → preso
  assert.equal(edge.top, 0)
  assert.throws(() => cropRectOf({ width: 4, height: 4, data: new Uint8Array(64) }), /alfa vazio/u)
})

test('pura: escala única — não encolhe quando cabe; encolhe pela altura máxima mantendo a proporção', () => {
  assert.deepEqual(targetSizeOf({ left: 0, top: 0, width: 100, height: 200 }, 480), { width: 100, height: 200, scale: 1 })
  assert.deepEqual(targetSizeOf({ left: 0, top: 0, width: 300, height: 960 }, 480), { width: 150, height: 480, scale: 0.5 })
})

test('pura: a máscara vai para o sistema da saída arredondando para FORA', () => {
  assert.deepEqual(maskToOutput({ x: 40, y: 30, w: 30, h: 24 }, { left: 12, top: 32, width: 97, height: 97 }, 1), { x: 28, y: -2, w: 30, h: 24 })
  const half = maskToOutput({ x: 41, y: 31, w: 29, h: 23 }, { left: 0, top: 0, width: 100, height: 100 }, 0.5)
  assert.deepEqual(half, { x: 20, y: 15, w: 15, h: 12 }) // 20.5→20, 15.5→15, (70)*0.5=35 → 35-20, (54)*.5=27 → 27-15
})

test('mask.json: formas aceitas, tolerância, extras por expressão; erros claros', () => {
  assert.deepEqual(parseMaskFile({ mask: [1, 2, 3, 4] }).masks, [{ x: 1, y: 2, w: 3, h: 4 }])
  assert.deepEqual(parseMaskFile({ mask: { x: 1, y: 2, w: 3, h: 4 } }).masks.length, 1)
  assert.equal(parseMaskFile({ masks: [[1, 2, 3, 4], [5, 6, 7, 8]] }).masks.length, 2)
  const full = parseMaskFile({ mask: [1, 2, 3, 4], tolerance: { maxDiffPixels: 3 }, expressions: { pensando: { masks: [[9, 9, 2, 2]] } } })
  assert.equal(full.tolerance.maxDiffPixels, 3)
  assert.equal(full.extra.pensando.length, 1)
  for (const [bad, re] of [[[], /lista vazia/u], [{}, /um dos dois/u], [{ mask: [1, 2, 3, 4], masks: [[1, 2, 3, 4]] }, /um dos dois/u], [{ mask: [1, 2, 3] }, /inteiro/u], [{ mask: [-1, 0, 3, 4] }, /negativos/u], [{ mask: [0, 0, 0, 4] }, /maiores que zero/u], [{ masks: [] }, /vazia/u], [{ mask: [1, 2, 3, 4], tolerance: { foo: 1 } }, /desconhecida/u], [{ mask: [1, 2, 3, 4], tolerance: { channelTol: -1 } }, /maior ou igual a zero/u]]) assert.throws(() => parseMaskFile(bad), re, JSON.stringify(bad))
})

test('sem persona-assets/vivas: não faz nada e não falha (o build antigo continua igual)', async () => {
  const e = env()
  try { assert.deepEqual(await e.run(), { animals: [] }); assert.deepEqual(e.tracked, []) } finally { e.done() }
})

test('caminho feliz: todas as expressões saem com o MESMO tamanho e o MESMO corte; json do registro; tudo no manifesto', async () => {
  const e = env()
  try {
    await happy(e)
    const result = await e.run()
    assert.equal(result.animals.length, 1)
    assert.deepEqual(outFiles(e), ['panda-base.webp', 'panda-feliz.webp', 'panda-pensando.webp', 'panda.json'])
    assert.deepEqual([...e.tracked].sort(), ['vivas/panda-base.webp', 'vivas/panda-feliz.webp', 'vivas/panda-pensando.webp', 'vivas/panda.json'])
    const crop = cropRectOf(animal())
    const sizes = []
    for (const name of ['base', 'feliz', 'pensando']) {
      const img = await readRgba(join(e.out, `vivas/panda-${name}.webp`), sharp)
      sizes.push([img.width, img.height])
      // a caixa do alfa FORA do rosto é a mesma em todas: mesmo corte, mesma posição
      assert.deepEqual(alphaStats(img).bbox, { x0: VIVAS_MARGIN, y0: VIVAS_MARGIN, x1: VIVAS_MARGIN + 80, y1: VIVAS_MARGIN + 80 }, name)
    }
    assert.deepEqual(sizes, [[crop.width, crop.height], [crop.width, crop.height], [crop.width, crop.height]])
    const json = JSON.parse(readFileSync(join(e.out, 'vivas/panda.json'), 'utf8'))
    assert.deepEqual(json.canvas, [120, 140])
    assert.deepEqual(json.crop, crop)
    assert.deepEqual(json.size, [crop.width, crop.height])
    assert.equal(json.scale, 1)
    assert.deepEqual(json.mask, [{ x: FACE[0] - crop.left, y: FACE[1] - crop.top, w: FACE[2], h: FACE[3] }])
    assert.equal(json.expressions.feliz.file, 'panda-feliz.webp')
  } finally { e.done() }
})

test('o corte vem da BASE, não da expressão: uma expressão com desenho a mais no rosto não muda o retângulo', async () => {
  const e = env()
  try {
    await happy(e)
    // a expressão "pensando" tem um balão no canto SUPERIOR do rosto (dentro da máscara); o corte continua o da base
    await png(e.src, 'vivas/panda/pensando.png', animal({ mutate: (img) => { for (let y = 30; y < 34; y += 1) for (let x = 40; x < 44; x += 1) px(img, x, y, [255, 255, 255, 255]) } }))
    await e.run()
    const base = JSON.parse(readFileSync(join(e.out, 'vivas/panda.json'), 'utf8'))
    assert.deepEqual(base.crop, cropRectOf(animal()))
  } finally { e.done() }
})

test('canvas diferente da base → o build FALHA, nomeia o arquivo e os tamanhos, e NADA é gravado', async () => {
  const e = env()
  try {
    await happy(e)
    await png(e.src, 'vivas/panda/feliz.png', animal({ w: 130, h: 150 })) // recortado/ampliado por engano
    await assert.rejects(() => e.run(), (error) => {
      assert.ok(error instanceof VivasBuildError)
      assert.match(error.message, /vivas\/panda\/feliz\.png: canvas 130×150 diferente da base 120×140/u)
      return true
    })
    assert.deepEqual(e.tracked, [])
    assert.throws(() => readdirSync(join(e.out, 'vivas')), /ENOENT/u)
  } finally { e.done() }
})

test('registro quebrado (mexeu FORA do rosto) → FALHA e diz onde; passa quando a mudança está na máscara', async () => {
  const e = env()
  try {
    await happy(e)
    await png(e.src, 'vivas/panda/feliz.png', animal({ eyes: [[47, 40], [61, 40]], mutate: (img) => px(img, 100, 130, [255, 0, 0, 255]) })) // pixel solto no canto
    await assert.rejects(() => e.run(), (error) => {
      assert.match(error.message, /vivas\/panda\/feliz\.png: registro com a base falhou \[pixels fora da máscara\] 1 pixel\(s\) diferem fora da máscara/u)
      assert.match(error.message, /\(100,130\)/u)
      return true
    })
  } finally { e.done() }
})

test('todos os problemas de todos os animais saem juntos (não para no primeiro); animal bom não é gravado se outro falha', async () => {
  const e = env()
  try {
    await happy(e, 'panda')
    await happy(e, 'lobo')
    await png(e.src, 'vivas/lobo/feliz.png', animal({ w: 100, h: 100, cx: 50, cy: 50, r: 30, eyes: [] }))
    await png(e.src, 'vivas/gato/base.png', animal()) // sem mask.json
    await assert.rejects(() => e.run(), (error) => {
      assert.equal(error.problems.length, 2)
      assert.match(error.message, /vivas\/lobo\/feliz\.png: canvas/u)
      assert.match(error.message, /vivas\/gato\/mask\.json: falta a máscara/u)
      return true
    })
    assert.deepEqual(e.tracked, []) // o panda, que estava bom, também não saiu
  } finally { e.done() }
})

test('arquivos que faltam ou estão errados: base, mask.json, nomes, máscara fora do canvas, expressão extra sem imagem', async () => {
  const e = env()
  try {
    await png(e.src, 'vivas/semBase/feliz.png', animal())
    writeJson(e.src, 'vivas/semBase/mask.json', { mask: FACE })
    await png(e.src, 'vivas/Nome-Ruim/base.png', animal())
    await png(e.src, 'vivas/ok/base.png', animal())
    await png(e.src, 'vivas/ok/Feliz.png', animal())
    writeJson(e.src, 'vivas/ok/mask.json', { mask: [100, 120, 50, 50], expressions: { sumiu: { masks: [[1, 1, 2, 2]] } } })
    await assert.rejects(() => e.run(), (error) => {
      const text = error.problems.join('\n')
      assert.match(text, /vivas\/Nome-Ruim: nome de pasta inválido/u)
      assert.match(text, /vivas\/ok\/Feliz\.png: nome de expressão inválido/u)
      assert.match(text, /vivas\/semBase: nome de pasta inválido|vivas\/semBase\/base\.png: falta a imagem base/u)
      return true
    })
    // máscara fora do canvas e expressão extra sem imagem, com nomes corretos
    const e2 = env()
    try {
      await png(e2.src, 'vivas/ok/base.png', animal())
      await png(e2.src, 'vivas/ok/feliz.png', animal())
      writeJson(e2.src, 'vivas/ok/mask.json', { mask: [100, 120, 50, 50], expressions: { sumiu: { masks: [[1, 1, 2, 2]] } } })
      await assert.rejects(() => e2.run(), (error) => {
        assert.match(error.message, /a máscara 100,120,50,50 passa do canvas da base \(120×140\)/u)
        assert.match(error.message, /"expressions\.sumiu" não tem sumiu\.png/u)
        return true
      })
    } finally { e2.done() }
  } finally { e.done() }
})

test('base vazia e mask.json quebrado viram problema, não exceção solta', async () => {
  const e = env()
  try {
    await png(e.src, 'vivas/vazio/base.png', { width: 20, height: 20, data: new Uint8Array(20 * 20 * 4) })
    writeJson(e.src, 'vivas/vazio/mask.json', { mask: [1, 1, 4, 4] })
    await png(e.src, 'vivas/torto/base.png', animal())
    writeFileSync(join(e.src, 'vivas/torto/mask.json'), '{ isto nao e json')
    await assert.rejects(() => e.run(), (error) => {
      assert.match(error.message, /vivas\/vazio\/base\.png: a base não tem desenho/u)
      assert.match(error.message, /vivas\/torto\/mask\.json: /u)
      return true
    })
  } finally { e.done() }
})

test('escala única: canvas alto encolhe TODAS as expressões para o mesmo tamanho exato, pela mesma escala', async () => {
  const e = env()
  try {
    await happy(e)
    const result = await e.run({ maxHeight: 50 }) // corte 97×97 → altura 50
    const [{ size, scale }] = result.animals
    assert.deepEqual(size, [50, 50])
    assert.ok(Math.abs(scale - 50 / 97) < 1e-9)
    for (const name of ['base', 'feliz', 'pensando']) {
      const img = await readRgba(join(e.out, `vivas/panda-${name}.webp`), sharp)
      assert.deepEqual([img.width, img.height], [50, 50], name)
    }
    const json = JSON.parse(readFileSync(join(e.out, 'vivas/panda.json'), 'utf8'))
    assert.deepEqual(json.mask[0], maskToOutput({ x: FACE[0], y: FACE[1], w: FACE[2], h: FACE[3] }, json.crop, json.scale))
  } finally { e.done() }
})

test('animais diferentes têm cortes diferentes (um corte por animal, nunca um global)', async () => {
  const e = env()
  try {
    await happy(e, 'panda')
    await happy(e, 'lobo', { cx: 70, cy: 90, r: 30, eyes: [[58, 70], [70, 70]] })
    writeJson(e.src, 'vivas/lobo/mask.json', { mask: [55, 65, 30, 20] })
    await png(e.src, 'vivas/lobo/feliz.png', animal({ cx: 70, cy: 90, r: 30, eyes: [[57, 72], [71, 72]] }))
    await png(e.src, 'vivas/lobo/pensando.png', animal({ cx: 70, cy: 90, r: 30, eyes: [[60, 68], [70, 68]] }))
    await e.run()
    const panda = JSON.parse(readFileSync(join(e.out, 'vivas/panda.json'), 'utf8'))
    const lobo = JSON.parse(readFileSync(join(e.out, 'vivas/lobo.json'), 'utf8'))
    assert.notDeepEqual(panda.crop, lobo.crop)
    assert.deepEqual(lobo.crop, cropRectOf(animal({ cx: 70, cy: 90, r: 30, eyes: [[58, 70], [70, 70]] })))
  } finally { e.done() }
})

test('tolerância no mask.json deixa passar ruído declarado; sem ela o mesmo ruído falha', async () => {
  const e = env()
  try {
    await happy(e)
    await png(e.src, 'vivas/panda/feliz.png', animal({ eyes: [[47, 40], [61, 40]], mutate: (img) => { px(img, 100, 130, [255, 0, 0, 255]); px(img, 101, 130, [255, 0, 0, 255]) } }))
    await assert.rejects(() => e.run(), /registro com a base falhou/u)
    writeJson(e.src, 'vivas/panda/mask.json', { mask: FACE, tolerance: { maxDiffPixels: 2, bboxTol: 30, centroidTol: 2 } })
    await e.run()
    assert.ok(outFiles(e).includes('panda-feliz.webp'))
  } finally { e.done() }
})

test('máscara extra só da expressão: a pata que sobe é permitida em "pensando" e proibida em "feliz"', async () => {
  const e = env()
  try {
    await happy(e)
    const paw = (img) => { for (let y = 70; y < 76; y += 1) for (let x = 90; x < 96; x += 1) px(img, x, y, [255, 255, 255, 255]) } // fora do rosto, sobre o corpo
    await png(e.src, 'vivas/panda/pensando.png', animal({ eyes: [[50, 36], [62, 36]], mutate: paw }))
    await assert.rejects(() => e.run(), /vivas\/panda\/pensando\.png: registro/u) // sem a máscara extra, falha
    writeJson(e.src, 'vivas/panda/mask.json', { mask: FACE, expressions: { pensando: { masks: [[88, 68, 10, 10]] } } })
    await e.run()
    assert.ok(outFiles(e).includes('panda-pensando.webp'))
    const json = JSON.parse(readFileSync(join(e.out, 'vivas/panda.json'), 'utf8'))
    assert.equal(json.expressions.pensando.extraMask.length, 1)
    assert.equal(json.expressions.feliz.extraMask.length, 0)
  } finally { e.done() }
})

test('mask.json: TODOS os formatos — array curto [x,y,w,h], array de arrays, {mask}, {masks}, {x,y,w,h} — dão as mesmas máscaras', () => {
  const one = [{ x: 1, y: 2, w: 3, h: 4 }]
  assert.deepEqual(parseMaskFile([1, 2, 3, 4]).masks, one)
  assert.deepEqual(parseMaskFile([[1, 2, 3, 4]]).masks, one)
  assert.deepEqual(parseMaskFile({ mask: [1, 2, 3, 4] }).masks, one)
  assert.deepEqual(parseMaskFile({ masks: [[1, 2, 3, 4]] }).masks, one)
  assert.deepEqual(parseMaskFile({ mask: { x: 1, y: 2, w: 3, h: 4 } }).masks, one)
  assert.deepEqual(parseMaskFile([[1, 2, 3, 4], [5, 6, 7, 8]]).masks.length, 2)
  assert.deepEqual(parseMaskFile([180, 140, 664, 620]).masks, [{ x: 180, y: 140, w: 664, h: 620 }]) // o formato real que a Brush entrega
  for (const bad of [[], [1, 2, 3], [1, 2, 3, 4, 5], ['a', 'b', 'c', 'd'], [[1, 2, 3]], [-1, 0, 5, 5], [0, 0, 0, 5], 7, null, 'x']) assert.throws(() => parseMaskFile(bad), Error, JSON.stringify(bad))
})

test('mask.json em ARRAY e com BOM (o que a Brush entrega) passa de ponta a ponta pelo build', async () => {
  const e = env()
  try {
    await happy(e)
    writeFileSync(join(e.src, 'vivas/panda/mask.json'), `\uFEFF${JSON.stringify(FACE)}`) // [x,y,w,h] com BOM
    const result = await e.run()
    assert.equal(result.animals.length, 1)
    assert.deepEqual(JSON.parse(readFileSync(join(e.out, 'vivas/panda.json'), 'utf8')).mask.length, 1)
    writeFileSync(join(e.src, 'vivas/panda/mask.json'), `\uFEFF${JSON.stringify({ mask: FACE })}`) // objeto com BOM
    assert.equal((await e.run()).animals.length, 1)
  } finally { e.done() }
})

test('validateVivas: valida SEM gravar nada (é a fase que roda ANTES de o build apagar a saída); problema = VivasBuildError; sem pasta = nenhum plano', async () => {
  const e = env()
  try {
    assert.deepEqual(await validateVivas({ src: e.src, sharp }), { plans: [] })
    await happy(e)
    const { plans } = await validateVivas({ src: e.src, sharp })
    assert.equal(plans.length, 1)
    assert.equal(plans[0].animal, 'panda')
    assert.deepEqual(plans[0].expressions, ['feliz', 'pensando'])
    assert.deepEqual(readdirSync(e.out), []) // nada foi escrito
    await png(e.src, 'vivas/panda/feliz.png', animal({ w: 130, h: 150 }))
    await assert.rejects(() => validateVivas({ src: e.src, sharp }), VivasBuildError)
    assert.deepEqual(readdirSync(e.out), [])
  } finally { e.done() }
})

test('buildVivas com os planos prontos só grava (não valida de novo); sem planos valida sozinho', async () => {
  const e = env()
  try {
    await happy(e)
    const { plans } = await validateVivas({ src: e.src, sharp })
    const result = await e.run({ plans })
    assert.equal(result.animals.length, 1)
    assert.ok(outFiles(e).includes('panda-feliz.webp'))
  } finally { e.done() }
})

test('buildVivas aceita os planos como array OU como o objeto { plans } do validateVivas (o bug de 1 token que derrubou o build real)', async () => {
  const e = env()
  try {
    await happy(e)
    const validated = await validateVivas({ src: e.src, sharp })
    assert.equal((await e.run({ plans: validated })).animals.length, 1) // o objeto inteiro, como o build-assets passou por engano
    rmSync(join(e.out, 'vivas'), { recursive: true, force: true })
    assert.equal((await e.run({ plans: validated.plans })).animals.length, 1) // o array
    assert.ok(outFiles(e).includes('panda-feliz.webp'))
  } finally { e.done() }
})

test('arquivo que começa com "_" (rascunho / recorte de detalhe) fica na pasta e FORA do build, mesmo com canvas diferente — o caso real do lobo-guara', async () => {
  const e = env()
  try {
    await happy(e)
    await png(e.src, 'vivas/panda/_pensando-detalhe.png', animal({ w: 45, h: 56, cx: 20, cy: 28, r: 15, eyes: [] })) // outro canvas, como pensando-v3-detalhe.png (450x560 numa base 1024x1024)
    await png(e.src, 'vivas/panda/pensando-detalhe.png', animal({ w: 45, h: 56, cx: 20, cy: 28, r: 15, eyes: [] })) // sem o "_" é expressão e reprova
    await assert.rejects(() => e.run(), /vivas\/panda\/pensando-detalhe\.png: canvas 45×56 diferente da base 120×140/u)
    rmSync(join(e.src, 'vivas/panda/pensando-detalhe.png'))
    await e.run()
    assert.deepEqual(outFiles(e), ['panda-base.webp', 'panda-feliz.webp', 'panda-pensando.webp', 'panda.json']) // nada do _detalhe
  } finally { e.done() }
})

test('o gancho no build-assets.mjs: importa o módulo e chama buildVivas ANTES do orçamento; o arquivo continua 100% CRLF; o resto do pipeline não mudou de ordem', () => {
  const text = readFileSync(join(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1')), 'build-assets.mjs'), 'utf8')
  const lf = (text.match(/(?<!\r)\n/gu) ?? []).length
  const crlf = (text.match(/\r\n/gu) ?? []).length
  assert.ok(lf === 0 || crlf === 0, 'build-assets.mjs mistura CRLF e LF: edite com âncora que preserve o final de linha do arquivo') // hoje LF puro; já foi CRLF puro
  assert.ok(lf + crlf > 500)
  assert.match(text, /import \{ buildVivas, validateVivas \} from '\.\/vivas-assets\.mjs'/u)
  const hook = text.indexOf('await buildVivas(')
  const budget = text.indexOf('const totalBytes = manifest.reduce')
  const poses = text.indexOf("await poseDerivative(join(SRC, 'poses', file)")
  assert.ok(hook > poses && hook < budget, 'o gancho precisa ficar depois das poses e antes do cálculo do orçamento')
  assert.equal(text.split('await buildVivas(').length, 2)
  const validate = text.indexOf('await validateVivas(')
  const wipe = text.indexOf('rmSync(OUT')
  assert.ok(validate > 0 && validate < wipe, 'a validação das vivas precisa vir ANTES do rmSync(OUT): uma máscara torta não pode deixar a árvore sem generated-imports.ts')
  assert.equal(text.split('await validateVivas(').length, 2)
})
