/**
 * with-lock: (1) wait-max fails instead of hanging; (2) D-062 — locks with different names are independent
 * (build vs pack run together), the same name is exclusive. Uses throw-away lock names so it never touches
 * the real `build.lock` / `pack.lock` that other agents may be holding.
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

process.env.PERSONA_LOCK_NO_REAP = '1' // the test must not reap other agents' stale trees
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const script = join(root, 'scripts', 'persona', 'with-lock.mjs')
const suffix = String(process.pid)
const lockA = `test-a-${suffix}`
const lockB = `test-b-${suffix}`
const lockC = `test-c-${suffix}`
const dirOf = (name) => join(root, '.maestri', 'locks', `${name}.lock`)
const helper = join(root, '.maestri', 'tmp', `lock-test-${suffix}.mjs`)
const appender = join(root, '.maestri', 'tmp', `lock-test-append-${suffix}.mjs`)
const orderFile = join(root, '.maestri', 'tmp', `lock-test-order-${suffix}.txt`)
mkdirSync(dirname(helper), { recursive: true })
writeFileSync(helper, 'process.exit(process.env.PERSONA_LOCK === process.argv[2] ? 0 : 3)\n')
writeFileSync(appender, "import { appendFileSync } from 'node:fs'\nappendFileSync(process.argv[2], process.argv[3])\n")
const cleanup = () => {
  rmSync(helper, { force: true })
  rmSync(appender, { force: true })
  rmSync(orderFile, { force: true })
  for (const name of [lockA, lockB, lockC]) {
    rmSync(dirOf(name), { recursive: true, force: true })
    rmSync(join(root, '.maestri', 'locks', `${name}.q`), { recursive: true, force: true })
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

// (5) FIFO: with lock C held by a fake live holder, waiters W1 then W2 (started 900 ms apart) must run in arrival order
mkdirSync(dirOf(lockC), { recursive: true })
writeFileSync(join(dirOf(lockC), 'owner.json'), JSON.stringify({ label: 'fake-holder-c', pid: process.pid, since: new Date().toISOString(), command: 'sleep' }))
const run = (tag) => new Promise((done) => {
  const child = spawn(process.execPath, [script, '--lock', lockC, '--wait-max', '40000', `waiter-${tag}`, '--', 'node', appender, orderFile, tag], { cwd: root, windowsHide: true, stdio: 'ignore' })
  child.on('exit', (code) => done(code))
})
const first = run('1')
await new Promise((resolve) => setTimeout(resolve, 900))
const second = run('2')
await new Promise((resolve) => setTimeout(resolve, 1500))
rmSync(dirOf(lockC), { recursive: true, force: true })
const codes = await Promise.all([first, second])
let order = ''
try { order = readFileSync(orderFile, 'utf8') } catch { /* never ran */ }
if (codes.some((code) => code !== 0) || order !== '12') fail('waiters must acquire the lock in arrival order (FIFO)', `exit codes ${codes.join(',')} order="${order}"`)

// (6) D-065 slots: with `--slots 2`, two holders run together and a third waits for the first free slot
const lockD = `test-d-${suffix}`
const stamps = join(root, '.maestri', 'tmp', `lock-test-slots-${suffix}.txt`)
const slotJob = join(root, '.maestri', 'tmp', `lock-test-slotjob-${suffix}.mjs`)
writeFileSync(slotJob, "import { appendFileSync } from 'node:fs'\nconst [file, tag, ms] = process.argv.slice(2)\nappendFileSync(file, `start-${tag}@${Date.now()}\\n`)\nawait new Promise((done) => setTimeout(done, Number(ms)))\nappendFileSync(file, `end-${tag}@${Date.now()}\\n`)\n")
const slotRun = (tag, ms, extra = []) => new Promise((done) => {
  const child = spawn(process.execPath, [script, '--lock', lockD, '--slots', '2', ...extra, '--wait-max', '60000', `slot-${tag}`, '--', 'node', slotJob, stamps, tag, String(ms)], { cwd: root, windowsHide: true, stdio: 'ignore' })
  child.on('exit', (code) => done(code))
})
const sleepMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const readEvents = () => readFileSync(stamps, 'utf8').trim().split('\n').map((line) => { const [what, at] = line.split('@'); return { what, at: Number(at) } })
const cleanSlots = () => {
  for (const dir of [dirOf(lockD), dirOf(`${lockD}.1`)]) rmSync(dir, { recursive: true, force: true })
  rmSync(join(root, '.maestri', 'locks', `${lockD}.q`), { recursive: true, force: true })
  rmSync(join(root, '.maestri', 'locks', `${lockD}.queue.json`), { force: true })
}
const jobs = [slotRun('a', 4000)]
await sleepMs(600)
jobs.push(slotRun('b', 4000))
await sleepMs(600)
jobs.push(slotRun('c', 500))
const slotCodes = await Promise.all(jobs)
const events = readEvents()
const at = (what) => events.find((event) => event.what === what)?.at ?? Number.NaN
rmSync(stamps, { force: true })
cleanSlots()
if (slotCodes.some((code) => code !== 0)) fail('slot jobs should all succeed', slotCodes.join(','))
if (!(at('start-b') < at('end-a'))) fail('with 2 slots, the second holder must run together with the first', JSON.stringify(events))
if (!(at('start-c') >= Math.min(at('end-a'), at('end-b')) - 50)) fail('the third holder must wait for a free slot', JSON.stringify(events))

// (7) D-067 exclusive: a normal job runs, an --exclusive job waits for ALL slots, and a normal job queued behind it waits for it
const exJobs = [slotRun('x', 3000)]
await sleepMs(600)
exJobs.push(slotRun('e', 400, ['--exclusive']))
await sleepMs(600)
exJobs.push(slotRun('y', 300))
const exCodes = await Promise.all(exJobs)
const exEvents = readEvents()
const exAt = (what) => exEvents.find((event) => event.what === what)?.at ?? Number.NaN
rmSync(stamps, { force: true })
cleanSlots()
if (exCodes.some((code) => code !== 0)) fail('exclusive jobs should all succeed', exCodes.join(','))
if (!(exAt('start-e') >= exAt('end-x') - 50)) fail('an --exclusive job must wait for every running job', JSON.stringify(exEvents))
if (!(exAt('start-y') >= exAt('end-e') - 50)) fail('a job queued behind an --exclusive one must wait for it (FIFO)', JSON.stringify(exEvents))

// (8) D-067 memory guard: with an impossible free-memory floor the waiter never starts and times out with 75
const starved = spawnSync(process.execPath, [script, '--lock', lockD, '--wait-max', '1500', 'starved', '--', process.execPath, '-e', 'process.exit(0)'], {
  cwd: root, encoding: 'utf8', windowsHide: true, env: { ...process.env, PERSONA_LOCK_MIN_FREE_GB: '99999' },
})
cleanSlots()
if (starved.status !== 75 || !`${starved.stderr}`.includes('memória livre')) fail('the memory guard must hold the job back when RAM is below the floor', `${starved.stderr} status=${starved.status}`)

rmSync(slotJob, { force: true })
cleanup()
console.log('with-lock wait-max + independent locks (D-062) + FIFO + slots (D-065) + exclusive + memory guard (D-067): ok')
