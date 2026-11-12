// BUILD DE ASSETS SEGURO (Gauge 12/11, pedido do Keel e do Lumen): o build-assets.mjs apagava client/assets/ ANTES de regenerar. Um erro no meio (máscara torta, PNG ruim, orçamento) ou dois builds ao
// mesmo tempo deixavam a árvore sem generated-imports.ts / asset-url.ts e derrubavam typecheck, vitest e bundle de todo mundo por minutos (aconteceu 4× em 02:28–02:40).
// Aqui estão as 3 peças que tornam isso impossível:
//   1. TRAVA de um build por vez (`acquireLock`): o segundo espera o primeiro terminar (ou desiste com mensagem clara); trava de processo morto é roubada.
//   2. STAGING (`stagingPathOf`): o build escreve em `<assets>.__building`; o `assets/` REAL nunca é apagado antes de ficar tudo pronto.
//   3. TROCA no fim (`commitStaging`): rename real → .__old, staging → real, apaga .__old. Se o rename falhar (Windows: antivírus/dev server com handle aberto → EPERM/EBUSY), cai para ESPELHAR o
//      staging sobre o real (copia por cima e remove só o que sobrou), sem nunca esvaziar a pasta. Qualquer erro ANTES da troca = `discardStaging` e o real continua como estava.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export const LOCK_WAIT_MS = 20 * 60_000
/** Uma pasta de trava sem `owner.json` mais nova que isto está sendo criada agora (o dono ainda não escreveu o arquivo): não se rouba. */
export const OWNERLESS_GRACE_MS = 10_000

const RM = { recursive: true, force: true, maxRetries: 8, retryDelay: 100 }

export const stagingPathOf = (realOut) => `${realOut}.__building`
export const oldPathOf = (realOut) => `${realOut}.__old`

export function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try { process.kill(pid, 0); return true } catch (error) { return error.code === 'EPERM' } // EPERM = existe, é de outro usuário
}

function readOwner(lockDir) {
  try { return JSON.parse(readFileSync(join(lockDir, 'owner.json'), 'utf8')) } catch { return undefined }
}

/**
 * Pega a trava exclusiva do build de assets. O segundo build ESPERA (não corre junto).
 * @param {string} lockDir - pasta usada como trava (mkdir é atômico).
 * @param {{ waitMs?: number, pollMs?: number, log?: (m: string) => void, label?: string }} [options]
 * @returns {Promise<() => void>} libera a trava (idempotente); também libera ao sair do processo.
 */
export async function acquireLock(lockDir, { waitMs = LOCK_WAIT_MS, pollMs = 1000, log = () => undefined, label = 'build-assets' } = {}) {
  mkdirSync(dirname(lockDir), { recursive: true })
  const started = Date.now()
  let lastLog = 0
  for (;;) {
    try {
      mkdirSync(lockDir)
      writeFileSync(join(lockDir, 'owner.json'), JSON.stringify({ pid: process.pid, label, at: new Date().toISOString() }))
      break
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
      const owner = readOwner(lockDir)
      const age = (() => { try { return Date.now() - statSync(lockDir).mtimeMs } catch { return 0 } })()
      const stale = owner === undefined ? age > OWNERLESS_GRACE_MS : !pidAlive(owner.pid)
      if (stale) { rmSync(lockDir, RM); continue }
      if (Date.now() - started > waitMs) throw new Error(`outro ${owner?.label ?? 'build'} (pid ${String(owner?.pid)}, desde ${String(owner?.at)}) segura a trava de assets há mais de ${String(Math.round(waitMs / 1000))} s`)
      if (Date.now() - lastLog > 15_000) { log(`[assets] outro build está rodando (pid ${String(owner?.pid)}); esperando a vez…`); lastLog = Date.now() }
      await new Promise((resolve) => setTimeout(resolve, pollMs))
    }
  }
  let released = false
  const release = () => {
    if (released) return
    released = true
    try { if (readOwner(lockDir)?.pid === process.pid) rmSync(lockDir, RM) } catch { /* já foi */ }
  }
  process.once('exit', release)
  return release
}

/** Cria (limpa) o staging. @returns o caminho dele. */
export function beginStaging(realOut) {
  const staging = stagingPathOf(realOut)
  rmSync(staging, RM)
  mkdirSync(staging, { recursive: true })
  return staging
}

/** O build falhou antes da troca: joga o staging fora; o real não foi tocado. */
export function discardStaging(realOut) {
  rmSync(stagingPathOf(realOut), RM)
}

function* walkFiles(dir, base = dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* walkFiles(path, base)
    else yield path.slice(base.length + 1)
  }
}

/** Espelha `from` em `to`: copia tudo por cima e remove de `to` só o que não existe em `from`. Nunca esvazia `to`. */
export function mirror(from, to) {
  mkdirSync(to, { recursive: true })
  const wanted = new Set()
  for (const rel of walkFiles(from)) {
    wanted.add(rel)
    mkdirSync(dirname(join(to, rel)), { recursive: true })
    cpSync(join(from, rel), join(to, rel), { force: true })
  }
  if (existsSync(to)) {
    for (const rel of [...walkFiles(to)]) if (!wanted.has(rel)) rmSync(join(to, rel), RM)
    const prune = (dir) => { // diretórios que ficaram vazios
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const sub = join(dir, entry.name)
        prune(sub)
        if (readdirSync(sub).length === 0) rmSync(sub, RM)
      }
    }
    prune(to)
  }
}

/**
 * Troca o staging pelo real. Atômico quando o rename funciona; senão espelha (nunca deixa o real vazio).
 * @param {string} realOut
 * @param {{ rename?: typeof renameSync }} [fs] - só para teste (injetar a falha do rename).
 * @returns {{ mode: 'rename' | 'mirror' }}
 */
export function commitStaging(realOut, { rename = renameSync } = {}) {
  const staging = stagingPathOf(realOut)
  const old = oldPathOf(realOut)
  if (!existsSync(staging)) throw new Error(`staging não existe: ${staging}`)
  rmSync(old, RM)
  try {
    if (existsSync(realOut)) rename(realOut, old)
    rename(staging, realOut)
  } catch {
    // desfaz o meio-caminho: o real volta para o lugar; depois espelha (copia por cima) sem esvaziar nada
    try { if (!existsSync(realOut) && existsSync(old)) rename(old, realOut) } catch { /* segue para o espelho */ }
    mirror(staging, realOut)
    rmSync(staging, RM)
    rmSync(old, RM)
    return { mode: 'mirror' }
  }
  try { rmSync(old, RM) } catch { /* sobra um .__old; o próximo build limpa */ }
  return { mode: 'rename' }
}
