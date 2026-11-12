// node --test scripts/persona/assets-swap.test.mjs
// Unidade (trava, staging, troca, espelho) + PONTA A PONTA: o build-assets.mjs REAL copiado para um sandbox com 1 animal sintético (sucesso, falha cedo, falha TARDIA, dois builds ao mesmo tempo, trava morta).
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { loadSharp } from './check-pose-register.mjs'
import { acquireLock, beginStaging, commitStaging, discardStaging, mirror, oldPathOf, pidAlive, stagingPathOf } from './assets-swap.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..', '..')
const RM = { recursive: true, force: true, maxRetries: 10, retryDelay: 150 }
const tmp = () => mkdtempSync(join(tmpdir(), 'swap-'))
const put = (root, rel, text) => { const path = join(root, rel); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text) }
const tree = (dir, base = dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? tree(join(dir, e.name), base) : [join(dir, e.name).slice(base.length + 1).replaceAll('\\', '/')])).sort()

// ------------------------------------------------------------------------------------------------------------------------------ unidade

test('pidAlive: o próprio processo está vivo; pid inventado/zero/lixo não', () => {
  assert.equal(pidAlive(process.pid), true)
  for (const bad of [0, -1, 3.5, undefined, 'x', 99_999_999]) assert.equal(pidAlive(bad), false, String(bad))
})

test('trava: a primeira pega; a segunda ESPERA e só entra depois que a primeira solta; liberar é idempotente', async () => {
  const root = tmp()
  const lock = join(root, 'locks', 'assets.lock')
  try {
    const release1 = await acquireLock(lock, { pollMs: 20 })
    assert.equal(JSON.parse(readFileSync(join(lock, 'owner.json'), 'utf8')).pid, process.pid)
    let second = false
    const waiting = acquireLock(lock, { pollMs: 20, waitMs: 5000 }).then((release) => { second = true; return release })
    await new Promise((r) => setTimeout(r, 150))
    assert.equal(second, false, 'o segundo não pode entrar enquanto o primeiro segura')
    release1(); release1()
    const release2 = await waiting
    assert.equal(second, true)
    release2()
    assert.equal(existsSync(lock), false)
  } finally { rmSync(root, RM) }
})

test('trava: de processo MORTO é roubada; pasta sem dono recém-criada não (está sendo criada), antiga sim; desiste com mensagem clara no timeout', async () => {
  const root = tmp()
  try {
    const dead = join(root, 'a.lock')
    put(dead, 'a.lock/owner.json', JSON.stringify({ pid: 99_999_999, label: 'build-assets', at: 'ontem' }))
    const release = await acquireLock(dead, { pollMs: 20 })
    release()
    // sem dono e recém-criada: espera (não rouba) e estoura o tempo
    const fresh = join(root, 'b.lock')
    mkdirSync(fresh, { recursive: true })
    await assert.rejects(() => acquireLock(fresh, { pollMs: 20, waitMs: 120 }), /segura a trava de assets/u)
    assert.equal(existsSync(fresh), true)
    // dono vivo: o erro nomeia o pid
    const alive = join(root, 'c.lock')
    put(root, 'c.lock/owner.json', JSON.stringify({ pid: process.pid, label: 'outro build', at: 'agora' }))
    await assert.rejects(() => acquireLock(alive, { pollMs: 20, waitMs: 100 }), new RegExp(`outro build \\(pid ${String(process.pid)}`, 'u'))
  } finally { rmSync(root, RM) }
})

test('staging: beginStaging limpa sobra antiga; discard some com ele e não toca no real', () => {
  const root = tmp()
  try {
    const real = join(root, 'assets')
    put(root, 'assets/velho.txt', 'real')
    put(root, 'assets.__building/lixo-de-build-que-morreu.txt', 'x')
    const staging = beginStaging(real)
    assert.equal(staging, stagingPathOf(real))
    assert.deepEqual(tree(staging), [])
    put(staging, 'novo.txt', 'n')
    discardStaging(real)
    assert.equal(existsSync(staging), false)
    assert.deepEqual(tree(real), ['velho.txt'])
  } finally { rmSync(root, RM) }
})

test('troca por rename: o real vira o novo, o antigo e o staging somem', () => {
  const root = tmp()
  try {
    const real = join(root, 'assets')
    put(root, 'assets/antigo.txt', 'a')
    put(root, 'assets.__building/novo.txt', 'n')
    assert.deepEqual(commitStaging(real), { mode: 'rename' })
    assert.deepEqual(tree(real), ['novo.txt'])
    assert.equal(existsSync(stagingPathOf(real)), false)
    assert.equal(existsSync(oldPathOf(real)), false)
  } finally { rmSync(root, RM) }
})

