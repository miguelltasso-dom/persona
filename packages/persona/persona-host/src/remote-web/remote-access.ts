/**
 * MARCO M5: the remote access of this PC as ONE object — the thing the host's Remotes call (`getRemoteAccess`, `setRemoteAccess`, `issueDeviceCode`, `listPairRequests`, `approvePair`, `rejectPair`, `listDevices`,
 * `revokeDevice`, `renameDevice`) so that `index.ts` only carries thin wrappers. It owns the switch (on/off, kept on disk), follows the Tailscale address, starts the gate on it and closes it when the address goes,
 * opens the pairing codes, and keeps a short trail of what the gate saw (wrong tries, blocks) for the PC's Atividade.
 *
 * Three states, said in the person's terms: `desligado` (the owner did not turn it on), `esperando-tailscale` (it is on but the PC has no Tailscale address: the gate is NOT listening, and it never falls back to
 * another interface), `ligado` (listening on the Tailscale address, with the URL to type on the phone).
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute } from 'node:path'
import { DeviceBook, type DeviceView } from './device-book.ts'
import { DevicePairing, type DeviceCode } from './pair-guard.ts'
import { PairRequests, type PairRequestView } from './pair-requests.ts'
import { RemoteGate, type DeviceMember, type GateAuditEvent, type RemoteGateDeps } from './remote-gate.ts'
import { watchTailnet, type TailnetWatch } from './tailnet-bind.ts'

/** The preferred port (stable: the phone keeps its bookmark). Busy = the next free one, shown on the screen. */
export const DEFAULT_REMOTE_PORT = 47_310
/** How many ports after the preferred one are tried. */
export const PORT_TRIES = 10
/** What the screen shows of the trail. */
export const ACTIVITY_KEPT = 50

/** What survives a restart. */
export interface RemoteAccessSettings {
  readonly on: boolean
  /** The port that worked last time (tried first). */
  readonly port?: number
}

/** Where the settings live. */
export interface SettingsStore {
  read(): RemoteAccessSettings
  write(settings: RemoteAccessSettings): void
}

/** @returns A store in memory (tests). */
export function memorySettings(initial: RemoteAccessSettings = { on: false }): SettingsStore {
  let held = initial
  return { read: () => held, write: (next) => { held = next } }
}

/**
 * The settings in one small JSON file of the machine's data folder, written atomically (a temp file, then a rename). A missing or damaged file means OFF: remote access never turns itself on.
 * @param path - The file (its folder is created on the first write).
 * @returns The store.
 */
export function fileSettings(path: string): SettingsStore {
  return {
    read() {
      try {
        const parsed = JSON.parse(readFileSync(path, 'utf8')) as { on?: unknown; port?: unknown }
        const port = typeof parsed.port === 'number' && Number.isInteger(parsed.port) && parsed.port > 0 && parsed.port < 65_536 ? parsed.port : undefined
        return { on: parsed.on === true, ...(port === undefined ? {} : { port }) }
      } catch (error) {
        void error
        return { on: false }
      }
    },
    write(next) {
      mkdirSync(dirname(path), { recursive: true })
      const temp = `${path}.tmp`
      writeFileSync(temp, JSON.stringify(next), { encoding: 'utf8', mode: 0o600 })
      renameSync(temp, path)
    },
  }
}

/** What the screen shows. */
export interface RemoteAccessView {
  readonly state: 'desligado' | 'esperando-tailscale' | 'ligado'
  readonly url?: string
  readonly port?: number
  readonly tailscaleAddress?: string
  readonly devices: readonly DeviceView[]
  readonly requests: readonly PairRequestView[]
  /** How many pairing codes are open. */
  readonly codesOpen: number
  /** The latest refused and blocked tries (address only, never a code). Newest last. */
  readonly activity: readonly GateAuditEvent[]
}

/** A refusal of an action. */
export type RemoteAccessRefusal = 'not-on' | 'unknown-member' | 'unknown-request' | 'unknown-device'

/**
 * M5 (Keel 12/11 20:09): the folder the remote gate serves comes from the env `PERSONA_REMOTE_WEB_DIR`, which the desktop main hands to the host child (the packaged `remote-web/` resource).
 * Absent, blank, relative (it would follow the working folder of whoever started the host), with a dot-dot or a NUL = no folder: the gate answers 404 as it always did, nothing crashes.
 * @param env - The process environment.
 * @returns The absolute folder, or `undefined`.
 */
