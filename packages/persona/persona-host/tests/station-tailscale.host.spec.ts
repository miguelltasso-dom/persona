import type { NetworkInterfaceInfo } from 'node:os'
import { describe, expect, it } from 'vitest'
import { readTailscale, TAILSCALE_INSTALL } from '../src/station/tailscale.ts'

type Interfaces = Readonly<Record<string, NetworkInterfaceInfo[] | undefined>>

function interfacesWith(address: string | undefined): Interfaces {
  if (address === undefined) return {}
  const row: NetworkInterfaceInfo = { address, netmask: '255.192.0.0', family: 'IPv4', mac: '00:00:00:00:00:00', internal: false, cidr: `${address}/10` }
  return { Ethernet: [row] }
}

describe('COLHEITA 24: Tailscale, found and never logged in for the person', () => {
  it('says active with the tailnet address when the CLI reports Running', async () => {
    const run = async (): Promise<string> => JSON.stringify({ BackendState: 'Running', Self: { TailscaleIPs: ['100.101.102.103', 'fd7a::1'] } })
    expect(await readTailscale(run, () => interfacesWith(undefined))).toEqual({
      state: 'ativo', address: '100.101.102.103', line: 'O Tailscale está ligado neste computador.',
    })
  })

  it('says installed but stopped, and keeps the address it can see', async () => {
    const run = async (): Promise<string> => JSON.stringify({ BackendState: 'Stopped', Self: { TailscaleIPs: [] } })
    expect(await readTailscale(run, () => interfacesWith('100.64.1.2'))).toMatchObject({ state: 'parado', address: '100.64.1.2' })
  })

  it('says absent when there is no CLI and no tailnet address, and offers the install command', async () => {
    const run = async (): Promise<string> => { throw new Error('not found') }
    expect(await readTailscale(run, () => interfacesWith('192.168.0.10'))).toEqual({
      state: 'ausente', line: 'O Tailscale não está instalado. Ele liga os computadores da equipe direto, sem passar pela nuvem.',
    })
    expect(TAILSCALE_INSTALL.command).toBe('winget')
    expect(TAILSCALE_INSTALL.args.slice(0, 3)).toEqual(['install', '--id', 'Tailscale.Tailscale'])
  })

  it('a tailnet address without the CLI still means the mesh is up', async () => {
    const run = async (): Promise<string> => { throw new Error('not found') }
    expect(await readTailscale(run, () => interfacesWith('100.127.0.9'))).toMatchObject({ state: 'ativo', address: '100.127.0.9' })
  })
})
