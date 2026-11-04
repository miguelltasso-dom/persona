import { describe, expect, it } from 'vitest'
import { createShellStore } from '../src/client/shell/create-shell-store.ts'

describe('createShellStore navigation (C5b)', () => {
  it('keeps the selected panel until the user picks another', () => {
    const { store, actions } = createShellStore()
    actions.selectPanel('kanban')
    expect(store.getSnapshot().activePanel).toBe('kanban')
    actions.selectPanel('channels')
    expect(store.getSnapshot().activePanel).toBe('channels')
    actions.selectPanel('overview')
    expect(store.getSnapshot().activePanel).toBe('overview')
  })

  it('only forces channels when onboarding is dismissed', () => {
    const { store, actions } = createShellStore()
    actions.selectPanel('kanban')
    actions.dismissOnboarding()
    expect(store.getSnapshot().activePanel).toBe('channels')
  })

  it('openPersonaEditor opens profile panel in editor mode', () => {
    const { store, actions } = createShellStore()
    actions.openPersonaEditor('gallery-bento')
    expect(store.getSnapshot().activePanel).toBe('profile')
    expect(store.getSnapshot().profilePersonaId).toBe('gallery-bento')
    expect(store.getSnapshot().profileEditorOpen).toBe(true)
    actions.closePersonaEditor()
    expect(store.getSnapshot().profileEditorOpen).toBe(false)
  })

  it('openProjectBoard switches to kanban and sets focus project id (PB-5)', () => {
    const { store, actions } = createShellStore()
    actions.openProjectBoard('proj-site')
    expect(store.getSnapshot().activePanel).toBe('kanban')
    expect(store.getSnapshot().boardsFocusProjectId).toBe('proj-site')
    actions.clearBoardsFocusProject()
    expect(store.getSnapshot().boardsFocusProjectId).toBeNull()
  })

  it('openKanbanTicket switches to kanban and sets focus ticket (PRO-4)', () => {
    const { store, actions } = createShellStore()
    actions.openKanbanTicket('ticket-42')
    expect(store.getSnapshot().activePanel).toBe('kanban')
    expect(store.getSnapshot().kanbanFocusTicketId).toBe('ticket-42')
    actions.clearKanbanFocusTicket()
    expect(store.getSnapshot().kanbanFocusTicketId).toBeNull()
  })

  it('openHelp switches to help with doc and tab (Ajuda shell)', () => {
    const { store, actions } = createShellStore()
    actions.openHelp({ docId: 'canais', tab: 'guias' })
    expect(store.getSnapshot().activePanel).toBe('help')
    expect(store.getSnapshot().helpDocId).toBe('canais')
    expect(store.getSnapshot().helpTab).toBe('guias')
    actions.selectPanel('channels')
    expect(store.getSnapshot().helpDocId).toBeNull()
    actions.openHelp({ tab: 'novidades' })
    expect(store.getSnapshot().helpTab).toBe('novidades')
  })

  it('setProjectWorkspaceProjectId scopes sibling tabs (PB-5)', () => {
    const { store, actions } = createShellStore()
    actions.setProjectWorkspaceProjectId('proj-site')
    expect(store.getSnapshot().projectWorkspaceProjectId).toBe('proj-site')
    actions.setProjectWorkspaceProjectId(null)
    expect(store.getSnapshot().projectWorkspaceProjectId).toBeNull()
  })
})
