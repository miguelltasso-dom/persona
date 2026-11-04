/** Profile only the Node-mode host owned by a just-launched desktop process. */
import { spawnSync } from 'node:child_process'

/** @param {number} desktopPid Desktop process created by the caller. @param {number} [inspectorPort] Free port explicitly enabled on the development Host. @returns {Promise<undefined | {stop: () => Promise<unknown>}>} Owned profiler when available. */
export async function profileOwnedHost(desktopPid, inspectorPort) {
  if (inspectorPort === undefined) return undefined
  const query = `Get-CimInstance Win32_Process -Filter 'ParentProcessId=${desktopPid}' | Where-Object { $_.CommandLine -match 'dsh-desktop-host' } | Select-Object -First 1 -ExpandProperty ProcessId`
  let pid
  for (let attempt = 0; attempt < 8; attempt++) {
    const probe = spawnSync('powershell.exe', ['-NoProfile', '-Command', query], { encoding: 'utf8', windowsHide: true, timeout: 5000 })
    pid = Number(probe.stdout.trim())
    if (pid > 0) break
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  if (!pid) return undefined
  let endpoint
  for (let attempt = 0; attempt < 30; attempt++) {
    try { endpoint = (await (await fetch(`http://127.0.0.1:${inspectorPort}/json/list`)).json())[0]?.webSocketDebuggerUrl } catch (error) { /* Inspector is not listening yet. */ }
    if (endpoint) break
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  if (!endpoint) return undefined
  const socket = new WebSocket(endpoint)
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.close(); reject(new Error('Host inspector connection deadline')) }, 10000)
    socket.onopen = () => { clearTimeout(timer); resolve() }
    socket.onerror = () => { clearTimeout(timer); socket.close(); reject(new Error('Host inspector connection failed')) }
  })
  let seq = 0
  const pending = new Map()
  socket.onmessage = event => {
    const message = JSON.parse(event.data)
    if (!message.id) return
    const waiter = pending.get(message.id)
    if (!waiter) return
    pending.delete(message.id)
    clearTimeout(waiter.timer)
    message.error ? waiter.reject(new Error(message.error.message)) : waiter.resolve(message.result)
  }
  const request = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Inspector deadline: ${method}`)) }, 10000)
    pending.set(id, { resolve, reject, timer })
    socket.send(JSON.stringify({ id, method, params }))
  })
  const actual = await request('Runtime.evaluate', { expression: 'process.pid', returnByValue: true })
  if (actual.result.value !== pid) { socket.close(); return undefined }
  await request('Profiler.enable')
  await request('Profiler.start')
  return { stop: async () => {
    try { return (await request('Profiler.stop')).profile } finally { socket.close() }
  } }
}
