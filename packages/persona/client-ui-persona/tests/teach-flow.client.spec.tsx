// @vitest-environment jsdom
// W2-10: "Ensinar a persona" — consentimento → escolher o que gravar → gravar → contar o que fez → revisar → salvar candidata
// → ativar / compartilhar / voltar atrás. O gravador é de mentira (nada é gravado); o host e o Remote também.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SkillView, TeachDraftView, TeachStepView } from '@deepseek-ai/dsh-persona-host/types'
import { TeachPersonaOverlay } from '../src/client/profile/TeachPersonaOverlay.tsx'
import { TeachPersonaSession } from '../src/client/profile/TeachPersonaSession.tsx'
import { pt } from '../src/client/locale/profile/locales.ts'
import type { TeamView } from '../src/client/remote/persona-remote-types.ts'
import { createShellStore } from '../src/client/shell/create-shell-store.ts'
import { TeachDone } from '../src/client/teach/TeachDone.tsx'
import type { TeachLive, TeachLiveSnapshot, TeachRemote } from '../src/client/teach/teach-deps.ts'
import { TeachLayer, TeachReview } from '../src/client/teach/TeachReview.tsx'
import { clearTeachHandoff, forgetTeachOpener, rememberTeachOpener, setTeachHandoff, takeTeachHandoff } from '../src/client/teach/teach-handoff.ts'
import type { TeachPillAction, TeachRecorder } from '../src/client/teach/teach-recorder.ts'
import { bindObservableForTest } from './bind-observable-for-test.client.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()

const dictionary: Readonly<Record<string, string>> = pt
const t = (key: string, params: Readonly<Record<string, string | number>> = {}): string =>
  (dictionary[key] ?? key).replace(/\{(\w+)\}/gu, (_, name: string) => String(params[name] ?? `{${name}}`))

afterEach(() => {
  cleanup()
  clearTeachHandoff()
  forgetTeachOpener()
  localStorage.clear()
  vi.useRealTimers()
})

const TEAM: TeamView = {
  members: [],
  personas: [{
    id: 'p-nina',
    workspaceId: 'ws',
    projectId: 'pp',
    name: 'Nina',
    title: 'Design',
    description: '',
    avatarKind: 'gallery',
    avatarRef: 'nina',
    systemRoles: [],
    canRecruit: false,
  }],
}

const DRAFT: TeachDraftView = {
  skillTitle: 'Aprovar entregas',
  steps: [
    { order: 1, instruction: 'Abrir o pedido novo' },
    { order: 2, instruction: 'Conferir os dados', verifyHint: 'Nome e valor batem' },
  ],
}

