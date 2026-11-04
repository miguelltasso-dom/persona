/**
 * with-lock: (1) wait-max fails instead of hanging; (2) D-062 — locks with different names are independent
 * (build vs pack run together), the same name is exclusive. Uses throw-away lock names so it never touches
 * the real `build.lock` / `pack.lock` that other agents may be holding.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const script = join(root, 'scripts', 'persona', 'with-lock.mjs')
const suffix = String(process.pid)
const lockA = `test-a-${suffix}`
const lockB = `test-b-${suffix}`
const dirOf = (name) => join(root, '.maestri', 'locks', `${name}.lock`)
const helper = join(root, '.maestri', 'tmp', `lock-test-${suffix}.mjs`)
mkdirSync(dirname(helper), { recursive: true })
writeFileSync(helper, 'process.exit(process.env.PERSONA_LOCK === process.argv[2] ? 0 : 3)\n')
const cleanup = () => {
  rmSync(helper, { force: true })
  for (const name of [lockA, lockB]) {
    rmSync(dirOf(name), { recursive: true, force: true })
    rmSync(join(root, '.maestri', 'locks', `${name}.queue.json`), { force: true })
  }
}
const fail = (message, detail) => {
  cleanup()
  console.error(message, detail ?? '')
  process.exit(1)
}

// (1) wait-max: a fake live holder of lock A (this process) makes a waiter on A time out with exit 75
mkdirSync(dirOf(lockA), { recursive: true })
writeFileSync(join(dirOf(lockA), 'owner.json'), JSON.stringify({
  label: 'fake-holder', pid: process.pid, since: new Date().toISOString(), command: 'sleep',
}))
const waiter = spawnSync(process.execPath, [script, '--lock', lockA, '--wait-max', '800', 'waiter', '--', process.execPath, '-e', 'process.exit(0)'], {
  cwd: root, encoding: 'utf8', windowsHide: true,
})
if (waiter.status !== 75) fail('same-name waiter should time out with 75', `${waiter.stderr}${waiter.stdout} status=${waiter.status}`)
if (!`${waiter.stderr}`.includes('timed out') || !`${waiter.stderr}`.includes('fila:')) fail('missing timeout/fila pulse', waiter.stderr)

// (2) independence: with lock A still held, a command under lock B runs immediately and sees PERSONA_LOCK=B
const other = spawnSync(process.execPath, [script, '--lock', lockB, '--wait-max', '3000', 'independent', '--', 'node', helper, lockB], {
  cwd: root, encoding: 'utf8', windowsHide: true,
})
if (other.status !== 0) fail('a different lock name must not wait for the held one (and must export PERSONA_LOCK)', `${other.stderr}${other.stdout} status=${other.status}`)

// (3) the lock is released after the command: the same name can be taken again right away
const again = spawnSync(process.execPath, [script, '--lock', lockB, '--wait-max', '3000', 'again', '--', 'node', helper, lockB], {
  cwd: root, encoding: 'utf8', windowsHide: true,
})
if (again.status !== 0) fail('lock should be free after the previous holder exited', `${again.stderr} status=${again.status}`)

// (4) invalid names are rejected
const invalid = spawnSync(process.execPath, [script, '--lock', '../x', 'bad', '--', process.execPath, '-e', 'process.exit(0)'], {
  cwd: root, encoding: 'utf8', windowsHide: true,
})
if (invalid.status !== 2) fail('invalid lock name should exit 2', `${invalid.stderr} status=${invalid.status}`)

cleanup()
console.log('with-lock wait-max + independent locks (D-062): ok')
