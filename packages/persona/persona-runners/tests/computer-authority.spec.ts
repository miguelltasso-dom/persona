/**
 * D-117 (Lumen, revisão de segurança F1): as ferramentas `persona_computer_*` NÃO passavam pela tabela de autoridade. O gateway abria um cartão de aprovação para QUALQUER turno, então uma rotina ou um turno do
 * laço do quadro (`unattended`) gerava um cartão que alguém aprova meio dormindo, em vez de ser NEGADO como a tabela manda para quem age no computador sem ninguém olhando. Agora: a tabela tem a linha
 * `computer` (person: ask · routine: deny · unattended: deny) e o gateway a consulta ANTES do cartão. Sem a autoridade (host que ainda não a passa) o comportamento de hoje fica.
 */
import { describe, expect, it } from 'vitest'
import { ACTION_KINDS, authorityCell, createMcpGateway, openTurnTools, verdictFor, type PendingApproval, type PersonaToolHooks } from '../src/index.ts'

const run = { personaId: 'nina', ticketId: 't1', assignmentId: 'a1' }
const hooks: PersonaToolHooks = { report: () => {}, recall: () => '', ask: () => {} }
const worktree = 'C:/tmp/t-1'

function rig(): { gateway: ReturnType<typeof createMcpGateway>; calls: string[]; approvals: PendingApproval[] } {
  const calls: string[] = []
  const approvals: PendingApproval[] = []
  const gateway = createMcpGateway({
    hooks,
    acting: {
      computerScreenshot: async () => { calls.push('screenshot'); return 'png' },
      computerClick: async (x, y) => { calls.push(`click ${String(x)},${String(y)}`); return `at ${String(x)},${String(y)}` },
      computerType: async (text) => { calls.push(`type ${text}`); return `typed ${text}` },
    },
    onApproval: (approval) => { approvals.push(approval) },
  })
  return { gateway, calls, approvals }
}

describe('D-117: o computer use passa pela tabela única de autoridade', () => {
  it('a tabela tem a linha `computer`: a pessoa decide, a rotina e o quadro sozinho são recusados', () => {
    expect(ACTION_KINDS).toContain('computer')
    expect(authorityCell('person', 'computer')).toBe('ask')
    expect(authorityCell('routine', 'computer')).toBe('deny')
    expect(authorityCell('unattended', 'computer')).toBe('deny')
    expect(verdictFor('unattended', 'computer')).toBe('deny')
    expect(authorityCell('unattended', 'interact')).toBe('deny') // a regra irmã segue como estava (navegador emprestado)
  })

  it.each(['routine', 'unattended'] as const)('um turno %s: clicar, digitar e ler a tela são RECUSADOS, sem cartão e sem tocar no computador', async (authority) => {
    const { gateway, calls, approvals } = rig()
    const lease = gateway.openTurn({ run, toolLevel: 'write', worktree, authority })
    for (const [name, args] of [['persona_computer_click', { x: 1, y: 2 }], ['persona_computer_type', { text: 'oi' }], ['persona_computer_screenshot', {}]] as const) {
      const result = await gateway.call(lease.token, name, args)
      expect(result.refused, name).toBe(true)
      expect(result.approvalId, `${name}: nenhum cartão para alguém aprovar dormindo`).toBeUndefined()
      expect(result.content).toMatch(/pessoa por trás/u)
    }
    expect(calls, 'o computador não foi tocado').toEqual([])
    expect(approvals, 'nenhum cartão foi aberto').toEqual([])
  })

  it('um turno de PESSOA segue como hoje: o clique pede o cartão e só anda depois de aprovado', async () => {
    const { gateway, calls, approvals } = rig()
    const lease = gateway.openTurn({ run, toolLevel: 'write', worktree, authority: 'person' })
    const click = await gateway.call(lease.token, 'persona_computer_click', { x: 1, y: 2 })
    expect(click.kind).toBe('computer_act')
    expect(approvals).toHaveLength(1)
    expect(calls).toEqual([])
    expect((await gateway.approve(click.approvalId!)).content).toBe('at 1,2')
    expect(calls).toEqual(['click 1,2'])
  })

  it('sem a autoridade (host que ainda não a passa) nada muda: o cartão de hoje', async () => {
    const { gateway, approvals } = rig()
    const lease = gateway.openTurn({ run, toolLevel: 'write', worktree })
    const click = await gateway.call(lease.token, 'persona_computer_click', { x: 3, y: 4 })
    expect(click.kind).toBe('computer_act')
    expect(approvals).toHaveLength(1)
  })

  it('openTurnTools repassa a autoridade: o handler que o CLI chama recusa em um turno unattended', async () => {
    const { gateway, calls } = rig()
    const set = openTurnTools(gateway, { run, toolLevel: 'write', worktree, authority: 'unattended' })!
    const click = set.tools.find(tool => tool.name === 'persona_computer_click')!
    const answered = await click.handler({ x: 5, y: 6 })
    expect(answered.isError).toBe(true)
    expect(answered.content).toMatch(/pessoa por trás/u)
    expect(calls).toEqual([])
  })

  it('o que não é computador não é afetado: ler uma lembrança e mexer no navegador seguem a regra de antes', async () => {
    const { gateway } = rig()
    const lease = gateway.openTurn({ run, toolLevel: 'write', worktree, authority: 'unattended' })
    expect((await gateway.call(lease.token, 'persona_recall', { query: 'x' })).refused).not.toBe(true)
  })
})