// ── Review ──────────────────────────────────────────────────────────────────────────────────────
describe('TeachReview', () => {
  function renderReview(onSave: (steps: readonly TeachStepView[], title: string) => Promise<void>, draftSteps: readonly TeachStepView[] = DRAFT.steps, suggestedTitle = 'Aprovar entregas') {
    const onDiscard = vi.fn()
    render(<TeachReview t={t} personaName="Nina" suggestedTitle={suggestedTitle} draftSteps={draftSteps} onSave={onSave} onDiscard={onDiscard} />)
    return { onDiscard }
  }

  it('Muse: o nome da skill é obrigatório (motivo à vista), vem sugerido e sai junto no salvar', async () => {
    const onSave = vi.fn<(steps: readonly TeachStepView[], title: string) => Promise<void>>(async () => {})
    renderReview(onSave, DRAFT.steps, 'Conferir pedido e avisar o cliente')
    const nameField = screen.getByLabelText(t('teach.review.nameLabel')) as HTMLInputElement
    expect(nameField.value).toBe('Conferir pedido e avisar o cliente')
    // sem nome: não salva, e a tela diz por quê
    fireEvent.change(nameField, { target: { value: '   ' } })
    expect(screen.getByRole('button', { name: t('teach.review.save') })).toHaveProperty('disabled', true)
    expect(screen.getByText(t('teach.review.needName'))).toBeTruthy()
    fireEvent.change(nameField, { target: { value: '  Aprovar entregas  ' } })
    fireEvent.click(screen.getByRole('button', { name: t('teach.review.save') }))
    await waitFor(() => { expect(onSave).toHaveBeenCalledTimes(1) })
    expect(onSave.mock.calls[0]?.[1]).toBe('Aprovar entregas')
  })

  it('edits, reorders, removes and adds, then saves renumbered steps as a candidate', async () => {
    const onSave = vi.fn<(steps: readonly TeachStepView[], title: string) => Promise<void>>(async () => {})
    renderReview(onSave)
    expect(screen.getByRole('heading', { name: t('teach.review.title', { name: 'Nina' }) })).toBeTruthy()
    const boxes = screen.getAllByLabelText(t('teach.step.instruction')) as HTMLTextAreaElement[]
    expect(boxes.map(box => box.value)).toEqual(['Abrir o pedido novo', 'Conferir os dados'])

    fireEvent.change(boxes[0]!, { target: { value: 'Abrir o pedido novo no painel' } })
    fireEvent.click(screen.getByRole('button', { name: t('teach.step.moveDown', { n: 1 }) }))
    fireEvent.click(screen.getByRole('button', { name: t('teach.step.add') }))
    const afterAdd = screen.getAllByLabelText(t('teach.step.instruction')) as HTMLTextAreaElement[]
    expect(afterAdd).toHaveLength(3)
    fireEvent.change(afterAdd[2]!, { target: { value: 'Avisar o cliente' } })

    fireEvent.click(screen.getByRole('button', { name: t('teach.review.save') }))
    await waitFor(() => { expect(onSave).toHaveBeenCalledTimes(1) })
    expect(onSave.mock.calls[0]?.[0]).toEqual([
      { order: 1, instruction: 'Conferir os dados', verifyHint: 'Nome e valor batem' },
      { order: 2, instruction: 'Abrir o pedido novo no painel' },
      { order: 3, instruction: 'Avisar o cliente' },
    ])
  })

  it('blank steps are not saved and the screen says so; with nothing written Save is off', () => {
    const onSave = vi.fn(async () => {})
    renderReview(onSave, [])
    const save = screen.getByRole('button', { name: t('teach.review.save') }) as HTMLButtonElement
    expect(save.disabled).toBe(true)
    expect(screen.getByText(t('teach.review.needStep'))).toBeTruthy()
    fireEvent.change(screen.getAllByLabelText(t('teach.step.instruction'))[0]!, { target: { value: 'Fazer isso' } })
    fireEvent.click(screen.getByRole('button', { name: t('teach.step.add') }))
    expect(screen.getByText(t('teach.review.blank'))).toBeTruthy()
    expect(screen.getByRole('button', { name: t('teach.review.save') })).toHaveProperty('disabled', false)
  })

  it('a refusal from the host says what to do (tools the persona does not have), never the code', async () => {
    const onSave = vi.fn(async () => { throw new Error('ACCESS_ESCALATION') })
    renderReview(onSave)
    fireEvent.click(screen.getByRole('button', { name: t('teach.review.save') }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', t('teach.error.tools', { name: 'Nina' }))
    expect(screen.queryByText(/ACCESS_ESCALATION/u)).toBeNull()
  })

  it('a generic failure keeps the edits and offers to try again', async () => {
    const onSave = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(undefined)
    renderReview(onSave)
    const box = screen.getAllByLabelText(t('teach.step.instruction'))[0] as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: 'Mudei isto' } })
    fireEvent.click(screen.getByRole('button', { name: t('teach.review.save') }))
    expect(await screen.findByText(t('teach.error.generic'))).toBeTruthy()
    expect((screen.getAllByLabelText(t('teach.step.instruction'))[0] as HTMLTextAreaElement).value).toBe('Mudei isto')
    fireEvent.click(screen.getByRole('button', { name: t('teach.review.save') }))
    await waitFor(() => { expect(onSave).toHaveBeenCalledTimes(2) })
  })

  it('a step image opens large and closes; a missing image says so', () => {
    const svg = 'data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E'
    renderReview(async () => {}, [{ order: 1, instruction: 'Com imagem', thumbnailAssetId: svg }, { order: 2, instruction: 'Passo sem foto' }])
    expect(screen.getByText(t('teach.step.noThumbnail'))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: t('teach.step.enlarge', { n: 1 }) }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: t('teach.step.imageClose') }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('"Descartar sem salvar" hands control back to the caller (which confirms)', () => {
    const { onDiscard } = renderReview(async () => {})
    fireEvent.click(screen.getByRole('button', { name: t('teach.review.discard') }))
    expect(onDiscard).toHaveBeenCalledTimes(1)
  })
})

describe('TeachLayer (modal behaviour)', () => {
  function layerWithOutside() {
    render(
      <>
        <button type="button">Fora da camada</button>
        <TeachLayer label="Ensinar a persona">
          <button type="button">Primeiro</button>
          <button type="button">Último</button>
        </TeachLayer>
      </>,
    )
    return { outside: screen.getByRole('button', { name: 'Fora da camada' }), first: screen.getByRole('button', { name: 'Primeiro' }), last: screen.getByRole('button', { name: 'Último' }) }
  }

  it('starts with focus inside, and focus that escapes to the app underneath is pulled back', () => {
    const { outside, first } = layerWithOutside()
    expect(document.activeElement).toBe(first)
    outside.focus()
    expect(document.activeElement).toBe(first)
  })

  it('Tab wraps at the last control and Shift+Tab at the first', () => {
    const { first, last } = layerWithOutside()
    last.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(first)
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
  })
})

