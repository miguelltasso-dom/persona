/**
 * MARCO DOGFOOD M2 (Keel 14:13; PLAN §13): o quadro que anda sozinho NUNCA pré-autoriza enviar/pagar/apagar. A autoridade por turno vem da origem da Tarefa (`run-authority.ts`), e isso NÃO basta para o
 * laço da responsável: um cartão nascido de uma MENSAGEM da pessoa (origem `person`) que o laço puxa às 2 da manhã seria conduzido como "a pessoa está aqui" (pré-autorizaria enviar de uma permissão
 * lembrada). Regra nova: uma Tarefa CONDUZIDA pelo laço do quadro (`lookup.board(id)`, o documento durável `lead_pull` do Flint) e uma Tarefa de origem `board:…` são `unattended`, e a marca é contagiosa
 * como as outras (a Tarefa de uma colega, `handoff:`, nasce da que a pediu). O risco para no cartão de aprovação: `unattended` já retira send/pay/delete do pré-autorizado.
 * Contrato: persona-spec/contracts/authority-table.md (seção "Quadro autônomo"). Vermelho antes: 6 de 7 falhavam.
 */
import type { Ticket } from '@deepseek-ai/dsh-persona-engine'
import { authorityCell, preAllowAfterOrigin, verdictFor } from '@deepseek-ai/dsh-persona-runners'
import { describe, expect, it } from 'vitest'
import { authorityOfRun } from '../src/run-authority.ts'

function task(id: string, triggerId: string, extra: { triggerIds?: string[] } = {}): Ticket {
  const at = '2026-11-12T10:00:00.000Z'
  return {
    id, title: id, decisionId: 'd', mandate: { goal: id, constraints: [], doneWhen: [] } as unknown as Ticket['mandate'], channels: [],
    assignments: [], inputs: [], undelivered: [], createdAt: at, updatedAt: at,
    origin: { triggerId, triggerIds: extra.triggerIds ?? [triggerId] },
  }
}

/** The host's lookup: the Tasks of the project and which of them the board's lead drove. */
function lookup(rows: Ticket[], drivenByBoard: readonly string[] = []): { readonly ticket: (id: string) => Ticket | undefined; readonly board: (id: string) => boolean } {
  return { ticket: id => rows.find(row => row.id === id), board: id => drivenByBoard.includes(id) }
}

describe('M2: o quadro autônomo nunca age como "a pessoa está aqui"', () => {
  it('uma Tarefa de origem board:<projeto>:<cartão> é unattended', () => {
    expect(authorityOfRun(task('t1', 'board:proj-a:card-7'), lookup([]))).toBe('unattended')
  })

  it('um cartão nascido de uma MENSAGEM da pessoa, puxado pelo laço, é unattended; sem o laço continua person', () => {
    const card = task('t-card', 'msg-4f2a')
    expect(authorityOfRun(card, lookup([card]))).toBe('person') // controle: a pessoa pediu e está aqui
    expect(authorityOfRun(card, lookup([card], ['t-card']))).toBe('unattended')
  })

  it('a marca é contagiosa: a Tarefa de uma colega pedida por uma Tarefa conduzida pelo laço é unattended (mesmo sem estar marcada)', () => {
    const lead = task('t-lead', 'msg-1')
    const colleague = task('t-colleague', 'handoff:t-lead:c1')
    expect(authorityOfRun(colleague, lookup([lead, colleague]))).toBe('person') // controle: sem o laço, herda "pessoa"
    expect(authorityOfRun(colleague, lookup([lead, colleague], ['t-lead']))).toBe('unattended')
    const grandchild = task('t-gc', 'handoff:t-colleague:c2')
    expect(authorityOfRun(grandchild, lookup([lead, colleague, grandchild], ['t-lead']))).toBe('unattended') // duas voltas acima
  })

  it('só a Tarefa conduzida é marcada: o cartão vizinho da pessoa no mesmo quadro segue person', () => {
    const driven = task('t-a', 'msg-a')
    const mine = task('t-b', 'msg-b')
    const rows = [driven, mine]
    expect(authorityOfRun(driven, lookup(rows, ['t-a']))).toBe('unattended')
    expect(authorityOfRun(mine, lookup(rows, ['t-a']))).toBe('person')
  })

  it('uma rotina conduzida pelo laço perde a dispensa do dono (unattended); uma rotina comum mantém (routine)', () => {
    const routine = task('t-r', 'routine-run:r1:1')
    expect(authorityOfRun(routine, lookup([routine]))).toBe('routine')
    expect(authorityOfRun(routine, lookup([routine], ['t-r']))).toBe('unattended')
  })

  it('sem a porta do laço (host sem quadro autônomo) nada muda: o comportamento de hoje', () => {
    const card = task('t-card', 'msg-4f2a')
    expect(authorityOfRun(card, { ticket: () => undefined })).toBe('person')
    expect(authorityOfRun(task('t2', 'initiative:run-7'), { ticket: () => undefined })).toBe('unattended')
  })

  it('PONTA A PONTA: o risco para no cartão — uma Tarefa conduzida pelo laço NÃO sai com enviar/pagar/apagar pré-autorizado, mesmo com a permissão lembrada do dono', () => {
    const card = task('t-card', 'msg-4f2a')
    const driven = authorityOfRun(card, lookup([card], ['t-card']))
    const standing = ['read', 'change', 'send', 'pay', 'delete'] as const // a permissão "não perguntar de novo" do dono para esta persona
    // controle: com a pessoa presente a função devolve a permissão lembrada como veio (quem decide quais classes entram na lista é a concessão; esta função só RETIRA)
    expect(preAllowAfterOrigin(standing, { authority: authorityOfRun(card, lookup([card])) })).toEqual(['read', 'change', 'send', 'pay', 'delete'])
    // conduzida pelo laço: nada que sai da máquina, paga ou destrói passa sem o cartão
    expect(preAllowAfterOrigin(standing, { authority: driven })).toEqual(['read', 'change'])
    // o texto do e-mail recebido continua valendo por cima (a marca de e-mail e a do laço se somam)
    expect(preAllowAfterOrigin(standing, { authority: driven, viaEmail: true })).toEqual(['read', 'change'])
  })

  it('PONTA A PONTA: o que o laço faz com a linha de comando e com o navegador (a decisão da tabela para unattended)', () => {
    const card = task('t-card', 'msg-4f2a')
    const driven = authorityOfRun(card, lookup([card], ['t-card']))
    expect(driven).toBe('unattended')
    for (const action of ['send', 'delete', 'unknown'] as const) expect(verdictFor(driven, action), action).toBe('deny') // sem ninguém para perguntar na linha de comando: recusa, nunca roda
    for (const action of ['read', 'draft-change'] as const) expect(verdictFor(driven, action), action).toBe('allow') // o trabalho de rascunho e a leitura andam sozinhos
    // DECISÃO DE PRODUTO (Keel 15:08, D-115): clicar/digitar no navegador emprestado ('interact') é negado sem pessoa por trás: um cartão do quadro que precise do Chrome NÃO anda sozinho
    expect(authorityCell('unattended', 'interact')).toBe('deny')
    expect(authorityCell('person', 'interact')).toBe('allow')
  })

  it('o prefixo board: dentro de um lote (triggerIds) e de uma parte dividida também vale', () => {
    expect(authorityOfRun(task('t-batch', 'msg-1', { triggerIds: ['msg-1', 'board:proj-a:card-9'] }), lookup([]))).toBe('unattended')
    expect(authorityOfRun(task('t-part', 'split:board:proj-a:card-3:nina'), lookup([]))).toBe('unattended')
  })
})
