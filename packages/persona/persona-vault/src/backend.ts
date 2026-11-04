/** Backend admission: a desktop process never accepts the harness cipher. */
import { VaultUnavailableError } from './errors.ts'

/**
 * Resolve availability before constructing encryption or storage effects.
 * @param electron - Whether this process is Electron, including RunAsNode.
 * @param connected - Whether the private parent IPC channel is available.
 * @param testCipher - Explicit harness opt-in; ignored by Electron.
 * @returns Selected backend; a desktop without IPC fails immediately.
 */
export function vaultBackend(electron: boolean, connected: boolean, testCipher: boolean): 'available' | 'unavailable' | 'test' {
  if (electron) {
    if (!connected) throw new VaultUnavailableError()
    return 'available'
  }
  return testCipher ? 'test' : 'unavailable'
}
