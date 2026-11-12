// DESIGN-01 onda 2 · #09: a tarefa sugerida da Visão geral vem do que a pessoa escreveu sobre a empresa (Cofre `brief`, ativo) passado
// pela derivação do host (`suggestFirstRequests`). Sem perfil, ou sem a derivação, não há sugestão: nada é inventado.
import { describe, expect, it, vi } from 'vitest'
import { loadCompanySuggestion, type CompanySuggestionRemote } from '../src/client/overview/company-suggestion.ts'

const scope = { workspaceId: 'w1', projectId: 'p1' }
const ok = <T>(value: T) => ({ ok: true as const, value })

function remote(over: Partial<CompanySuggestionRemote> = {}): CompanySuggestionRemote {
  return {
    listVaultRecords: vi.fn(async () => ok([
      { id: 'r1', projectId: 'p1', kind: 'brief' as const, body: 'Padaria da Ana, bairro Centro', status: 'active' as const },
    ])),
    suggestFirstRequests: vi.fn(async () => ok({ suggestions: ['Sobre “Padaria da Ana”: crie cinco ideias.', 'outra'] })),
    ...over,
  }
}

describe('loadCompanySuggestion', () => {
  it('manda o texto do perfil ativo ao host e devolve o primeiro pedido', async () => {
    const wire = remote()
    await expect(loadCompanySuggestion(wire, scope)).resolves.toEqual({ title: 'Sobre “Padaria da Ana”: crie cinco ideias.' })
    expect(wire.suggestFirstRequests).toHaveBeenCalledWith({ cofreSeed: 'Padaria da Ana, bairro Centro' })
  })

  it('só conta o que está ativo e é perfil: revogado, restrição e memória não viram sugestão', async () => {
    const wire = remote({
      listVaultRecords: vi.fn(async () => ok([
        { id: 'r0', projectId: 'p1', kind: 'brief' as const, body: 'Texto velho', status: 'revoked' as const },
        { id: 'r1', projectId: 'p1', kind: 'constraint' as const, body: 'Nunca prometer prazo', status: 'active' as const },
        { id: 'r2', projectId: 'p1', kind: 'memory' as const, body: 'Gosta de café', status: 'active' as const },
      ])),
    })
    await expect(loadCompanySuggestion(wire, scope)).resolves.toBeNull()
    expect(wire.suggestFirstRequests).not.toHaveBeenCalled()
  })

  it('perfil só com espaços não conta: vale o próximo perfil ativo', async () => {
    const wire = remote({
      listVaultRecords: vi.fn(async () => ok([
        { id: 'r0', projectId: 'p1', kind: 'brief' as const, body: '   \n  ', status: 'active' as const },
        { id: 'r1', projectId: 'p1', kind: 'brief' as const, body: 'Estúdio de pilates', status: 'active' as const },
      ])),
    })
    await loadCompanySuggestion(wire, scope)
    expect(wire.suggestFirstRequests).toHaveBeenCalledWith({ cofreSeed: 'Estúdio de pilates' })
  })

  it('o host não encontra o que derivar: sem sugestão (a tela não inventa um exemplo)', async () => {
    const wire = remote({ suggestFirstRequests: vi.fn(async () => ok({ suggestions: [] })) })
    await expect(loadCompanySuggestion(wire, scope)).resolves.toBeNull()
  })

  it('host sem a derivação, falha de rede ou erro do host: sem sugestão, sem lançar', async () => {
    const { suggestFirstRequests: _drop, ...withoutDerive } = remote()
    await expect(loadCompanySuggestion(withoutDerive, scope)).resolves.toBeNull()
    await expect(loadCompanySuggestion(remote({ listVaultRecords: vi.fn(async () => { throw new Error('offline') }) }), scope)).resolves.toBeNull()
    await expect(loadCompanySuggestion(remote({ listVaultRecords: vi.fn(async () => ({ ok: false as const, error: { code: 'denied', message: 'no' } }) as never) }), scope)).resolves.toBeNull()
  })
})