export function remoteWebDirOf(env: NodeJS.ProcessEnv): string | undefined {
  const value = env.PERSONA_REMOTE_WEB_DIR?.trim()
  if (value === undefined || value === '' || value.includes('\0') || !isAbsolute(value) || value.split(/[\\/]/u).includes('..')) return undefined
  return value
}

/** What this object needs. */
export interface RemoteAccessDeps {
  readonly book: DeviceBook
  readonly pairing: DevicePairing
  readonly requests: PairRequests
  readonly settings: SettingsStore
  readonly hostLabel: string
  /** The member a device speaks for, as the gate shows it. */
  readonly memberOf: (memberId: string) => DeviceMember | undefined
  /** The owner of the team (the default member of a new code). */
  readonly ownerMemberId: () => string | undefined
  /** Hands an authenticated `/api/*` request to the Gateway for the device's Peer. */
  readonly dispatch?: RemoteGateDeps['dispatch']
  /** D-116: the doors of the team's computers (`/remote/computer-hello` and `/remote/computer/{beat,message}`). Handed over only when the surface `computers` is ON; without them both are a 404. */
  readonly computers?: RemoteGateDeps['computers']
  readonly computerLink?: RemoteGateDeps['computerLink']
  /** M9 "Parar": stops a computer-use run for a paired device that may command it (the host decides who may, per call). Without it `POST /remote/computer/stop` is a 404. */
  readonly stopRun?: RemoteGateDeps['stopRun']
  /** M5 (c): the streams of the phone (the HTTP stream door `POST /remote/rpc`). */
  readonly streams?: RemoteGateDeps['streams']
  readonly distDir?: string
  /** Follows the Tailscale address; default {@link watchTailnet}. Tests inject a fake. */
  readonly watch?: (onAddress: (address: string | undefined) => void) => TailnetWatch
  /** Makes a gate; default `new RemoteGate(deps)`. Tests pass the test-only address rules through it. */
  readonly makeGate?: (deps: RemoteGateDeps) => RemoteGate
  readonly preferredPort?: number
  /** What Tailscale says about an address / the login of this PC (defaults: the `tailscale` CLI). Tests inject stubs. */
  readonly whois?: RemoteGateDeps['whois']
  readonly selfLogin?: RemoteGateDeps['selfLogin']
  readonly now?: () => number
}

/** The remote access of this PC. */
export class RemoteAccess {
  private gate: RemoteGate | undefined
  private watcher: TailnetWatch | undefined
  private address: string | undefined
  private listenedPort = 0
  private readonly trail: GateAuditEvent[] = []
  private changing: Promise<void> = Promise.resolve()

  /** @param deps - The books, the settings and the product's member lookup. */
  constructor(private readonly deps: RemoteAccessDeps) {}

  /** Start following the Tailscale address (and open the gate when it is on and there is one). Call once, at boot. */
  start(): void {
    if (this.watcher !== undefined) return
    const watch = this.deps.watch ?? (onAddress => watchTailnet({ onAddress }))
    this.watcher = watch((address) => { this.address = address; this.queue(() => this.reconcile()) })
  }

  /** Stop everything (the host is closing): the watcher and the gate. */
  async stop(): Promise<void> {
    this.watcher?.stop()
    this.watcher = undefined
    await this.changing
    await this.closeGate()
  }

  /** @returns What the screen shows now. */
  view(): RemoteAccessView {
    const on = this.deps.settings.read().on
    const state = !on ? 'desligado' : this.gate === undefined ? 'esperando-tailscale' : 'ligado'
    return {
      state,
      ...(state === 'ligado' && this.address !== undefined ? { url: `http://${this.address}:${String(this.listenedPort)}/`, port: this.listenedPort } : {}),
      ...(this.address === undefined ? {} : { tailscaleAddress: this.address }),
      devices: this.deps.book.list(),
      requests: this.deps.requests.list(),
      codesOpen: this.deps.pairing.pending(),
      activity: [...this.trail],
    }
  }

  /**
   * The owner turns it on or off. Off closes the gate and every connection at once.
   * @param on - The switch.
   * @returns What the screen shows after.
   */
  async setOn(on: boolean): Promise<RemoteAccessView> {
    const current = this.deps.settings.read()
    this.deps.settings.write({ ...current, on })
    await this.queue(() => this.reconcile())
    return this.view()
  }

  /**
   * Open a pairing code on the PC's screen.
   * @param memberId - The member the next device will speak for (default: the owner).
   * @returns The code and the address to type on the phone, or why not.
   */
  issueDeviceCode(memberId?: string): (DeviceCode & { readonly url: string }) | RemoteAccessRefusal {
    const view = this.view()
    if (view.state !== 'ligado' || view.url === undefined) return 'not-on'
    const member = memberId ?? this.deps.ownerMemberId()
    if (member === undefined || this.deps.memberOf(member) === undefined) return 'unknown-member'
    return { ...this.deps.pairing.issue(member), url: view.url }
  }

