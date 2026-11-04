// @vitest-environment jsdom
// Muse (P0 do Atlas, o mesmo erro do P0-10): a ficha da tarefa mostrava o SLUG "subject-geral" como título.
// taskTitle é o TÍTULO da tarefa: nunca um id, nem o assunto. Sem título real, a ficha não aparece.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GeneralChannelView } from '../src/client/chat/GeneralChannelView.tsx'
import { mapAwayEventLive, mapMessage } from '../src/client/remote/map-host-ui.ts'
import { AwayWhileOutPanel } from '../src/client/overview/AwayWhileOutPanel.tsx'
import { usableTaskTitle } from '../src/client/remote/task-title.ts'
import type { TeamView } from '../src/client/remote/persona-remote-types.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { shellTranslate } from '../src/client/preview/shell-translate.ts'
import { hostMessage } from './message-view-fixture.client.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}
afterEach(() => { cleanup() })

const TEAM = {
  members: [{ id: 'ana', workspaceId: 'ws', displayName: 'Ana', handle: 'ana', role: 'owner' }],
  personas: [{ id: 'p-bento', name: 'Bento', title: 'Engenharia', workspaceId: 'ws', projectId: 'pp', description: '', avatarKind: 'gallery', avatarRef: 'bento', systemRoles: [], canRecruit: false }],
} as unknown as TeamView

const event = (patch: { subjectId: string; type?: string }) => hostMessage({
  id: 'm1', seq: 1, actorId: 'p-bento', body: 'Entrega pronta.', occurredAt: '2026-11-04T12:00:00.000Z', ...patch,
})

describe('usableTaskTitle', () => {
  it('título real passa; id, slug, vazio e o próprio id da tarefa/assunto não', () => {
    expect(usableTaskTitle('Revisar contrato')).toBe('Revisar contrato')
    expect(usableTaskTitle('  Briefing  ')).toBe('Briefing')
    expect(usableTaskTitle('subject-geral')).toBeUndefined()
    expect(usableTaskTitle('task-9f3a')).toBeUndefined()
    expect(usableTaskTitle('proj-ab12cd34')).toBeUndefined()
    expect(usableTaskTitle('')).toBeUndefined()
    expect(usableTaskTitle(undefined)).toBeUndefined()
    expect(usableTaskTitle('Contrato', ['Contrato'])).toBeUndefined() // igual ao id/assunto: não é título
  })
})

describe('mapMessage: a ficha só com o título real da tarefa', () => {
  it('evento ligado a uma tarefa do quadro: título e ticketId', () => {
    const row = mapMessage(event({ subjectId: 't-brief', type: 'delivery' }), TEAM, 'ana', new Map([['t-brief', 'Briefing do cliente']]))
    expect(row.taskTitle).toBe('Briefing do cliente')
    expect(row.ticketId).toBe('t-brief')
  })

  it('o bug: subjectId de assunto da conversa (subject-geral) que não é tarefa NÃO vira título nem ticketId', () => {
    const row = mapMessage(event({ subjectId: 'subject-geral', type: 'reply' }), TEAM, 'ana', new Map())
    expect(row.taskTitle).toBeUndefined()
    expect(row.ticketId).toBeUndefined()
  })

  it('título do quadro com cara de id também não aparece', () => {
    const row = mapMessage(event({ subjectId: 't-1', type: 'delivery' }), TEAM, 'ana', new Map([['t-1', 'task-9f3a']]))
    expect(row.taskTitle).toBeUndefined()
  })

  it('mensagem comum (type message) nunca cita tarefa', () => {
    const row = mapMessage(event({ subjectId: 't-brief' }), TEAM, 'ana', new Map([['t-brief', 'Briefing']]))
    expect(row.taskTitle).toBeUndefined()
  })
})

