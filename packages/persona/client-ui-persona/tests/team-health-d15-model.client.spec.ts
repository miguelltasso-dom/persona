// DESIGN-01 onda 3 · #15 Saúde: o modelo puro. A frase do veredito se compõe no cliente a partir dos dados do host (o `finding.id` é
// "<kind>:<subject>"), o rosto de cada linha do Teste dos 2 dias vem do id da rotina, e os diagnósticos IGUAIS se agrupam (um botão, não 4).
import { describe, expect, it } from 'vitest'
import type { HealthFindingView, TwoDayRowView } from '../src/client/governance/governance-contract.ts'
import { composeHealthVerdict } from '../src/client/governance/health-verdict.ts'
import { groupTwoDayFixes } from '../src/client/governance/two-day-groups.ts'
import { splitTwoDayLabel, twoDayRowPersonaId } from '../src/client/governance/two-day-persona.ts'

const spof: HealthFindingView = { id: 'single_point_of_failure:h-1', level: 'risk', title: 'Tudo depende de Você para aprovar. Se essa pessoa some, a equipe para.' }
const other: HealthFindingView = { id: 'routine_without_owner:r1', level: 'attention', title: 'A rotina “X” não tem dono.' }

const waiting = (id: string, extra: Partial<TwoDayRowView> = {}): TwoDayRowView => ({
  id, label: id, slots: ['waits', 'waits', 'waits', 'waits'], reason: 'Espera sua aprovação — ninguém substitui você.', fixKind: 'raise_autonomy', fixTargetId: id, ...extra,
})
const running = (id: string): TwoDayRowView => ({ id, label: id, slots: ['runs', 'runs', 'runs', 'runs'] })

describe('twoDayRowPersonaId', () => {
  it('lê a persona do id da rotina da persona e dos ids derivados da equipe viva', () => {
    expect(twoDayRowPersonaId('initiative:sol')).toBe('sol')
    expect(twoDayRowPersonaId('live-now-atlas')).toBe('atlas')
    expect(twoDayRowPersonaId('live-persona-p-nina')).toBe('p-nina')
  })

  it('o que não é de uma persona (aprovações, cartão do quadro, rotina avulsa) não tem persona', () => {
    expect(twoDayRowPersonaId('live-approvals-you')).toBeUndefined()
    expect(twoDayRowPersonaId('live-card-t1')).toBeUndefined()
    expect(twoDayRowPersonaId('r-clients')).toBeUndefined()
    expect(twoDayRowPersonaId('initiative:')).toBeUndefined()
  })
})

describe('splitTwoDayLabel', () => {
  it('"Vigia (Luna)" vira nome Luna e cargo Vigia (o nome vem antes do cargo na tela)', () => {
    expect(splitTwoDayLabel('Vigia (Luna)')).toEqual({ name: 'Luna', role: 'Vigia' })
    expect(splitTwoDayLabel('Gestão de equipe (Atlas)')).toEqual({ name: 'Atlas', role: 'Gestão de equipe' })
  })

  it('um texto sem o par cargo (nome) fica como está', () => {
    expect(splitTwoDayLabel('Iniciativa de Mídia')).toEqual({ text: 'Iniciativa de Mídia' })
    expect(splitTwoDayLabel('Aprovações (você)')).toEqual({ name: 'você', role: 'Aprovações' })
  })
})

describe('composeHealthVerdict', () => {
  it('ponto único de falha + N colegas esperando: "Se você ficar 2 dias fora, N colegas param…"', () => {
    const rows = [waiting('initiative:sol'), waiting('initiative:nina'), waiting('live-now-bento'), waiting('live-persona-p-atlas'), running('initiative:luna')]
    expect(composeHealthVerdict([spof, other], rows)).toEqual({ kind: 'waiting', count: 4 })
  })

  it('a mesma persona em duas linhas conta uma vez; linha que não é de persona não conta', () => {
    const rows = [waiting('initiative:sol'), waiting('live-persona-sol'), waiting('live-approvals-you'), waiting('live-card-t1')]
    expect(composeHealthVerdict([spof], rows)).toEqual({ kind: 'waiting', count: 1 })
  })

  it('sem linha de persona esperando, a frase é a geral: a equipe para no primeiro dia', () => {
    expect(composeHealthVerdict([spof], [running('initiative:sol')])).toEqual({ kind: 'stops' })
    expect(composeHealthVerdict([spof], null)).toEqual({ kind: 'stops' })
  })

  it('sem ponto único de falha o texto do host fica (nada é inventado)', () => {
    expect(composeHealthVerdict([other], [waiting('initiative:sol')])).toBeUndefined()
    expect(composeHealthVerdict([], [])).toBeUndefined()
  })
})

describe('groupTwoDayFixes', () => {
  it('as linhas com o MESMO diagnóstico e a MESMA ação viram um grupo (N ≥ 2); quem é único fica de fora', () => {
    const rows = [
      waiting('initiative:sol'), waiting('initiative:nina'), waiting('initiative:bento'),
      waiting('live-approvals-you', { reason: 'Espera sua aprovação.', fixKind: 'set_substitute' }),
      running('initiative:luna'),
    ]
    const { groups, groupedRowIds } = groupTwoDayFixes(rows)
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ fixKind: 'raise_autonomy', reason: 'Espera sua aprovação — ninguém substitui você.' })
    expect(groups[0]?.rows.map(row => row.id)).toEqual(['initiative:sol', 'initiative:nina', 'initiative:bento'])
    expect([...groupedRowIds].sort()).toEqual(['initiative:bento', 'initiative:nina', 'initiative:sol'])
  })

  it('uma linha sozinha não é grupo; linha sem ação não entra', () => {
    const { groups } = groupTwoDayFixes([waiting('a'), waiting('b', { reason: 'outra razão' }), waiting('c', { fixKind: undefined })])
    expect(groups).toEqual([])
  })
})
