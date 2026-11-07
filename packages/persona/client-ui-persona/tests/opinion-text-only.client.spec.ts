// team-real.md §12 (Forge): o Remote "Incluir só pelo texto" — a chamada, o resultado normalizado e a frase do host na recusa.
import { describe, expect, it, vi } from 'vitest'
import { includeOpinionTextOnly, opinionTextOnlyRemoteFrom } from '../src/client/remote/opinion-text-only.ts'

const scope = { workspaceId: 'ws', projectId: 'proj' }
const request = { requestId: 'req-1', personaId: 'persona-bento' }

describe('opinionTextOnlyRemoteFrom', () => {
  it('só enxerga o host que tem a chamada (host antigo ou fake: a ação não existe)', () => {
    expect(opinionTextOnlyRemoteFrom(undefined)).toBeUndefined()
    expect(opinionTextOnlyRemoteFrom({})).toBeUndefined()
    expect(opinionTextOnlyRemoteFrom({ includeOpinionTextOnly: 'nao' })).toBeUndefined()
    const remote = { includeOpinionTextOnly: vi.fn() }
    expect(opinionTextOnlyRemoteFrom(remote)).toBe(remote)
  })
})

describe('includeOpinionTextOnly', () => {
  it('manda { workspaceId, projectId, requestId, personaId } e devolve { replyId, mark, failed }', async () => {
    const remote = { includeOpinionTextOnly: vi.fn().mockResolvedValue({ replyId: 'm-9', mark: 'liked' }) }
    await expect(includeOpinionTextOnly(remote, scope, request)).resolves.toEqual({ replyId: 'm-9', mark: 'liked', failed: false })
    expect(remote.includeOpinionTextOnly).toHaveBeenCalledWith({ workspaceId: 'ws', projectId: 'proj', requestId: 'req-1', personaId: 'persona-bento' })
  })

  it('failed: true não é erro (a linha com o motivo entra no fio)', async () => {
    const remote = { includeOpinionTextOnly: vi.fn().mockResolvedValue({ replyId: 'm-9', mark: 'nothing', failed: true }) }
    await expect(includeOpinionTextOnly(remote, scope, request)).resolves.toMatchObject({ failed: true })
  })

  it('desembrulha o RemoteResult { ok, value }', async () => {
    const remote = { includeOpinionTextOnly: vi.fn().mockResolvedValue({ ok: true, value: { replyId: 'm-1', mark: 'attention' } }) }
    await expect(includeOpinionTextOnly(remote, scope, request)).resolves.toEqual({ replyId: 'm-1', mark: 'attention', failed: false })
  })

  it('resposta estranha do host vira defaults honestos (nunca lança por falta de campo)', async () => {
    const remote = { includeOpinionTextOnly: vi.fn().mockResolvedValue(undefined) }
    await expect(includeOpinionTextOnly(remote, scope, request)).resolves.toEqual({ replyId: '', mark: '', failed: false })
  })

  it('recusa do host (RemoteResult ok:false): rejeita com a FRASE do host', async () => {
    const remote = { includeOpinionTextOnly: vi.fn().mockResolvedValue({ ok: false, error: { code: 'invalid-payload', message: 'Esse colega já tem resposta.' } }) }
    await expect(includeOpinionTextOnly(remote, scope, request)).rejects.toThrow('Esse colega já tem resposta.')
  })

  it('erro tipado do proxy (hostMessage) vence a mensagem genérica; sem frase do host a mensagem fica vazia (a tela não inventa)', async () => {
    const typed = Object.assign(new Error('O host da Persona não conseguiu concluir "includeOpinionTextOnly" (forbidden)'), { hostMessage: 'A equipe está desligada.' })
    await expect(includeOpinionTextOnly({ includeOpinionTextOnly: vi.fn().mockRejectedValue(typed) }, scope, request)).rejects.toThrow('A equipe está desligada.')
    await expect(includeOpinionTextOnly({ includeOpinionTextOnly: vi.fn().mockRejectedValue('x') }, scope, request)).rejects.toThrow(/^$/u)
  })
})