// ── Done ────────────────────────────────────────────────────────────────────────────────────────
describe('TeachDone', () => {
  function renderDone(over: Partial<React.ComponentProps<typeof TeachDone>> = {}) {
    const props = {
      t,
      personaName: 'Nina',
      skillTitle: 'Aprovar entregas',
      art: '',
      onActivate: vi.fn(async () => {}),
      onRevert: vi.fn(async () => {}),
      onShare: vi.fn(async () => {}),
      onClose: vi.fn(),
      ...over,
    }
    render(<TeachDone {...props} />)
    return props
  }

  it('starts as candidate: nothing is on until the person says so; activation then rollback', async () => {
    const props = renderDone()
    expect(screen.getByText(t('teach.done.title', { name: 'Nina', skill: 'Aprovar entregas' }))).toBeTruthy()
    expect(props.onActivate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: t('teach.done.activate', { name: 'Nina' }) }))
    // the title changes on screen and the same sentence is spoken once through the live region
    expect((await screen.findAllByText(t('teach.done.activeTitle', { name: 'Nina', skill: 'Aprovar entregas' }))).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: t('teach.done.revert') }))
    await waitFor(() => { expect(props.onRevert).toHaveBeenCalledTimes(1) })
    expect(await screen.findByText(t('teach.done.title', { name: 'Nina', skill: 'Aprovar entregas' }))).toBeTruthy()
    expect(screen.getAllByText(t('teach.done.reverted', { name: 'Nina' })).length).toBeGreaterThan(0)
  })

  it('a refused activation (tools above the persona) explains and stays a candidate', async () => {
    renderDone({ onActivate: vi.fn(async () => { throw new Error('ACCESS_ESCALATION') }) })
    fireEvent.click(screen.getByRole('button', { name: t('teach.done.activate', { name: 'Nina' }) }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', t('teach.error.tools', { name: 'Nina' }))
    expect(screen.getByRole('button', { name: t('teach.done.activate', { name: 'Nina' }) })).toBeTruthy()
  })

  it('"Compartilhar" says why it is off until the confirmation is ticked', () => {
    renderDone()
    fireEvent.click(screen.getByRole('button', { name: t('teach.done.share') }))
    const share = screen.getByRole('button', { name: t('teach.share.action') })
    const hint = screen.getByText(t('teach.share.confirmHint'))
    expect(share.getAttribute('aria-describedby')).toBe(hint.id)
    fireEvent.click(screen.getByRole('checkbox', { name: t('teach.share.confirm') }))
    expect(screen.queryByText(t('teach.share.confirmHint'))).toBeNull()
  })

  it('sharing needs the written confirmation; project is the default scope; team is a different choice', async () => {
    const props = renderDone()
    fireEvent.click(screen.getByRole('button', { name: t('teach.done.share') }))
    const share = screen.getByRole('button', { name: t('teach.share.action') }) as HTMLButtonElement
    expect(share.disabled).toBe(true)
    fireEvent.click(screen.getByRole('radio', { name: new RegExp(t('teach.share.team'), 'u') }))
    fireEvent.click(screen.getByRole('checkbox', { name: t('teach.share.confirm') }))
    expect(share.disabled).toBe(false)
    fireEvent.click(share)
    await waitFor(() => { expect(props.onShare).toHaveBeenCalledWith('team') })
    expect((await screen.findAllByText(t('teach.share.done', { scope: t('teach.share.team').toLowerCase() }))).length).toBeGreaterThan(0)
  })

  it('"Concluir" closes', () => {
    const props = renderDone()
    fireEvent.click(screen.getByRole('button', { name: t('teach.done.close') }))
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })
})

// ── Whole flow (recording screen) ───────────────────────────────────────────────────────────────
function fakeRecorder(over: Partial<TeachRecorder> = {}): TeachRecorder & { calls: string[] } {
  const calls: string[] = []
  return {
    kind: 'desktop',
    calls,
    listSources: async () => [{ id: 'screen:1', name: 'Tela 1', kind: 'screen' }, { id: 'win:1', name: 'Planilha de pedidos', kind: 'window' }],
    start: async (id, mic) => { calls.push(`start:${id}:${String(mic)}`) },
    pause: async () => { calls.push('pause') },
    resume: async () => { calls.push('resume') },
    stop: async (opts) => {
      calls.push(`stop:${opts.typed}:${String(opts.discardImages)}`)
      return { frames: [{ atMs: 10, imageRef: 'file:///a.png', changeScore: 1 }], transcript: opts.typed }
    },
    ...over,
  }
}

