import { expect, it, vi } from 'vitest'

const { install, inspect, verify } = vi.hoisted(() => ({
  install: vi.fn(async () => {}),
  inspect: vi.fn(async () => ({ missing: [] })),
  verify: vi.fn(async () => {}),
}))
vi.mock('../scripts/persona-mingit.mjs', () => ({ installPersonaMinGit: install }))
vi.mock('../scripts/persona-package-inventory.ts', () => ({ inspectPersonaPackage: inspect }))
vi.mock('../scripts/windows-asar-unpack.mjs', () => ({
  prepareWindowsAsarUnpack: vi.fn(async () => []), verifyWindowsAsarUnpack: vi.fn(async () => {}),
}))
vi.mock('/apps/desktop/lib/types/runtime-tree.js', () => ({ verifyDesktopRuntime: verify }))

it('installs bundled Git before inspecting Persona Windows resources', async () => {
  const { createElectronBuilderConfig } = await import('../scripts/electron-builder-config.mjs')
  const env = { DSH_DESKTOP_APP_ID: 'com.persona.desktop', DSH_DESKTOP_UNSIGNED: '1' }
  const config = createElectronBuilderConfig(env, 'win32', 'x64')
  await config.afterPack({ appOutDir: 'app', packager: { getResourcesDir: () => 'resources' } } as never)
  expect(install).toHaveBeenCalledWith('resources', env)
  expect(inspect).toHaveBeenCalledOnce()
  expect(install.mock.invocationCallOrder[0]).toBeLessThan(inspect.mock.invocationCallOrder[0]!)
})
