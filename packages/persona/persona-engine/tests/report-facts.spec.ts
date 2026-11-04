import { expect, it } from 'vitest'
import { extractFactsFromReport, mapReportFactForCuration, type ReportFactAudience, type ReportFactKind } from '../src/report-facts.ts'

const at = '2026-11-04T12:00:00.000Z'
const body = 'Cliente prefere e-mail.'
const fact = { kind: 'preference', title: 'Contato', body, evidence: body }
const audience: ReportFactAudience = { kind: 'members', memberIds: ['ana', 'bia'] }
const ticket = { id: 'task-1', audience }

it('extracts only explicit facts and preserves ticket, report time and original private audience', () => {
  const result = extractFactsFromReport({ at, summary: body, facts: [{ ...fact, audience: { kind: 'workspace' }, recordedAt: '2099-01-01' }] }, ticket)
  expect(result).toEqual({ facts: [{ kind: 'preference', title: 'Contato', body, evidence: body,
    audience, sourceTicketId: 'task-1', recordedAt: at }], rejected: [], warnings: [] })
  expect(mapReportFactForCuration(result.facts[0]!)).toEqual({ fact: { kind: 'learning', title: 'Contato', body, required: false, linkTo: [] },
    visibility: { kind: 'members', memberIds: ['ana', 'bia'] } })
})

it('does not infer facts from prose or unfenced JSON and disables all extraction for the first delivery', () => {
  for (const summary of [body, JSON.stringify({ facts: [fact] })]) {
    expect(extractFactsFromReport({ at, summary }, ticket)).toEqual({ facts: [], rejected: [], warnings: [] })
  }
  expect(extractFactsFromReport({ at: 'invalid', summary: body, facts: [fact] }, { ...ticket, firstDelivery: true }))
    .toEqual({ facts: [], rejected: [], warnings: [] })
})

it.each(['json', ''])('reads a fenced %s JSON facts array through the dirty-output extractor without a repair turn', (label) => {
  const summary = `Resultado: ${body}\n\n\`\`\`${label}\n${JSON.stringify({ facts: [fact] })}\n\`\`\``
  expect(extractFactsFromReport({ at, summary }, ticket).facts[0]).toMatchObject({ title: 'Contato', body })
  expect(extractFactsFromReport({ at, summary, facts: [] }, ticket).facts).toEqual([])
})

it.each([
  ['decision', 'decision'], ['preference', 'learning'], ['rule', 'rule'], ['person', 'person'], ['process', 'process'], ['reference', 'learning'],
] as const)('maps %s to the existing %s page kind with safe defaults', (kind, pageKind) => {
  const result = extractFactsFromReport({ at, summary: body, facts: [{ ...fact, kind }] }, ticket)
  expect(mapReportFactForCuration(result.facts[0]!).fact).toEqual({ kind: pageKind, title: 'Contato', body, required: false, linkTo: [] })
})

it.each<ReportFactAudience>([
  { kind: 'channel', channelId: 'private-channel', memberIds: ['bia', 'ana'] },
  { kind: 'thread', threadId: 'dm-thread', memberIds: ['ana', 'bia'] },
  { kind: 'members', memberIds: ['ana', 'bia'] },
  { kind: 'project', projectId: 'site' },
])('maps the original $kind audience without granting workspace visibility', (original) => {
  const result = extractFactsFromReport({ at, summary: body, facts: [fact] }, { id: 'task', audience: original })
  const mapped = mapReportFactForCuration(result.facts[0]!)
  expect(mapped.visibility).toEqual(original.kind === 'project' ? { kind: 'project', projectId: 'site' } : { kind: 'members', memberIds: ['ana', 'bia'] })
})

it('reports unsupported kinds, bad fields, foreign source IDs and evidence absent from the report', () => {
  const result = extractFactsFromReport({ at, summary: body, facts: [
    { ...fact, kind: 'execute' }, { ...fact, title: '' }, { ...fact, sourceTicketId: 'other-task' }, { ...fact, evidence: 'Texto inventado.' }, null,
  ] }, ticket)
  expect(result.facts).toEqual([])
  expect(result.rejected.map(row => row.reason)).toEqual(['unsupported_kind', 'invalid_fact', 'source_mismatch', 'missing_evidence', 'invalid_fact'])
})

it('rejects credentials before truncating and never includes them in a diagnostic', () => {
  const credential = `sk-${'x'.repeat(24)}`
  const result = extractFactsFromReport({ at, summary: body, facts: [{ ...fact, body: `${'a'.repeat(600)}${credential}` }] }, ticket)
  expect(result).toEqual({ facts: [], rejected: [{ index: 0, reason: 'secret' }], warnings: [] })
  expect(JSON.stringify(result)).not.toContain(credential)
})

it('bounds Unicode fields, limits reports to five candidates and reports every overflow', () => {
  const evidence = 'e'.repeat(200)
  const result = extractFactsFromReport({ at, summary: evidence, facts: Array.from({ length: 8 }, (_, index) => ({
    ...fact, kind: 'reference', title: `${String(index)}${'🙂'.repeat(90)}`, body: 'á'.repeat(600), evidence,
  })) }, ticket)
  expect(result.facts).toHaveLength(5)
  for (const row of result.facts) {
    expect(Array.from(row.title)).toHaveLength(80)
    expect(Array.from(row.body)).toHaveLength(500)
    expect(Array.from(row.evidence)).toHaveLength(160)
  }
  expect(result.warnings.filter(row => row.code === 'truncated')).toHaveLength(15)
  expect(result.rejected).toEqual([{ index: 5, reason: 'fact_limit', count: 3 }])
})

it('deduplicates by normalized kind/title/audience while preserving distinct kinds', () => {
  const result = extractFactsFromReport({ at, summary: body, facts: [fact, { ...fact, title: ' contato ' }, { ...fact, kind: 'reference' }] }, ticket)
  expect(result.facts.map(row => row.kind)).toEqual(['preference', 'reference'])
  expect(result.rejected).toEqual([{ index: 1, reason: 'duplicate' }])
})

it('rejects malformed structured payloads, invalid timestamps and unknown original audiences explicitly', () => {
  expect(extractFactsFromReport({ at, summary: body, facts: {} }, ticket).rejected).toEqual([{ index: -1, reason: 'invalid_facts' }])
  expect(extractFactsFromReport({ at: 'invalid', summary: body, facts: [fact] }, ticket).rejected[0]?.reason).toBe('invalid_time')
  expect(extractFactsFromReport({ at, summary: body, facts: [fact] }, { id: 't', audience: { kind: 'members', memberIds: [] } }).rejected[0]?.reason).toBe('invalid_audience')
  expect(extractFactsFromReport({ at, summary: '```json\n{not-json}\n```' }, ticket).rejected[0]?.reason).toBe('malformed_json')
})

it('covers every declared report kind in the mapping table', () => {
  const kinds: readonly ReportFactKind[] = ['decision', 'preference', 'rule', 'person', 'process', 'reference']
  expect(kinds.map(kind => extractFactsFromReport({ at, summary: body, facts: [{ ...fact, kind }] }, ticket).facts[0]?.kind)).toEqual(kinds)
})
