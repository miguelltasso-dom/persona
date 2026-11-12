/**
 * COLHEITA 24 (Carbon §1.3, modo b): the station finds Tailscale on this machine and says what it sees — active, installed but
 * stopped, or absent — without logging in for anybody. The install is a command the person runs (or approves), never something
 * the product does behind their back: no account, no sign-in, no deploy.
 */

import { execFile } from 'node:child_process'
import { networkInterfaces } from 'node:os'

/** What the station found. */
export type TailscaleState = 'ativo' | 'parado' | 'ausente'

/** The answer the screen shows. */
export interface TailscaleStatus {
  readonly state: TailscaleState
  /** This machine's tailnet address (100.64.0.0/10), when there is one. */
  readonly address?: string
  /** One sentence in the person's words. */
  readonly line: string
}

/** Runs a command and returns its stdout; tests replace it. */
export type CommandRunner = (command: string, args: readonly string[]) => Promise<string>

const LINES: Readonly<Record<TailscaleState, string>> = {
  ativo: 'O Tailscale está ligado neste computador.',
  parado: 'O Tailscale está instalado mas desligado. Entre nele para os colegas alcançarem esta máquina.',
  ausente: 'O Tailscale não está instalado. Ele liga os computadores da equipe direto, sem passar pela nuvem.',
}

/** The command that installs Tailscale on Windows (shown to the person; never run by itself). */
export const TAILSCALE_INSTALL = { command: 'winget', args: ['install', '--id', 'Tailscale.Tailscale', '--silent', '--accept-package-agreements', '--accept-source-agreements'] } as const

/** Whether an address is inside the tailnet range (100.64.0.0/10). */
function isTailnet(address: string): boolean {
  const parts = address.split('.')
  if (parts.length !== 4) return false
  const first = Number(parts[0])
  const second = Number(parts[1])
  return first === 100 && second >= 64 && second <= 127
}

/** The default runner: `execFile` without a shell, with a short deadline. */
const defaultRun: CommandRunner = (command, args) => new Promise((resolve, reject) => {
  execFile(command, [...args], { timeout: 5_000, windowsHide: true }, (error, stdout) => {
    if (error !== null) reject(new Error(error.message))
    else resolve(stdout)
  })
})

/**
 * Read the Tailscale state of this machine.
 * @param run - Command runner (tests inject one).
 * @param interfaces - Network interfaces (tests inject one).
 * @returns What the screen says, and the tailnet address when there is one.
 */
export async function readTailscale(
  run: CommandRunner = defaultRun,
  interfaces: () => ReturnType<typeof networkInterfaces> = networkInterfaces,
): Promise<TailscaleStatus> {
  const local = Object.values(interfaces()).flat()
    .flatMap(list => list ?? [])
    .map(row => row.address)
    .find(address => isTailnet(address))
  try {
    const raw = await run('tailscale', ['status', '--json'])
    const parsed = JSON.parse(raw) as { BackendState?: unknown; Self?: { TailscaleIPs?: unknown } }
    const state = typeof parsed.BackendState === 'string' ? parsed.BackendState : ''
    const ips = Array.isArray(parsed.Self?.TailscaleIPs) ? parsed.Self.TailscaleIPs.filter((ip): ip is string => typeof ip === 'string') : []
    const address = ips.find(ip => isTailnet(ip)) ?? local
    if (state === 'Running') return { state: 'ativo', ...(address === undefined ? {} : { address }), line: LINES.ativo }
    return { state: 'parado', ...(address === undefined ? {} : { address }), line: LINES.parado }
  } catch (error) {
    void error
    // No CLI: an address in the tailnet range still means the mesh is up on this machine.
    if (local !== undefined) return { state: 'ativo', address: local, line: LINES.ativo }
    return { state: 'ausente', line: LINES.ausente }
  }
}
