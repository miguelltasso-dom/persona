/** Visible lock queue: wait-max fails instead of hanging 45 min. */
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const lockDir = join(root, '.maestri', 'locks', 'build.lock')
rmSync(lockDir, { recursive: true, force: true })
mkdirSync(lockDir, { recursive: true })
writeFileSync(join(lockDir, 'owner.json'), JSON.stringify({
  label: 'fake-holder', pid: process.pid, since: new Date().toISOString(), command: 'sleep',
}))
const script = join(root, 'scripts', 'persona', 'with-lock.mjs')
const result = spawnSync(process.execPath, [script, '--wait-max', '800', 'waiter', '--', process.execPath, '-e', 'process.exit(0)'], {
  cwd: root, encoding: 'utf8', windowsHide: true,
})
rmSync(lockDir, { recursive: true, force: true })
if (result.status !== 75) {
  console.error(result.stderr, result.stdout, result.status)
  process.exit(1)
}
if (!`${result.stderr}`.includes('timed out') || !`${result.stderr}`.includes('fila:')) {
  console.error('missing timeout/fila pulse', result.stderr)
  process.exit(1)
}
console.log('with-lock wait-max: ok')
