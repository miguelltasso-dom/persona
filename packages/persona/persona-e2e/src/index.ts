/** Persona end-to-end harness (Tier 1 web host, Tier 2 desktop CDP, fake CLIs). */

/** Package identity marker used by the skeleton smoke test. */
export const PACKAGE_E2E = 'persona-e2e'

export { startWebHost, type StartWebHostOptions, type WebHostHandle, type WebHostProfile } from './web-host.ts'
export {
  runPersonaUiBootGate,
  assertPersonaBootGateClean,
  type PersonaBootGateResult,
} from './persona-boot-gate.ts'
export { launchUnderLock, type LockedLaunchOptions } from './locked-launch.ts'
export { scanAccessibility, type AxeScanResult } from './axe-check.ts'
export { openPage, type PersonaPageSession, type ScreenshotOptions } from './page-session.ts'
export {
  startDesktop,
  resolveElectronBinary,
  osScreenshot,
  type StartDesktopOptions,
  type DesktopHostHandle,
} from './desktop-host.ts'
export { withFakeCliOnPath, type FakeCliPathScope } from './fake-cli.ts'
export { ARTIFACTS_DIR, REPO_ROOT, requireWebDist } from './paths.ts'
export { watchConsole, assertConsoleClean, type ConsoleTripwire } from './console-tripwire.ts'
export {
  gluedSiblingTextContent,
  isGluedCopyFalsePositive,
  visibleSiblingText,
} from './visible-copy.ts'
