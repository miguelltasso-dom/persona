import { createServer } from 'node:http'
import { describe, expect, it } from 'vitest'
import { installedDesktopLaunch, waitForInstalledCdp } from '../src/installed-cdp.ts'

describe('installed CDP launch (Probe Tier 2)', () => {
  it('builds Persona.exe argv with renderer debug and disposable homes', () => {
    const launch = installedDesktopLaunch({
      exe: 'C:/tmp/Persona.exe',
      home: 'C:/tmp/home',
      userData: 'C:/tmp/ud',
      rendererPort: 9333,
    })
    expect(launch.args).toContain('--remote-debugging-port=9333')
    expect(launch.env.PERSONA_HOME).toBe('C:/tmp/home')
    expect(launch.env.DSH_PROFILE).toBe('persona')
    expect(launch.env.DSH_DESKTOP_OPEN_DEVTOOLS).toBe('0')
    expect(launch.env.DSH_DESKTOP_UPDATES).toBe('0')
  })

  it('waits for a fake CDP /json/version', async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ webSocketDebuggerUrl: 'ws://127.0.0.1:1/devtools/browser/x' }))
    })
    await new Promise<void>((resolve, reject) => {
      server.listen(0, '127.0.0.1', () => resolve())
      server.once('error', reject)
    })
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('no port')
    try {
      const ws = await waitForInstalledCdp(address.port, 2_000)
      expect(ws).toMatch(/^ws:\/\//u)
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close(error => error === undefined ? resolve() : reject(error))
      })
    }
  })
})
