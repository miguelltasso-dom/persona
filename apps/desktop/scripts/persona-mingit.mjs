/** Fetch and verify Git for Windows' portable distribution for the Persona installer. */
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import extract from 'extract-zip'

export const MINGIT_ARCHIVE = 'MinGit-2.56.0.4-64-bit.zip'
export const MINGIT_SHA256 = 'e3bf78351fe777fba47ddee5950082f8a98bb0f02604fdc7ba3ee2cb68ffa877'
const URL = `https://github.com/git-for-windows/git/releases/download/v2.56.0.windows.4/${MINGIT_ARCHIVE}`

async function digest(file) {
  const hash = createHash('sha256')
  for await (const part of createReadStream(file)) hash.update(part)
  return hash.digest('hex')
}

/**
 * Install the exact verified upstream ZIP, retaining its complete license files.
 * @param {string} resources - Packaged resource directory.
 * @param {NodeJS.ProcessEnv} env - Optional packaging cache directory.
 * @returns {Promise<void>} Resolves after all portable Git files exist.
 */
export async function installPersonaMinGit(resources, env = process.env) {
  const cache = resolve(env.DSH_DESKTOP_PACKAGE_CACHE_DIR ?? join(tmpdir(), 'persona-package-cache'), 'mingit')
  await mkdir(cache, { recursive: true })
  const archive = join(cache, MINGIT_ARCHIVE)
  if (!existsSync(archive)) {
    const partial = join(cache, `${MINGIT_ARCHIVE}.${randomUUID()}.part`)
    try {
      const response = await fetch(URL, { signal: AbortSignal.timeout(180_000) })
      if (!response.ok || response.body === null) throw new Error(`MinGit download failed: HTTP ${response.status}`)
      await pipeline(Readable.fromWeb(response.body), createWriteStream(partial, { flags: 'wx' }))
      if (await digest(partial) !== MINGIT_SHA256) throw new Error('MinGit download checksum mismatch')
      await rename(partial, archive)
    } finally { await rm(partial, { force: true }) }
  }
  if (await digest(archive) !== MINGIT_SHA256) throw new Error('MinGit cached archive checksum mismatch')
  const destination = resolve(resources, 'mingit')
  if (existsSync(destination)) throw new Error('MinGit destination already exists')
  await extract(archive, { dir: destination })
  for (const file of ['cmd/git.exe', 'LICENSE.txt', 'ucrt64/bin/git.exe']) {
    if (!existsSync(join(destination, file))) throw new Error(`MinGit archive missing ${file}`)
  }
}