  /**
   * The owner approves a phone that typed a right code.
   * @param requestId - The request.
   * @returns `ok`, or why not (an unknown, expired or already answered request; an OWNER's device whose Tailscale login is not the PC's).
   */
  approvePair(requestId: string): 'ok' | RemoteAccessRefusal {
    return this.deps.requests.approve(requestId) ? 'ok' : 'unknown-request'
  }

  /**
   * @param requestId - The request.
   * @returns `ok`, or `unknown-request`.
   */
  rejectPair(requestId: string): 'ok' | RemoteAccessRefusal {
    return this.deps.requests.reject(requestId) ? 'ok' : 'unknown-request'
  }

  /**
   * Cut a device off (its calls are aborted and its sockets dropped at once, by the gate).
   * @param deviceId - The device.
   * @returns `ok`, or `unknown-device`.
   */
  revokeDevice(deviceId: string): 'ok' | RemoteAccessRefusal {
    return this.deps.book.revoke(deviceId) ? 'ok' : 'unknown-device'
  }

  /**
   * @param deviceId - The device.
   * @param label - The new name.
   * @returns `ok`, or `unknown-device`.
   */
  renameDevice(deviceId: string, label: string): 'ok' | RemoteAccessRefusal {
    return this.deps.book.rename(deviceId, label) ? 'ok' : 'unknown-device'
  }

  private queue(run: () => Promise<void>): Promise<void> {
    this.changing = this.changing.then(run, run)
    return this.changing
  }

  /** Make the gate match what is wanted: on AND an address = listening there; anything else = closed. */
  private async reconcile(): Promise<void> {
    const want = this.deps.settings.read().on ? this.address : undefined
    const held = this.gate === undefined ? undefined : this.heldAddress
    if (want === held) return
    await this.closeGate()
    if (want === undefined) return
    await this.openGate(want)
  }

  private heldAddress: string | undefined

  private async openGate(address: string): Promise<void> {
    const make = this.deps.makeGate ?? ((deps: RemoteGateDeps) => new RemoteGate(deps))
    const gate = make({
      book: this.deps.book, pairing: this.deps.pairing, requests: this.deps.requests, hostLabel: this.deps.hostLabel, memberOf: this.deps.memberOf,
      ...(this.deps.dispatch === undefined ? {} : { dispatch: this.deps.dispatch }), ...(this.deps.distDir === undefined ? {} : { distDir: this.deps.distDir }),
      ...(this.deps.computers === undefined ? {} : { computers: this.deps.computers }), ...(this.deps.computerLink === undefined ? {} : { computerLink: this.deps.computerLink }),
      ...(this.deps.stopRun === undefined ? {} : { stopRun: this.deps.stopRun }),
      ...(this.deps.streams === undefined ? {} : { streams: this.deps.streams }),
      audit: (event) => { this.trail.push(event); if (this.trail.length > ACTIVITY_KEPT) this.trail.shift() },
      ...(this.deps.whois === undefined ? {} : { whois: this.deps.whois }), ...(this.deps.selfLogin === undefined ? {} : { selfLogin: this.deps.selfLogin }),
      ...(this.deps.now === undefined ? {} : { now: this.deps.now }),
    })
    const first = this.deps.settings.read().port ?? this.deps.preferredPort ?? DEFAULT_REMOTE_PORT
    for (let attempt = 0; attempt < PORT_TRIES; attempt += 1) {
      try {
        this.listenedPort = await gate.listen(address, first + attempt)
        this.gate = gate
        this.heldAddress = address
        this.deps.settings.write({ ...this.deps.settings.read(), port: this.listenedPort })
        return
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error // a wildcard/LAN address is a bug, not a busy port
      }
    }
    this.listenedPort = 0 // every port tried is busy: it stays "esperando" and the screen says so by having no URL
  }

  private async closeGate(): Promise<void> {
    const gate = this.gate
    this.gate = undefined
    this.heldAddress = undefined
    this.listenedPort = 0
    await gate?.close()
  }
}

/** Convenience for the host: build the books with the app's stores. */
export function newRemoteAccessBooks(now?: () => number): { readonly book: DeviceBook; readonly pairing: DevicePairing; readonly requests: PairRequests } {
  const book = new DeviceBook(undefined, now)
  return { book, pairing: new DevicePairing(undefined, now), requests: new PairRequests(book, now) }
}
