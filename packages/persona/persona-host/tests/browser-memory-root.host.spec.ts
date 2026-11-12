/**
 * A host over an in-memory database kept the browser's profiles and grants in ONE fixed folder (`%TEMP%/persona-browser-profiles`) shared by every host of every test and every run: a profile
 * granted to `bia` by one spec made the next spec try to open a REAL Chrome for her (found while closing P0-05). The folder is now one per host instance, and it goes away with the host.
 */
import { existsSync } from 'node:fs'
import { expect } from 'vitest'
import { it, openJourney, seedJourney } from './journeys/journey-host.ts'

it('two hosts in the same process do not share browser profiles: a profile created in one is not in the other', () => {
  const first = openJourney()
  const second = openJourney()
  seedJourney(first, [])
  seedJourney(second, [])
  const name = `Loja ${String(Date.now())}-${String(Math.random()).slice(2, 8)}`
  first.createBrowserProfile({ workspaceId: 'ws', projectId: 'pp', name })
  expect(first.browser.view().profiles.map(row => row.name)).toContain(name)
  // the second host was opened BEFORE the profile existed, and a third one opened AFTER it must not read it either
  expect(second.browser.view().profiles.map(row => row.name)).not.toContain(name)
  const third = openJourney()
  expect(third.browser.view().profiles.map(row => row.name)).not.toContain(name)
})

it('the folder of an in-memory host is its own and is removed when the host is disposed', async () => {
  const one = openJourney()
  const other = openJourney()
  expect(one.browserDataRoot).not.toBe(other.browserDataRoot)
  seedJourney(one, [])
  one.createBrowserProfile({ workspaceId: 'ws', projectId: 'pp', name: `Loja ${String(Date.now())}` })
  expect(existsSync(one.browserDataRoot)).toBe(true)
  await (one as unknown as { ctx: { fiber: { dispose(): Promise<void> } } }).ctx.fiber.dispose() // the host goes away with its context (the journey helper disposes the others)
  expect(existsSync(one.browserDataRoot)).toBe(false)
  expect(existsSync(other.browserDataRoot)).toBe(true) // the other host's own folder is untouched
})
