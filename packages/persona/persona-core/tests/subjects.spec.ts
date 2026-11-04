import { expect, it } from 'vitest'
import {
  activateSubject,
  archiveSubject,
  bindTicketToSubject,
  bumpUnread,
  defaultSubjects,
  filterMessagesBySubject,
  markSubjectWorking,
  moveMessageToSubject,
  renameSubject,
  subjectThreadKey,
  ticketSubjectChip,
  ticketCardTopic,
} from '../src/index.ts'

const dm = { kind: 'dm' as const, id: 'nina' }

it('seven subjects carry color + name and a Thread key per DM/channel', () => {
  const pack = defaultSubjects(dm)
  expect(pack).toHaveLength(7)
  expect(new Set(pack.map(row => row.color)).size).toBe(7)
  expect(pack.every(row => row.name.trim() !== '')).toBe(true)
  expect(pack[0]).toMatchObject({
    id: 'subject-geral',
    name: 'Geral',
    colorIndex: 0,
    threadKey: 'dm:nina:subject:subject-geral',
  })
  expect(subjectThreadKey({ kind: 'channel', id: 'geral' }, 'subject-ui'))
    .toBe('channel:geral:subject:subject-ui')
})

it('renames, archives, activates, unread and working stay per subject', () => {
  const [geral, ui] = defaultSubjects(dm)
  if (geral === undefined || ui === undefined) throw new Error('pack')
  expect(renameSubject(geral, '  Briefing  ').name).toBe('Briefing')
  expect(() => renameSubject(geral, '   ')).toThrow('INVALID_SUBJECT')
  const archived = archiveSubject(ui)
  expect(archived.archived).toBe(true)
  expect(() => activateSubject([geral, archived], ui.id)).toThrow('INVALID_SUBJECT')
  expect(activateSubject([geral, ui], ui.id).unread).toBe(0)
  expect(bumpUnread(ui).unread).toBe(1)
  expect(markSubjectWorking(ui, 'nina', true).workingPersonaIds).toEqual(['nina'])
  expect(markSubjectWorking(markSubjectWorking(ui, 'nina', true), 'nina', false).workingPersonaIds).toEqual([])
})

it('moves a message only inside the same live conversation', () => {
  const [geral, ui] = defaultSubjects(dm)
  if (geral === undefined || ui === undefined) throw new Error('pack')
  const message = {
    id: 'm1',
    conversationId: geral.conversationId,
    subjectId: geral.id,
    body: 'layout',
    sequence: 1,
    at: '2026-11-03T12:00:00Z',
  }
  expect(moveMessageToSubject(message, ui).subjectId).toBe(ui.id)
  expect(() => moveMessageToSubject(message, archiveSubject(ui))).toThrow('INVALID_SUBJECT')
  expect(() => moveMessageToSubject(message, defaultSubjects({ kind: 'channel', id: 'geral' })[0]!))
    .toThrow('INVALID_SUBJECT')
})

it('filters search/recall by subject and date', () => {
  const rows = [
    { id: 'a', conversationId: 'dm:nina', subjectId: 'subject-ui', body: 'A', sequence: 1, at: '2026-11-01T00:00:00Z' },
    { id: 'b', conversationId: 'dm:nina', subjectId: 'subject-ui', body: 'B', sequence: 2, at: '2026-11-03T00:00:00Z' },
    { id: 'c', conversationId: 'dm:nina', subjectId: 'subject-fin', body: 'C', sequence: 3, at: '2026-11-03T00:00:00Z' },
  ]
  expect(filterMessagesBySubject(rows, 'subject-ui').map(row => row.id)).toEqual(['a', 'b'])
  expect(filterMessagesBySubject(rows, 'subject-ui', { since: '2026-11-02T00:00:00Z' }).map(row => row.id)).toEqual(['b'])
})

it('ticket chip is color + name, never color only', () => {
  const ui = defaultSubjects(dm)[1]
  if (ui === undefined) throw new Error('pack')
  const link = bindTicketToSubject('t-1', ui)
  expect(ticketSubjectChip(link)).toEqual({ color: ui.color, colorIndex: ui.colorIndex, name: ui.name })
  expect(ticketSubjectChip(link).name.trim()).not.toBe('')
  expect(ticketCardTopic(link)).toEqual({
    topicId: ui.id,
    color: ui.color,
    colorIndex: ui.colorIndex,
    name: ui.name,
  })
  expect(() => bindTicketToSubject('  ', ui)).toThrow('INVALID_SUBJECT')
})