function fakeLive(over: { draft?: TeachDraftView; stopStatus?: 'processing' | 'unsupported' } = {}) {
  const snapshot: TeachLiveSnapshot = { team: TEAM, tenant: { workspaceId: 'ws', projectId: 'pp', memberId: 'owner', channelId: 'geral' } }
  return {
    observable: { getSnapshot: () => snapshot, subscribe: () => () => {} },
    pauseTeachSession: vi.fn<TeachLive['pauseTeachSession']>(async () => ({ status: 'paused', elapsedMs: 0 })),
    resumeTeachSession: vi.fn<TeachLive['resumeTeachSession']>(async () => ({ status: 'recording', elapsedMs: 0 })),
    stopTeachSession: vi.fn<TeachLive['stopTeachSession']>(async () => ({ status: over.stopStatus ?? 'processing', elapsedMs: 1000 })),
    getTeachDraft: vi.fn<TeachLive['getTeachDraft']>(async () => over.draft ?? DRAFT),
    submitTeachDraft: vi.fn<TeachLive['submitTeachDraft']>(async (_id, steps) => ({ steps, skillTitle: 'Aprovar entregas', candidateSkillId: 'taught-teach-1' })),
  } satisfies TeachLive
}

const SKILL: SkillView = { id: 'taught-teach-1', name: 'Aprovar entregas', version: 1, status: 'candidate', body: '', sharedWithTeam: false }

function fakePersona() {
  return {
    activateTaughtSkill: vi.fn<TeachRemote['activateTaughtSkill']>(async () => ({ ok: true, value: { ...SKILL, status: 'active' } })),
    rollbackTaughtSkill: vi.fn<TeachRemote['rollbackTaughtSkill']>(async () => ({ ok: true, value: SKILL })),
    publishTaughtSkill: vi.fn<TeachRemote['publishTaughtSkill']>(async () => ({ ok: true, value: SKILL })),
  } satisfies TeachRemote
}

function mountSession(recorder: TeachRecorder, liveOver: Parameters<typeof fakeLive>[0] = {}) {
  const { store, actions } = createShellStore()
  actions.openTeachCapture({ personaId: 'p-nina', sessionId: 'teach-1', microphone: false })
  setTeachHandoff({ recorder, sourceId: 'screen:1' })
  const live = fakeLive(liveOver)
  const persona = fakePersona()
  // Like the app: closing really removes the capture, so the layer unmounts.
  const closeTeachCapture = vi.fn(() => { actions.closeTeachCapture() })
  const openTeachPersona = vi.fn()
  render(
    <TeachPersonaSession
      dict={pt}
      live={live}
      persona={persona}
      useShell={bindObservableForTest(store)}
      closeTeachCapture={closeTeachCapture}
      openTeachPersona={openTeachPersona}
    />,
  )
  return { live, persona, closeTeachCapture, openTeachPersona }
}

/** Advance fake time one second per `act`, so each timer's effect re-arms the next one (as it does on a real clock). */
async function tick(ms: number): Promise<void> {
  if (ms === 0) {
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    return
  }
  for (let left = ms; left > 0; left -= 1000) {
    await act(async () => { await vi.advanceTimersByTimeAsync(Math.min(1000, left)) })
  }
}

describe('TeachDone — o nome padrão do host não vira frase', () => {
  const props = (skillTitle: string) => ({ t, personaName: 'Atlas', skillTitle, art: '', onActivate: vi.fn(async () => {}), onRevert: vi.fn(async () => {}), onShare: vi.fn(async () => {}), onClose: vi.fn() })
  it('"Skill ensinada" (o padrão do host) vira "Atlas aprendeu uma skill nova"; um nome de verdade entra na frase', () => {
    render(<TeachDone {...props('Skill ensinada')} />)
    expect(screen.getByText('Atlas aprendeu uma skill nova')).toBeTruthy()
    expect(document.body.textContent).not.toContain('aprendeu Skill ensinada')
    cleanup()
    render(<TeachDone {...props('Aprovar entregas')} />)
    expect(screen.getByText('Atlas aprendeu “Aprovar entregas”')).toBeTruthy()
  })
})

