// COLHEITA-S1 · P2-01 (Carbon): `crypto.randomUUID` quebra em HTTP na LAN (só existe em origem segura) e o lint do repo o restringe.
// Vermelho primeiro: a varredura do código do client acha as seis ocorrências. O helper `randomUuid` (remote/random-id.ts) é o troco.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = fileURLToPath(new URL('../src/client', import.meta.url))

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.(ts|tsx)$/u.test(name) ? [full] : []
  })
}

describe('P2-01 · sem crypto.randomUUID no client (HTTP na LAN)', () => {
  it('nenhum arquivo do client chama crypto.randomUUID (o helper randomUuid faz o mesmo sem a origem segura)', () => {
    const hits = sourceFiles(SRC)
      .filter(file => !relative(SRC, file).replace(/\\/gu, '/').endsWith('remote/random-id.ts'))
      .flatMap((file) => {
        const lines = readFileSync(file, 'utf8').split('\n')
        return lines.flatMap((line, index) => (/crypto\.randomUUID\(/u.test(line) ? [`${relative(SRC, file)}:${String(index + 1)}`] : []))
      })
    expect(hits).toEqual([])
  })
})
