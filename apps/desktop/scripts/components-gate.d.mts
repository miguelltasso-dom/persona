/** What the package gate reads from the on-demand voice model entry of `components.json`. */
export interface ComponentsGateStt {
  readonly version: string
  readonly sha256: string
  readonly bytes: number
}

/** The verdict of the components gate. */
export interface ComponentsGateVerdict {
  readonly present: boolean
  readonly ok: boolean
  readonly problems: readonly string[]
  readonly stt: ComponentsGateStt | null
}

/**
 * Judge the `resources/components.json` manifest of a packaged app (the voice model entry: https URL, sha256, size).
 * @param resourcesDir - The `resources` folder of the packaged app (next to `app.asar`).
 * @returns The verdict, with the exact problems when it is not ok.
 */
export function componentsGateOf(resourcesDir: string): ComponentsGateVerdict
