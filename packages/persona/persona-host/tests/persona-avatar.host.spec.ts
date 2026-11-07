/**
 * D-069 (Muse): a persona the host creates always has an ANIMAL of the gallery. An animal the caller names stays (even repeated, on
 * purpose); empty, "neutral" or the slug of the name become the first animal not already on the team. Upload and silhouette are untouched.
 */
import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { GALLERY_ANIMALS, animalFor } from '../src/hire-identity.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()
const scope = { workspaceId: 'ws', projectId: 'pp' }

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...scope, displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.sessionMemberId = 'ana'
}

const make = (h: PersonaHost, id: string, avatarRef: string, avatarKind: 'gallery' | 'upload' | 'silhouette' = 'gallery') => h.createPersona({
  id, ...scope, name: id, title: 'Time', description: 'Faz.', personality: 'Clara.', instructions: 'Ajude.',
  avatarKind, avatarRef, runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: false, createdBy: 'ana',
})

it('no animal chosen: the first free one of the gallery, never repeating who is already on the team', () => {
  const h = host()
  seed(h)
  expect(make(h, 'bia', '').avatarRef).toBe(GALLERY_ANIMALS[0])
  expect(make(h, 'teo', 'neutral').avatarRef).toBe(GALLERY_ANIMALS[1])
  expect(make(h, 'caio', 'caio').avatarRef).toBe(GALLERY_ANIMALS[2]) // the slug of the name is not an animal
  const refs = h.listPersonas(scope).map(row => row.avatarRef)
  expect(new Set(refs).size).toBe(refs.length)
  expect(refs.every(ref => GALLERY_ANIMALS.includes(ref))).toBe(true)
})

it('an animal the caller named stays, even when another persona has it; upload and silhouette are not touched', () => {
  const h = host()
  seed(h)
  expect(make(h, 'bia', 'tucano').avatarRef).toBe('tucano')
  expect(make(h, 'teo', 'tucano').avatarRef).toBe('tucano')
  expect(make(h, 'caio', 'blob:abc', 'upload').avatarRef).toBe('blob:abc')
  expect(make(h, 'lia', 'neutral', 'silhouette').avatarRef).toBe('neutral')
})

it('pure: animalFor skips the used ones in any casing and falls back to the last animal when the gallery is full', () => {
  expect(animalFor('', [GALLERY_ANIMALS[0] ?? '', ` ${(GALLERY_ANIMALS[1] ?? '').toUpperCase()} `])).toBe(GALLERY_ANIMALS[2])
  expect(animalFor('xyz', [...GALLERY_ANIMALS])).toBe(GALLERY_ANIMALS.at(-1))
})
