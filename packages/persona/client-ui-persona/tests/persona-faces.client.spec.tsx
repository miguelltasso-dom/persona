// @vitest-environment jsdom
// Muse 07/11 (bundle 6, D-069): uma persona NUNCA é uma letra. Na Caixa de Aprovações V2 o Téo (sem animal conhecido) aparecia como "T" na lista e no detalhe
// (inbox-connector). Agora ganha o bicho ESTÁVEL da galeria (o mesmo `personaFaceSrc` do cartão do plano e do perfil); o ator de sistema ("Equipe", sem persona)
// segue com o ícone da equipe, nunca com um bicho inventado.
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ApprovalView } from '@deepseek-ai/dsh-persona-host/types'
import { ApprovalsInboxV2 } from '../src/client/approvals/ApprovalsInboxV2.tsx'
import { personaPortraitSrc, resolvePersonaFace } from '../src/client/approvals/approvals-ui-helpers.ts'
import type { ApprovalItem } from '../src/client/approvals/mock-data.ts'
import { AVATAR_96 } from '../src/client/assets/generated-imports.ts'
import { approvalViewToItem } from '../src/client/data/adapters/approvals.ts'
import type { Decision } from '../src/client/decisions/decision-types.ts'
import { decisionsToInbox } from '../src/client/decisions/decisions-to-inbox.ts'
import { personaFaceSrc } from '../src/client/hire/persona-face.ts'
import { pt as approvalsPt } from '../src/client/locale/approvals/locales.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'

installPreviewTheme()
afterEach(() => { cleanup(); localStorage.clear() })

const GALLERY = AVATAR_96 as Readonly<Record<string, string>>

describe('resolvePersonaFace: a persona is never a letter (D-069)', () => {
  it('a persona the app knows by name keeps its own portrait', () => {
    const face = resolvePersonaFace({ id: 'p-nina', name: 'Nina' })
    expect(face).toBeDefined()
    expect(face).toBe(personaPortraitSrc(undefined, 'Nina'))
  })

  it('a persona with no known animal gets the stable gallery animal of personaFaceSrc (same one every time)', () => {
    const face = resolvePersonaFace({ id: 'p-teo', name: 'Téo' })
    expect(face).toBeDefined()
    expect(face).toBe(personaFaceSrc(undefined, 'p-teo'))
    expect(resolvePersonaFace({ id: 'p-teo', name: 'Téo' })).toBe(face)
  })

  it('the character id the persona carries wins over the stable pick', () => {
    const key = Object.keys(GALLERY).find(name => !['atlas', 'bento', 'nina', 'sol', 'luna'].includes(name))
    expect(key).toBeDefined()
    expect(resolvePersonaFace({ id: 'p-pipa', characterId: key, name: 'Pipa' })).toBe(GALLERY[key!])
  })

  it('an actor with NO persona (the system "Equipe") has no face: the screen draws the team icon, never an invented animal', () => {
    expect(resolvePersonaFace({ name: 'Equipe' })).toBeUndefined()
    expect(resolvePersonaFace({ id: '', name: 'Equipe' })).toBeUndefined()
  })

  it('the REAL portrait the Decision store resolved from the team wins over every guess (the animal the person sees everywhere else)', () => {
    expect(resolvePersonaFace({ avatarSrc: 'real-face.png', id: 'p-teo', name: 'Téo' })).toBe('real-face.png')
    expect(resolvePersonaFace({ avatarSrc: '', id: 'p-teo', name: 'Téo' })).toBe(personaFaceSrc(undefined, 'p-teo'))
  })
})

describe('decisionsToInbox carries the requester portrait the store resolved', () => {
  const decision = (requester: Decision['requester']): Decision => ({
    id: 'conn-1', kind: 'blocker', title: 'Liberar o Gmail para Téo', requester, blocking: true, risk: 'normal', createdAt: '', state: 'pending', approval: connectorView(),
  })

  it('requester.avatarSrc becomes item.proposerAvatarSrc; no portrait = the field is absent (the screen resolves a face itself)', () => {
    const withFace = decisionsToInbox([decision({ personaId: 'p-teo', name: 'Téo', avatarSrc: 'teo-real.png' })]).items[0]!
    expect(withFace.proposerAvatarSrc).toBe('teo-real.png')
    const without = decisionsToInbox([decision({ personaId: 'p-teo', name: 'Téo' })]).items[0]!
    expect('proposerAvatarSrc' in without).toBe(false)
  })
})

const connectorView = (): ApprovalView => ({
  id: 'conn-1', kind: 'connector', title: 'Liberar o Gmail para Téo', question: 'Bia pediu a Téo Arte da home, mas Téo não pode usar o Gmail.', status: 'pending', personaId: 'p-teo', personaName: 'Téo',
  connector: { reason: 'colleague', connectorName: 'Gmail', cli: 'claude', connectorId: 'gmail', access: 'read', requestedByPersonaId: 'p-bia', requestedByPersonaName: 'Bia', taskId: 't-arte', taskTitle: 'Arte da home', options: ['once', 'always', 'not-now'] },
} as unknown as ApprovalView)
const actionView = (): ApprovalView => ({
  id: 'act-1', kind: 'action', title: 'Enviar um email', question: 'A equipe quer enviar um email', status: 'pending', personaId: '', personaName: '',
  actionPreview: { actionClass: 'send', verb: 'email', connectorName: 'Gmail', to: 'ana@padarialua.com.br', subject: 'Encomenda de sexta', body: 'Oi, Ana!', truncated: false, masked: false, requestedByPerson: true, status: 'pending', canRemember: true },
} as unknown as ApprovalView)

const pending = (item: ApprovalItem): ApprovalItem => ({ ...item, decisionState: 'pending' })

function mount(items: readonly ApprovalItem[]) {
  return render(
    <PreviewFrame brandLabel="Persona">
      <ApprovalsInboxV2 dict={approvalsPt} items={items} onDecideItem={() => undefined} onDecideAction={() => undefined} onDecideConnector={() => undefined} />
    </PreviewFrame>,
  )
}
const firstRow = (): HTMLElement => document.querySelector<HTMLElement>('[role="option"]')!
const detail = (): HTMLElement => document.querySelector<HTMLElement>('[data-persona-approval-detail]')!
const hasInitials = (node: HTMLElement): boolean => node.querySelector('[class*="initials"]') !== null

describe('Aprovações V2: quem pede é um bicho na lista e no detalhe', () => {
  it('connector card of Téo (no animal of his own): an image in the row and in the detail, no letter', () => {
    mount([pending(approvalViewToItem(connectorView()))])
    expect(firstRow().querySelector('img')).not.toBeNull()
    expect(hasInitials(firstRow())).toBe(false)
    expect(detail().querySelector('img')).not.toBeNull()
    expect(hasInitials(detail())).toBe(false)
  })

  it('the real portrait the store resolved is the face on the row AND in the detail', () => {
    mount([{ ...pending(approvalViewToItem(connectorView())), proposerAvatarSrc: 'teo-real.png' }])
    expect(firstRow().querySelector('img[src="teo-real.png"]')).not.toBeNull()
    expect(detail().querySelector('img[src="teo-real.png"]')).not.toBeNull()
  })

  it('a card from the system (no persona at all) keeps the team icon: no animal, no letter', () => {
    // `actionView()` has no persona (personaId ''): the adapter hands the screen an item whose proposer is nobody.
    mount([pending(approvalViewToItem(actionView()))])
    expect(firstRow().querySelector('img')).toBeNull()
    expect(hasInitials(firstRow())).toBe(false)
  })
})
