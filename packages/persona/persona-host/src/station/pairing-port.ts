/**
 * COLHEITA 24 ↔ 23: the seam between the station's pairing book and the E2EE bridge. The book decides whether a code is worth
 * anything; the bridge (item 23, Bolt) carries only the code's hash to the team's hub and tells the host when a station
 * answered. Neither side sees the other's secret: the code never leaves the person's PC in clear, and the station's key pair is
 * generated and sealed on the station itself.
 */

/** What the bridge learns about a code: its hash and when it stops working. */
export interface PairingAnnouncement {
  readonly hash: string
  readonly expiresAt: string
}

/** What the bridge says when a station answered. */
export type PairingAnswer =
  | { readonly ok: true; readonly stationId: string }
  | { readonly ok: false; readonly reason: 'expirado' | 'recusado' | 'sem-ponte' }

/**
 * The E2EE bridge of item 23. The host calls it after issuing a code and waits for the station's hello; without a bridge the
 * station still pairs locally (same machine) and the screen says the bridge is not connected.
 */
export interface StationPairingPort {
  /**
   * @param announcement - The hash of the code and its deadline (never the code).
   */
  publish(announcement: PairingAnnouncement): Promise<void>
  /**
   * @param hash - The hash published for this code.
   * @param timeoutMs - How long to wait for the station's hello.
   * @returns The station that answered, or why nobody did.
   */
  awaitStation(hash: string, timeoutMs: number): Promise<PairingAnswer>
}