describe('TeachPersonaSession (the whole flow, recorder is a fake)', () => {
  beforeEach(() => { vi.useFakeTimers() })

  it('Muse: a revisão tem o caminho de volta "Voltar para a conversa com {persona}" (pede confirmação antes de perder o rascunho)', async () => {
    const recorder = fakeRecorder()
    mountSession(recorder)
    await tick(3000)
    await tick(2000)
    fireEvent.click(screen.getByRole('button', { name: t('teach.stop') }))
    fireEvent.click(screen.getByRole('button', { name: t('teach.studyAction') }))
    await tick(0)
    fireEvent.click(screen.getByRole('button', { name: 'Voltar para a conversa com Nina' }))
    expect(screen.getByRole('dialog', { name: t('teach.discardConfirm.title') })).toBeTruthy()
  })

  it('a pílula do desktop faz EXATAMENTE o que os botões da tela: pausar, retomar e parar (só ouve gravando; desligar ao sair)', async () => {
    let send: ((action: TeachPillAction) => void) | undefined
    const off = vi.fn()
    const recorder = fakeRecorder({ onPillAction: (listener) => { send = listener; return off } })
    const { live } = mountSession(recorder)
    // countdown: the pill is not heard yet
    expect(send).toBeUndefined()
    await tick(3000)
    expect(send).toBeDefined()

    await act(async () => { send?.('pause') })
    expect(recorder.calls).toContain('pause')
    expect(live.pauseTeachSession).toHaveBeenCalledWith('teach-1')
    expect(screen.getByRole('button', { name: t('teach.resume') })).toBeTruthy()
    // pausing twice does nothing more
    await act(async () => { send?.('pause') })
    expect(live.pauseTeachSession).toHaveBeenCalledTimes(1)

    await act(async () => { send?.('resume') })
    expect(live.resumeTeachSession).toHaveBeenCalledWith('teach-1')
    expect(screen.getByRole('button', { name: t('teach.pause') })).toBeTruthy()
    await act(async () => { send?.('resume') })
    expect(live.resumeTeachSession).toHaveBeenCalledTimes(1)

    // stop = the screen's "Parar": the recorder pauses and the person is asked for their own words; no teach.stop yet
    await act(async () => { send?.('stop') })
    expect(screen.getByRole('dialog', { name: t('teach.narrateTitle') })).toBeTruthy()
    expect(recorder.calls.some(call => call.startsWith('stop:'))).toBe(false)
    expect(live.stopTeachSession).not.toHaveBeenCalled()
    // it stops listening once the recording is over
    expect(off).toHaveBeenCalled()
  })

  it('sem pílula (navegador ou gravador de exemplo): tudo segue pelos botões da tela', async () => {
    const recorder = fakeRecorder()
    mountSession(recorder)
    await tick(3000)
    fireEvent.click(screen.getByRole('button', { name: t('teach.stop') }))
    expect(screen.getByRole('dialog', { name: t('teach.narrateTitle') })).toBeTruthy()
  })

  it('countdown → recording → narrate → studying → review → candidate → on → back to candidate', async () => {
    const recorder = fakeRecorder()
    const { live, persona, closeTeachCapture } = mountSession(recorder)

    // 3 · 2 · 1 inside the pill: the recorder has NOT opened the screen yet
    expect(screen.getByRole('region', { name: t('teach.recordingRegion') })).toBeTruthy()
    expect(recorder.calls).toEqual([])
    await tick(3000)
    expect(recorder.calls).toEqual(['start:screen:1:false'])
    await tick(5000)
    expect(screen.getByText('0:05')).toBeTruthy()

    // pause really pauses the recorder and the host
    fireEvent.click(screen.getByRole('button', { name: t('teach.pause') }))
    expect(recorder.calls).toContain('pause')
    expect(live.pauseTeachSession).toHaveBeenCalledWith('teach-1')
    fireEvent.click(screen.getByRole('button', { name: t('teach.resume') }))
    expect(live.resumeTeachSession).toHaveBeenCalledWith('teach-1')

    // stop → the person tells in their own words (typed), may keep the images or not
    fireEvent.click(screen.getByRole('button', { name: t('teach.stop') }))
    expect(screen.getByRole('dialog', { name: t('teach.narrateTitle') })).toBeTruthy()
    fireEvent.change(screen.getByLabelText(t('teach.narrateLabel')), { target: { value: 'Abro o pedido e confiro o valor' } })
    fireEvent.click(screen.getByRole('button', { name: t('teach.studyAction') }))
    await tick(0)

    expect(recorder.calls.at(-1)).toBe('stop:Abro o pedido e confiro o valor:false')
    expect(live.stopTeachSession).toHaveBeenCalledWith('teach-1', false, 'Abro o pedido e confiro o valor', [{ atMs: 10, imageRef: 'file:///a.png', changeScore: 1 }])

    // review with the host's draft; save as candidate
    expect(screen.getByRole('heading', { name: t('teach.review.title', { name: 'Nina' }) })).toBeTruthy()
    // a name the host really gave starts the field; the person can change it (the placeholder case starts from the narration)
    const nameField = screen.getByLabelText(t('teach.review.nameLabel')) as HTMLInputElement
    expect(nameField.value).toBe('Aprovar entregas')
    fireEvent.change(nameField, { target: { value: 'Aprovar entregas do dia' } })
    fireEvent.click(screen.getByRole('button', { name: t('teach.review.save') }))
    await tick(0)
    expect(live.submitTeachDraft).toHaveBeenCalledWith('teach-1', [
      { order: 1, instruction: 'Abrir o pedido novo' },
      { order: 2, instruction: 'Conferir os dados', verifyHint: 'Nome e valor batem' },
    ], false, 'Aprovar entregas do dia')
    expect(screen.getByText(t('teach.done.title', { name: 'Nina', skill: 'Aprovar entregas do dia' }))).toBeTruthy()
    expect(persona.activateTaughtSkill).not.toHaveBeenCalled() // nothing turns on by itself

    fireEvent.click(screen.getByRole('button', { name: t('teach.done.activate', { name: 'Nina' }) }))
    await tick(0)
    expect(persona.activateTaughtSkill).toHaveBeenCalledWith({ workspaceId: 'ws', projectId: 'pp', skillId: 'taught-teach-1' })
    // "Desativar" says what it does underneath
    expect(screen.getByText(t('teach.done.revertHint', { name: 'Nina' }))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Desativar' }))
    await tick(0)
    expect(persona.rollbackTaughtSkill).toHaveBeenCalledWith({ workspaceId: 'ws', projectId: 'pp', skillId: 'taught-teach-1' })

    fireEvent.click(screen.getByRole('button', { name: t('teach.done.close') }))
    expect(closeTeachCapture).toHaveBeenCalledTimes(1)
  })

  it('"não guardar as imagens" reaches the recorder', async () => {
    const recorder = fakeRecorder()
    mountSession(recorder)
    await tick(3000)
    fireEvent.click(screen.getByRole('button', { name: t('teach.stop') }))
    fireEvent.click(screen.getByRole('switch', { name: t('teach.discardImages') }))
    fireEvent.click(screen.getByRole('button', { name: t('teach.studyAction') }))
    await tick(0)
    expect(recorder.calls.at(-1)).toBe('stop::true')
  })

  it('a recording with no steps offers to write them yourself or record again', async () => {
    const recorder = fakeRecorder()
    const { openTeachPersona, closeTeachCapture } = mountSession(recorder, { draft: { steps: [], skillTitle: 'Skill ensinada' } })
    await tick(3000)
    fireEvent.click(screen.getByRole('button', { name: t('teach.stop') }))
    fireEvent.click(screen.getByRole('button', { name: t('teach.studyAction') }))
    await tick(0)
    expect(screen.getByText(t('teach.empty.title'))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: t('teach.empty.write') }))
    expect(screen.getByRole('heading', { name: t('teach.review.title', { name: 'Nina' }) })).toBeTruthy()
    expect((screen.getAllByLabelText(t('teach.step.instruction'))[0] as HTMLTextAreaElement).value).toBe('')
    expect(openTeachPersona).not.toHaveBeenCalled()
    expect(closeTeachCapture).not.toHaveBeenCalled()
  })

  it('a host that cannot take the recording ends in an honest failure with "try again"', async () => {
    const recorder = fakeRecorder()
    const { live } = mountSession(recorder, { stopStatus: 'unsupported' })
    await tick(3000)
    fireEvent.click(screen.getByRole('button', { name: t('teach.stop') }))
    fireEvent.click(screen.getByRole('button', { name: t('teach.studyAction') }))
    await tick(0)
    expect(screen.getByText(t('teach.failed.title'))).toBeTruthy()
    live.stopTeachSession.mockResolvedValueOnce({ status: 'processing', elapsedMs: 1 })
    fireEvent.click(screen.getByRole('button', { name: t('teach.failed.retry') }))
    await tick(0)
    // the recorder is not stopped twice: the frames from the first stop are reused
    expect(recorder.calls.filter(call => call.startsWith('stop:'))).toHaveLength(1)
    expect(screen.getByRole('heading', { name: t('teach.review.title', { name: 'Nina' }) })).toBeTruthy()
  })

  it('a recorder that cannot open the screen fails before recording, with a way back', async () => {
    const recorder = fakeRecorder({ start: async () => { throw new Error('permission denied') } })
    const { closeTeachCapture } = mountSession(recorder)
    await tick(3000)
    expect(screen.getByText(t('teach.failed.title'))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: t('teach.done.close') }))
    expect(closeTeachCapture).toHaveBeenCalled()
  })

  it('discarding in review asks first, and confirming closes without saving', async () => {
    const recorder = fakeRecorder()
    const { live, closeTeachCapture } = mountSession(recorder)
    await tick(3000)
    fireEvent.click(screen.getByRole('button', { name: t('teach.stop') }))
    fireEvent.click(screen.getByRole('button', { name: t('teach.studyAction') }))
    await tick(0)
    fireEvent.click(screen.getByRole('button', { name: t('teach.review.discard') }))
    fireEvent.click(screen.getByRole('button', { name: t('teach.discardConfirm.keep') }))
    expect(closeTeachCapture).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: t('teach.review.discard') }))
    fireEvent.click(screen.getByRole('button', { name: t('teach.discardConfirm.confirm') }))
    expect(closeTeachCapture).toHaveBeenCalledTimes(1)
    expect(live.submitTeachDraft).not.toHaveBeenCalled()
  })

  it('Esc in the review asks before throwing the draft away; Esc in the question only closes the question', async () => {
    const recorder = fakeRecorder()
    const { closeTeachCapture, live } = mountSession(recorder)
    await tick(3000)
    fireEvent.click(screen.getByRole('button', { name: t('teach.stop') }))
    fireEvent.click(screen.getByRole('button', { name: t('teach.studyAction') }))
    await tick(0)
    const box = screen.getAllByLabelText(t('teach.step.instruction'))[0]!
    box.focus()
    fireEvent.keyDown(box, { key: 'Escape' })
    expect(screen.getByRole('dialog', { name: t('teach.discardConfirm.title') })).toBeTruthy()
    expect(closeTeachCapture).not.toHaveBeenCalled()
    // Esc while the question is open belongs to the question: the review stays
    fireEvent.keyDown(screen.getByRole('button', { name: t('teach.discardConfirm.keep') }), { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: t('teach.discardConfirm.title') })).toBeNull()
    expect(screen.getByRole('heading', { name: t('teach.review.title', { name: 'Nina' }) })).toBeTruthy()
    expect(closeTeachCapture).not.toHaveBeenCalled()
    expect(live.submitTeachDraft).not.toHaveBeenCalled()
  })

  it('when the whole flow ends, focus goes back to the control that opened "Ensinar"', async () => {
    const opener = document.createElement('button')
    opener.textContent = 'Ensinar'
    document.body.appendChild(opener)
    opener.focus()
    rememberTeachOpener(document.activeElement)
    const recorder = fakeRecorder()
    mountSession(recorder)
    await tick(3000)
    fireEvent.click(screen.getByRole('button', { name: t('teach.stop') }))
    fireEvent.click(screen.getByRole('button', { name: t('teach.studyAction') }))
    await tick(0)
    fireEvent.click(screen.getByRole('button', { name: t('teach.review.save') }))
    await tick(0)
    // each phase is a new layer that takes focus: it never falls to the page behind
    expect(document.activeElement?.closest('[role="dialog"]')?.getAttribute('data-persona-teach-layer')).toBe('')
    fireEvent.keyDown(screen.getByRole('button', { name: t('teach.done.close') }), { key: 'Escape' })
    await tick(1)
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })

  it('stops by itself at 10 minutes and warns at 9', async () => {
    const recorder = fakeRecorder()
    mountSession(recorder)
    await tick(3000)
    await tick(540_000)
    expect(screen.getByText(t('teach.limitWarning'))).toBeTruthy()
    await tick(60_000)
    expect(screen.getByRole('dialog', { name: t('teach.narrateTitle') })).toBeTruthy()
  })
})

