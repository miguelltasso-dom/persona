import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { expect, it } from 'vitest'
import { installPersonaMinGit, MINGIT_ARCHIVE } from '../scripts/persona-mingit.mjs'

it('rejects a corrupt cached MinGit archive without using its contents', async () => {
  const root = await mkdtemp(join(tmpdir(), 'persona-mingit-test-'))
  try {
    await mkdir(join(root, 'mingit'))
    await writeFile(join(root, 'mingit', MINGIT_ARCHIVE), 'corrupt archive')
    await expect(installPersonaMinGit(join(root, 'resources'), { DSH_DESKTOP_PACKAGE_CACHE_DIR: root }))
      .rejects.toThrow('MinGit cached archive checksum mismatch')
  } finally {
    if (!resolve(root).startsWith(`${resolve(tmpdir())}${sep}`)) throw new Error('unexpected fixture directory')
    await rm(root, { recursive: true, force: true })
  }
})
