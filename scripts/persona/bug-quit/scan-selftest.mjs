// Self-test of the process-ownership rule (scan-core.mjs, the code bug-quit.mjs really runs): a recycled pid must not pull a stranger in.
import { walkOwned } from './scan-core.mjs'

const t = s => `2026-11-05T04:${s}-03:00`
const root = { pid: 100, ppid: 1, name: 'Persona.exe', created: t('00:10.000'), cmd: '' }
const host = { pid: 200, ppid: 100, name: 'Persona.exe', created: t('00:12.000'), cmd: '' }
const startedAtMs = Date.parse(t('00:09.000'))
const fail = (message) => { console.log(`FAIL ${message}`); process.exit(1) }
const keys = map => [...map.keys()].sort((a, b) => a - b).join(',')

// 1. pid 300 was a member, died, and was recycled by somebody else's process which has its own child (an agent's `maestri ask`)
const known = new Map([[200, host], [300, { pid: 300, ppid: 200, name: 'tasklist.exe', created: t('00:20.000'), cmd: '' }]])
const recycled = { pid: 300, ppid: 9, name: 'bash.exe', created: t('19:00.000'), cmd: '' }
const stranger = { pid: 400, ppid: 300, name: 'maestri.exe', created: t('19:06.000'), cmd: 'maestri.exe ask Quill' }
let ours = walkOwned([root, host, recycled, stranger], { rootPid: 100, startedAtMs, known })
if (keys(ours) !== '100,200') fail(`recycled parent pulled a stranger in: ${keys(ours)}`)

// 2. a recycled ROOT pid: the process now at that pid is older than this run
ours = walkOwned([{ ...root, created: t('00:00.000') }, host], { rootPid: 100, startedAtMs, known: new Map() })
if (ours.size !== 0) fail('recycled root accepted')

// 3. a real child that appeared after the first listing is followed
ours = walkOwned([root, host, { pid: 500, ppid: 200, name: 'node.exe', created: t('00:30.000'), cmd: '' }], { rootPid: 100, startedAtMs, known: new Map() })
if (keys(ours) !== '100,200,500') fail(`real child lost: ${keys(ours)}`)

// 4. an orphan (its parent died, it was re-parented to pid 1) is still followed through the known set
const orphan = { pid: 600, ppid: 1, name: 'node.exe', created: t('00:40.000'), cmd: '' }
const knownOrphan = new Map([[600, orphan]])
ours = walkOwned([root, orphan], { rootPid: 100, startedAtMs, known: knownOrphan })
if (keys(ours) !== '100,600') fail(`known orphan lost: ${keys(ours)}`)

// 5. the same pid back with another creation time is NOT the orphan
ours = walkOwned([root, { ...orphan, created: t('45.000') }], { rootPid: 100, startedAtMs, known: knownOrphan })
if (keys(ours) !== '100') fail(`recycled orphan pid accepted: ${keys(ours)}`)

console.log('scan ownership self-test OK (5 cases)')
