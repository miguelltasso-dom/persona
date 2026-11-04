import { describe, expect, it } from 'vitest'
import type { ConnectionView } from '@deepseek-ai/dsh-persona-host/types'
import { connectionRunnerConnected, connectionsToRunnerOptions } from '../src/client/hire/connections-to-runner-options.ts'
import { pickUnusedGalleryAnimal } from '../src/client/hire/gallery-animals.ts'
import { createEmptyHireDraft } from '../src/client/hire/empty-hire-draft.ts'
import { draftToCreatePersonaRequest } from '../src/client/hire/map-draft-to-create-persona.ts'
import { fallbackPersonaDraftWire } from '../src/client/hire/fallback-persona-draft-wire.ts'
import { wirePersonaDraftToUi } from '../src/client/hire/wire-persona-draft-to-ui.ts'
import { MOCK_PERSONA_DRAFT } from '../src/client/persona-editor/persona-draft.ts'
import { resolveProfileProjectNames } from '../src/client/profile/resolve-profile-project-names.ts'

describe('hire wiring (monte sua equipe data)', () => {
  it('fallback draft wire matches Rivet shape without host src import', () => {
    const wire = fallbackPersonaDraftWire('Bento\nImplementa APIs.')
    expect(wire.name).toBe('Bento')
    expect(wire.systemRoles).toEqual([])
    expect(wirePersonaDraftToUi(wire, 'panda').name).toBe('Bento')
  })

  it('picks a gallery animal not on the roster', () => {
    expect(pickUnusedGalleryAnimal(['luna', 'sol'])).toBe('atlas')
    expect(createEmptyHireDraft('panda').avatarRef).toBe('panda')
  })

  it('maps wire draft to UI roles without fixed names', () => {
    const ui = wirePersonaDraftToUi({
      name: 'Membro',
      title: 'Analista',
      description: 'Ajuda no Cofre.',
      personality: 'Direto.',
      instructions: 'Cite o Cofre.',
      avatarKind: 'gallery',
      avatarRef: 'tamandua',
      runnerKind: 'cli',
      runnerCli: 'claude',
      runnerModel: 'default',
      canRecruit: false,
      systemRoles: ['watchdog'],
    }, 'capivara')
    expect(ui.harness).toBe('oar:claude')
    expect(ui.watchdog).toBe(true)
    expect(ui.coordination).toBe(false)
  })

  it('treats connection checking phase as connected for runner UI', () => {
    const checking: ConnectionView = {
      id: 'cursor',
      kind: 'cursor',
      available: true,
      loggedIn: false,
      phase: 'checking',
      loginHint: '…',
      error: { code: 'not_logged_in', message: '…' },
    }
    expect(connectionRunnerConnected(checking)).toBe(true)
    const readyOff: ConnectionView = { ...checking, phase: 'ready' }
    expect(connectionRunnerConnected(readyOff)).toBe(false)
    const options = connectionsToRunnerOptions([checking, {
      id: 'dsh',
      kind: 'dsh',
      available: true,
      loggedIn: true,
      phase: 'ready',
      loginHint: '',
    }])
    expect(options.some(row => row.id === 'dsh' && row.connected)).toBe(true)
    const cursor = options.find(row => row.id === 'oar:cursor')
    expect(cursor?.connected).toBe(true)
  })

  it('maps createPersona runner from oar harness id', () => {
    const req = draftToCreatePersonaRequest(
      { ...MOCK_PERSONA_DRAFT, harness: 'oar:claude' },
      { workspaceId: 'ws', projectId: 'pp', memberId: 'm1' },
    )
    expect(req.runnerKind).toBe('cli')
    expect(req.runnerCli).toBe('claude')
  })

  it('uses project display names on profile snapshot', () => {
    const names = resolveProfileProjectNames({
      projects: [{ id: 'p1', name: 'Contratação', kind: 'hire', workspaceId: 'ws' }],
    } as never, 'pp')
    expect(names[0]).toBe('Contratação')
  })
})
