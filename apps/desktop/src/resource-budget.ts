/**
 * Chromium / host process caps. ERR_INSUFFICIENT_RESOURCES is Chromium
 * running out of sockets or renderer slots — keep both small.
 */

export const DESKTOP_RENDERER_LIMIT = 4
export const DESKTOP_CONNECTION_CAP = 8
export const DESKTOP_HOST_CHILD_CAP = 1

/**
 * Apply Chromium switches before `app.ready`. Safe to call more than once.
 * @param commandLine - Electron `app.commandLine`.
 */
export function applyChromiumResourceBudget(commandLine: {
  appendSwitch: (name: string, value?: string) => void
}): void {
  commandLine.appendSwitch('renderer-process-limit', String(DESKTOP_RENDERER_LIMIT))
}
