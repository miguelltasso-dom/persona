// Local-open timings for the persona profile (p50/p95 of time-to-token-URL).
import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'

const root = 'C:/Users/migue/dev/persona'
const outDir = `${root}/.maestri/tmp/shots/real`
mkdirSync(outDir, { recursive: true })
const samples = []
const runs = 3

function once(index) {
  return new Promise((resolve, reject) => {
    const home = `${root}/.maestri/tmp/open-home-${index}`
    rmSync(home, { recursive: true, force: true })
    mkdirSync(home, { recursive: true })
    const env = { ...process.env, DSH_HOME: home, PERSONA_HOME: home, DSH_TELEMETRY_DISABLED: '1' }
    const started = Date.now()
    const child = spawn(process.execPath, ['--import', 'tsx/esm', 'apps/cli/src/bin.ts', '--profile', 'persona', '--no-open'], {
      cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    const timer = setTimeout(() => {
      try { execFileSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], { stdio: 'ignore' }) } catch { /* gone */ }
      reject(new Error(`timeout run ${index}\n${out.slice(-400)}`))
    }, 120_000)
    const onData = (chunk) => {
      out += chunk.toString()
      if (!/http:\/\/127\.0\.0\.1:\d+\/\?token=/.test(out)) return
      const ms = Date.now() - started
      clearTimeout(timer)
      child.stdout.off('data', onData)
      child.stderr.off('data', onData)
      try { execFileSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], { stdio: 'ignore' }) } catch { /* gone */ }
      resolve(ms)
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.on('exit', (code) => {
      clearTimeout(timer)
      if (samples.length >= index) return
      reject(new Error(`exited ${code}\n${out.slice(-400)}`))
    })
  })
}

for (let i = 1; i <= runs; i += 1) {
  const ms = await once(i)
  samples.push(ms)
  console.log(`open[${i}]=${ms}ms`)
}
samples.sort((a, b) => a - b)
const p50 = samples[Math.floor((samples.length - 1) * 0.5)]
const p95 = samples[Math.floor((samples.length - 1) * 0.95)]
const report = { samples, p50, p95, unit: 'ms' }
writeFileSync(`${outDir}/open-timing.json`, JSON.stringify(report, null, 2))
console.log(JSON.stringify(report))