describe('a ficha na conversa', () => {
  interface Extra { taskTitle?: string; ticketId?: string; onLoadTurnContext?: () => void; onOpenTaskOnBoard?: () => void }
  const view = (extra: Extra) => render(
    <GeneralChannelView
      t={key => chatPt[key as keyof typeof chatPt] ?? key}
      shellT={key => shellPt[key as keyof typeof shellPt] ?? key}
      members={[{ id: 'bento', name: 'Bento', role: 'Engenharia', state: 'resting' }]}
      messages={[{
        id: 'm1',
        authorId: 'bento',
        authorName: 'Bento',
        body: 'Entrega pronta.',
        timeLabel: '10:00',
        reactions: [],
        ...(extra.taskTitle === undefined ? {} : { taskTitle: extra.taskTitle }),
        ...(extra.ticketId === undefined ? {} : { ticketId: extra.ticketId }),
      }]}
      {...(extra.onLoadTurnContext === undefined ? {} : { onLoadTurnContext: extra.onLoadTurnContext })}
      {...(extra.onOpenTaskOnBoard === undefined ? {} : { onOpenTaskOnBoard: extra.onOpenTaskOnBoard })}
    />,
  )

  it('uma ficha só: o título UMA vez e as duas ações como links ao lado', () => {
    const onLoad = vi.fn()
    const onBoard = vi.fn()
    view({ taskTitle: 'Briefing do cliente', ticketId: 't-brief', onLoadTurnContext: onLoad, onOpenTaskOnBoard: onBoard })
    const card = screen.getByRole('group', { name: 'Briefing do cliente' })
    expect(within(card).getAllByText('Briefing do cliente')).toHaveLength(1)
    expect(screen.getAllByText('Briefing do cliente')).toHaveLength(1)
    fireEvent.click(within(card).getByRole('button', { name: chatPt['context.show'] }))
    fireEvent.click(within(card).getByRole('button', { name: chatPt['context.openBoard'] }))
    expect(onLoad).toHaveBeenCalledWith('t-brief')
    expect(onBoard).toHaveBeenCalledWith('t-brief')
  })

  it('sem título não há ficha (nenhum "· Ver contexto usado" solto)', () => {
    view({ ticketId: 't-brief', onLoadTurnContext: () => undefined, onOpenTaskOnBoard: () => undefined })
    expect(screen.queryByRole('button', { name: chatPt['context.show'] })).toBeNull()
    expect(screen.queryByRole('button', { name: chatPt['context.openBoard'] })).toBeNull()
  })

  it('a ficha nunca mostra texto com cara de id', () => {
    view({ taskTitle: 'Contrato v2', ticketId: 't-1', onOpenTaskOnBoard: () => undefined })
    expect(document.body.textContent).not.toMatch(/\bsubject-[a-z0-9-]+/u)
  })
})

describe('"Enquanto você estava fora": o botão da tarefa nunca mostra o id', () => {
  const away = (taskTitle: string, taskId = 't-9f3a') => ({ id: 'a1', at: '2026-11-04T10:00:00.000Z', body: 'Bento entregou.', taskId, taskTitle, kind: 'delivery' as const })

  it('título real é usado; vazio, igual ao id ou com cara de id some (nunca vira o id)', () => {
    expect(mapAwayEventLive(away('Revisar contrato')).taskLabel).toBe('Revisar contrato')
    expect(mapAwayEventLive(away('')).taskLabel).toBeUndefined()
    expect(mapAwayEventLive(away('t-9f3a')).taskLabel).toBeUndefined()
    expect(mapAwayEventLive(away('task-9f3a')).taskLabel).toBeUndefined()
  })

  it('sem título o botão diz "Ver tarefa" (texto neutro), abre a tarefa e o id não aparece na tela', () => {
    const onOpenTask = vi.fn()
    const live = mapAwayEventLive(away(''))
    render(
      <AwayWhileOutPanel
        t={shellTranslate}
        events={[{ id: live.id, body: live.body, taskId: live.taskId, ...(live.taskLabel === undefined ? {} : { taskLabel: live.taskLabel }) }]}
        onOpenTask={onOpenTask}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: shellPt['overview.awayOpenTaskPlain'] }))
    expect(onOpenTask).toHaveBeenCalledWith('t-9f3a')
    expect(screen.getByText(shellPt['overview.awayViewTask'])).toBeTruthy()
    expect(document.body.textContent).not.toContain('t-9f3a')
  })
})