test('troca com o rename FALHANDO (antivírus/dev server com handle): espelha por cima, nunca esvazia o real; sem real ainda também funciona', () => {
  const root = tmp()
  try {
    const real = join(root, 'assets')
    put(root, 'assets/antigo.txt', 'a')
    put(root, 'assets/sub/so-no-real.txt', 's')
    put(root, 'assets/comum.txt', 'velho')
    put(root, 'assets.__building/comum.txt', 'novo')
    put(root, 'assets.__building/so-no-novo.txt', 'n')
    let calls = 0
    const rename = () => { calls += 1; const error = new Error('EPERM'); error.code = 'EPERM'; throw error }
    assert.deepEqual(commitStaging(real, { rename }), { mode: 'mirror' })
    assert.ok(calls >= 1)
    assert.deepEqual(tree(real), ['comum.txt', 'so-no-novo.txt']) // o que não está no novo saiu (inclusive a pasta vazia); o que está foi copiado por cima
    assert.equal(readFileSync(join(real, 'comum.txt'), 'utf8'), 'novo')
    assert.equal(existsSync(stagingPathOf(real)), false)
    assert.equal(existsSync(oldPathOf(real)), false)
    // sem real
    const real2 = join(root, 'outro')
    put(root, 'outro.__building/x.txt', 'x')
    assert.deepEqual(commitStaging(real2, { rename }), { mode: 'mirror' })
    assert.deepEqual(tree(real2), ['x.txt'])
    assert.throws(() => commitStaging(join(root, 'sem-staging')), /staging não existe/u)
  } finally { rmSync(root, RM) }
})

test('mirror: copia por cima, remove só o que sobrou e poda diretórios vazios', () => {
  const root = tmp()
  try {
    put(root, 'de/a.txt', '1'); put(root, 'de/n/b.txt', '2')
    put(root, 'para/a.txt', 'velho'); put(root, 'para/extra.txt', 'x'); put(root, 'para/morto/c.txt', 'y')
    mirror(join(root, 'de'), join(root, 'para'))
    assert.deepEqual(tree(join(root, 'para')), ['a.txt', 'n/b.txt'])
    assert.equal(readFileSync(join(root, 'para/a.txt'), 'utf8'), '1')
  } finally { rmSync(root, RM) }
})

// ------------------------------------------------------------------------------------------------------------------------------ ponta a ponta

const sharp = loadSharp()
sharp.cache(false)

/** Cópia do build REAL num sandbox DENTRO do repo (para o `import sharp` resolver como o script de verdade), com 1 animal sintético. */
async function sandbox() {
  const root = join(REPO, '.maestri', 'tmp', `gauge-sandbox-${String(process.pid)}-${String(Date.now())}-${Math.random().toString(36).slice(2, 6)}`)
  mkdirSync(join(root, 'scripts/persona'), { recursive: true })
  for (const f of ['build-assets.mjs', 'vivas-assets.mjs', 'check-pose-register.mjs', 'assets-swap.mjs']) copyFileSync(join(HERE, f), join(root, 'scripts/persona', f))
  for (const d of ['brand', 'icons/nav', 'poses', 'illustrations', 'stickers']) mkdirSync(join(root, 'persona-assets', d), { recursive: true })
  const draw = async (path, eyes) => {
    const w = 120; const h = 140
    const data = Buffer.alloc(w * h * 4)
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) if (Math.hypot(x - 60, y - 70) <= 40) data.set([200, 150, 90, 255], (y * w + x) * 4)
    for (const [ex, ey] of eyes) for (let dy = 0; dy < 3; dy += 1) for (let dx = 0; dx < 3; dx += 1) data.set([20, 20, 20, 255], ((ey + dy) * w + ex + dx) * 4)
    mkdirSync(dirname(path), { recursive: true })
    await sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toFile(path)
  }
  await draw(join(root, 'persona-assets/vivas/panda/base.png'), [[48, 38], [60, 38]])
  await draw(join(root, 'persona-assets/vivas/panda/feliz.png'), [[47, 40], [61, 40]])
  writeFileSync(join(root, 'persona-assets/vivas/panda/mask.json'), '﻿[40,30,30,24]') // array + BOM, como a Brush entrega
  return { root, out: join(root, 'packages/persona/client-ui-persona/src/client/assets'), lock: join(root, '.maestri/locks/assets-build.lock'), draw }
}

const ENOENT_DIR = /ENOENT.*scandir '([^']+)'/u
/** Roda o build real; se faltar uma pasta de FONTE que o pipeline lê sem checar, cria e repete (o sandbox é mínimo). */
function runBuild(root) {
  let result
  for (let i = 0; i < 16; i += 1) {
    result = spawnSync(process.execPath, [join(root, 'scripts/persona/build-assets.mjs')], { cwd: root, encoding: 'utf8' })
    const missing = ENOENT_DIR.exec(`${result.stderr}${result.stdout}`)
    if (result.status === 0 || missing === null) return result
    mkdirSync(missing[1], { recursive: true })
  }
  return result
}
const seedReal = (s) => { put(s.out, 'asset-url.ts', 'export const assetUrl = (x: string) => x\n'); put(s.out, 'sobra-de-build-antigo.txt', 'sobra'); put(s.out, 'mao/Escrito.tsx', 'export const A = 1\n') }
const leftovers = (s) => ['.__building', '.__old'].filter((suffix) => existsSync(`${s.out}${suffix}`))