// ── Consent + source step ───────────────────────────────────────────────────────────────────────
describe('TeachPersonaOverlay (consent, then what to record)', () => {
  function mountOverlay(beginTeachCapture = vi.fn(async () => true)) {
    const { store, actions } = createShellStore()
    actions.openTeachPersona('p-nina')
    const closeTeachPersona = vi.fn()
    const snapshot: TeachLiveSnapshot = { team: TEAM, tenant: null }
    const live = { getSnapshot: () => snapshot, subscribe: () => () => {} }
    render(
      <TeachPersonaOverlay
        dict={pt}
        useShell={bindObservableForTest(store)}
        useLive={bindObservableForTest(live)}
        closeTeachPersona={closeTeachPersona}
        beginTeachCapture={beginTeachCapture}
      />,
    )
    return { beginTeachCapture, closeTeachPersona }
  }

  it('in a plain browser the consent explains that recording needs the installed app and offers no dead end', () => {
    mountOverlay()
    expect(screen.getByText(t('teach.needsDesktop'))).toBeTruthy()
    // the reason is the FIRST thing in the body (not below the fold) and is repeated beside the disabled button
    const note = screen.getByText(t('teach.needsDesktop')).closest('[role="note"]')!
    const intro = screen.getByText(t('teach.consentIntro', { name: 'Nina' }))
    expect(note.compareDocumentPosition(intro) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy() // the reason comes before the intro
    const short = screen.getByText(t('teach.needsDesktopShort'))
    expect(screen.getByRole('button', { name: t('teach.chooseSource') }).getAttribute('aria-describedby')).toBe(short.id)
    expect(screen.getByRole('button', { name: t('teach.chooseSource') })).toHaveProperty('disabled', true)
    expect(screen.queryByRole('switch')).toBeNull() // no microphone switch: nothing here records sound
  })

  it('step 2 lists screens and windows; Começar is off until one is chosen; then it hands the recorder over', async () => {
    localStorage.setItem('persona.teach.synthetic', '1')
    const { beginTeachCapture } = mountOverlay()
    expect(screen.getByText(t('teach.eyebrow', { step: 1, total: 2 }))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: t('teach.chooseSource') }))
    expect(await screen.findByText(t('teach.eyebrow', { step: 2, total: 2 }))).toBeTruthy()
    expect(screen.getByText(t('teach.exampleMode'))).toBeTruthy()
    const begin = screen.getByRole('button', { name: t('teach.begin') }) as HTMLButtonElement
    expect(begin.disabled).toBe(true)
    fireEvent.click(await screen.findByRole('radio', { name: 'Tela de exemplo' }))
    expect(begin.disabled).toBe(false)
    fireEvent.click(begin)
    await waitFor(() => { expect(beginTeachCapture).toHaveBeenCalledWith('p-nina', 'teach-v1', false) })
    expect(takeTeachHandoff()?.sourceId).toBe('synthetic:screen')
  })

  it('"Começar a gravar" is off until something is chosen, and the line beside it says why', async () => {
    localStorage.setItem('persona.teach.synthetic', '1')
    mountOverlay()
    fireEvent.click(screen.getByRole('button', { name: t('teach.chooseSource') }))
    await screen.findByRole('radio', { name: 'Tela de exemplo' })
    const begin = screen.getByRole('button', { name: t('teach.begin') })
    expect(begin).toHaveProperty('disabled', true)
    const hint = screen.getByText(t('teach.sourcePickHint'))
    expect(begin.getAttribute('aria-describedby')).toBe(hint.id)
    fireEvent.click(screen.getByRole('radio', { name: 'Tela de exemplo' }))
    expect(screen.queryByText(t('teach.sourcePickHint'))).toBeNull()
  })

  it('windows are a separate tab; Voltar returns to the consent', async () => {
    localStorage.setItem('persona.teach.synthetic', '1')
    mountOverlay()
    fireEvent.click(screen.getByRole('button', { name: t('teach.chooseSource') }))
    fireEvent.click(await screen.findByRole('tab', { name: t('teach.sourceWindow') }))
    expect(await screen.findByRole('radio', { name: 'Janela de exemplo' })).toBeTruthy()
    expect(screen.queryByRole('radio', { name: 'Tela de exemplo' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: t('teach.back') }))
    expect(screen.getByText(t('teach.eyebrow', { step: 1, total: 2 }))).toBeTruthy()
  })

  it('if the host refuses to open the session, it says so and does not leave a handoff behind', async () => {
    localStorage.setItem('persona.teach.synthetic', '1')
    mountOverlay(vi.fn(async () => false))
    fireEvent.click(screen.getByRole('button', { name: t('teach.chooseSource') }))
    fireEvent.click(await screen.findByRole('radio', { name: 'Tela de exemplo' }))
    fireEvent.click(screen.getByRole('button', { name: t('teach.begin') }))
    expect(await screen.findByText(t('teach.beginFailed'))).toBeTruthy()
    expect(takeTeachHandoff()).toBeNull()
  })

  describe('with the desktop bridge', () => {
    afterEach(() => { Reflect.deleteProperty(window, 'personaDesktop') })

    function bridge(listSources: () => Promise<unknown>) {
      Object.defineProperty(window, 'personaDesktop', {
        configurable: true,
        value: { teach: { listSources, start: async () => {}, pause: async () => {}, resume: async () => {}, ingestFrame: async () => true, stop: async () => ({ frames: [], transcript: '' }) } },
      })
    }

    it('nothing to record right now: says so and offers to look again', async () => {
      const list = vi.fn<() => Promise<unknown>>(async () => [])
      bridge(list)
      mountOverlay()
      fireEvent.click(screen.getByRole('button', { name: t('teach.chooseSource') }))
      expect(await screen.findByText(t('teach.sourceEmpty'))).toBeTruthy()
      list.mockResolvedValueOnce([{ id: 'w1', name: 'Planilha de pedidos', kind: 'screen' }])
      fireEvent.click(screen.getByRole('button', { name: t('teach.sourceRetry') }))
      expect(await screen.findByRole('radio', { name: 'Planilha de pedidos' })).toBeTruthy()
    })

    it('listing fails: an honest message and a retry, not a blank list', async () => {
      bridge(async () => { throw new Error('denied') })
      mountOverlay()
      fireEvent.click(screen.getByRole('button', { name: t('teach.chooseSource') }))
      expect(await screen.findByRole('alert')).toHaveProperty('textContent', t('teach.sourceError'))
      expect(screen.getByRole('button', { name: t('teach.sourceRetry') })).toBeTruthy()
    })
  })
})