test('E2E sucesso: o build REAL gera tudo, preserva o que é escrito à mão, tira a sobra antiga, e não deixa staging nem trava', async () => {
  const s = await sandbox()
  try {
    seedReal(s)
    const run = runBuild(s.root)
    assert.equal(run.status, 0, run.stdout + run.stderr)
    assert.match(run.stdout, /\[assets\] swapped into place \((?:rename|mirror)\)/u)
    const files = tree(s.out)
    for (const must of ['generated-imports.ts', 'manifest.build.json', 'vivas/panda-base.webp', 'vivas/panda-feliz.webp', 'vivas/panda.json', 'asset-url.ts', 'mao/Escrito.tsx']) assert.ok(files.includes(must), `faltou ${must}: ${files.join(', ')}`)
    assert.equal(files.includes('sobra-de-build-antigo.txt'), false)
    assert.equal(readFileSync(join(s.out, 'asset-url.ts'), 'utf8'), 'export const assetUrl = (x: string) => x\n') // o rastreado atravessou o build
    assert.deepEqual(leftovers(s), [])
    assert.equal(existsSync(s.lock), false, 'a trava tem de ser solta')
  } finally { rmSync(s.root, RM) }
})

test('E2E falha CEDO (mask.json/canvas torto): exit 1, mensagem das vivas, e o assets/ REAL fica EXATAMENTE como estava', async () => {
  const s = await sandbox()
  try {
    seedReal(s)
    const before = tree(s.out)
    await s.draw(join(s.root, 'persona-assets/vivas/panda/feliz.png'), []) // ok…
    const sharpBad = sharp({ create: { width: 50, height: 50, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 1 } } })
    await sharpBad.png().toFile(join(s.root, 'persona-assets/vivas/panda/feliz.png')) // …agora com OUTRO canvas
    const run = runBuild(s.root)
    assert.equal(run.status, 1)
    assert.match(run.stderr, /vivas\/panda\/feliz\.png: canvas 50×50 diferente da base 120×140/u)
    assert.deepEqual(tree(s.out), before)
    assert.equal(readFileSync(join(s.out, 'asset-url.ts'), 'utf8'), 'export const assetUrl = (x: string) => x\n')
    assert.deepEqual(leftovers(s), [])
    assert.equal(existsSync(s.lock), false)
  } finally { rmSync(s.root, RM) }
})

test('E2E falha TARDIA (um PNG de pose corrompido, DEPOIS de o build já ter começado a gerar): exit 1 e o assets/ REAL continua intacto, com asset-url.ts e sem staging', async () => {
  const s = await sandbox()
  try {
    seedReal(s)
    const before = tree(s.out)
    writeFileSync(join(s.root, 'persona-assets/poses/panda-disponivel.png'), 'isto não é um png') // só falha quando o pipeline chega nas poses
    const run = runBuild(s.root)
    assert.equal(run.status, 1, run.stdout + run.stderr)
    assert.doesNotMatch(run.stdout, /swapped into place/u)
    assert.deepEqual(tree(s.out), before) // nada do build novo vazou para o real e nada do antigo sumiu
    assert.ok(existsSync(join(s.out, 'asset-url.ts')))
    assert.ok(existsSync(join(s.out, 'sobra-de-build-antigo.txt')))
    assert.deepEqual(leftovers(s), [])
    assert.equal(existsSync(s.lock), false)
  } finally { rmSync(s.root, RM) }
})

test('E2E DOIS builds ao mesmo tempo: rodam um depois do outro (trava), os dois terminam bem e o resultado é consistente, sem o asset-url.ts sumir', async () => {
  const s = await sandbox()
  try {
    seedReal(s)
    runBuild(s.root) // aquece as pastas de fonte que o pipeline exige
    seedReal(s)
    const launch = () => new Promise((resolve) => {
      const child = spawn(process.execPath, [join(s.root, 'scripts/persona/build-assets.mjs')], { cwd: s.root })
      let out = ''
      child.stdout.on('data', (d) => { out += d }); child.stderr.on('data', (d) => { out += d })
      child.on('exit', (code) => resolve({ code, out }))
    })
    const [a, b] = await Promise.all([launch(), launch()])
    assert.equal(a.code, 0, a.out)
    assert.equal(b.code, 0, b.out)
    const files = tree(s.out)
    for (const must of ['generated-imports.ts', 'asset-url.ts', 'vivas/panda-base.webp', 'manifest.build.json']) assert.ok(files.includes(must), `faltou ${must}`)
    assert.deepEqual(leftovers(s), [])
    assert.equal(existsSync(s.lock), false)
  } finally { rmSync(s.root, RM) }
})

test('E2E trava de um build que MORREU (pid morto) é roubada: o build novo não fica preso', async () => {
  const s = await sandbox()
  try {
    seedReal(s)
    put(s.root, '.maestri/locks/assets-build.lock/owner.json', JSON.stringify({ pid: 99_999_999, label: 'build-assets', at: 'ontem' }))
    const run = runBuild(s.root)
    assert.equal(run.status, 0, run.stdout + run.stderr)
    assert.equal(existsSync(s.lock), false)
  } finally { rmSync(s.root, RM) }
})
