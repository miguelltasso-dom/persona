// M9 / D-117 regra 1 + matriz D2 do Lumen (verde; vermelho registrado 12/11 15:19).
import { describe, expect, it } from 'vitest'
import {
  canEnrollComputerAsTeam,
  createComputerScopeGuard,
  decideComputerUse,
  personaAfterMove,
  readComputerKind,
  validatePersonaComputerConfig,
  type ComputerDescriptor,
  type ComputerUsePersona,
} from '../src/computer-scope.ts'

const ana = 'ana'
const bia = 'bia'
const cai = 'cai'
const privatePersona: ComputerUsePersona = { id: 'p1', audience: 'private', creatorId: ana, homeComputerId: 'pcA', computerUse: true }
const teamPersona: ComputerUsePersona = { id: 'p2', audience: 'team', creatorId: ana, homeComputerId: 'pcA', computerUse: true }
const personalPc: ComputerDescriptor = { computerId: 'pcA', kind: 'personal', ownerId: ana, teamComputerUse: false }
const teamPc: ComputerDescriptor = { computerId: 'pcA', kind: 'team', ownerId: ana, teamComputerUse: true }
const teamPcNoCaps: ComputerDescriptor = { computerId: 'pcA', kind: 'team', ownerId: ana, teamComputerUse: false }

describe('matrix-exhaustive (D2): todas as células', () => {
  it('Só eu + PC pessoal: permitido só se criador == dono do PC == quem comanda', () => {
    expect(decideComputerUse({ persona: privatePersona, computer: personalPc, commanderId: ana, allowedIds: [] })).toEqual({ allow: true })
    expect(decideComputerUse({ persona: privatePersona, computer: personalPc, commanderId: bia, allowedIds: [bia] })).toMatchObject({ allow: false, reason: 'not-owner' })
    expect(decideComputerUse({ persona: privatePersona, computer: { ...personalPc, ownerId: bia }, commanderId: ana, allowedIds: [] })).toMatchObject({ allow: false, reason: 'not-owner' })
  })
  it('Só eu + PC da equipe: NEGADO (decisão do Keel, D9.1)', () => {
    expect(decideComputerUse({ persona: privatePersona, computer: teamPc, commanderId: ana, allowedIds: [ana] })).toMatchObject({ allow: false, reason: 'private-persona-on-team-pc' })
  })
  it('Da equipe + PC pessoal: NEGADO SEMPRE, mesmo o dono comandando e mesmo na lista', () => {
    expect(decideComputerUse({ persona: teamPersona, computer: personalPc, commanderId: ana, allowedIds: [ana, bia] })).toMatchObject({ allow: false, reason: 'team-persona-on-personal-pc' })
    expect(decideComputerUse({ persona: teamPersona, computer: personalPc, commanderId: bia, allowedIds: [bia] })).toMatchObject({ allow: false, reason: 'team-persona-on-personal-pc' })
  })
  it('Da equipe + PC da equipe: só com a capacidade ligada no PC E quem comanda em "Quem pode usar"', () => {
    expect(decideComputerUse({ persona: teamPersona, computer: teamPc, commanderId: bia, allowedIds: [bia] })).toEqual({ allow: true })
    expect(decideComputerUse({ persona: teamPersona, computer: teamPc, commanderId: bia, allowedIds: [] })).toMatchObject({ allow: false, reason: 'commander-not-allowed' })
    expect(decideComputerUse({ persona: teamPersona, computer: teamPcNoCaps, commanderId: bia, allowedIds: [bia] })).toMatchObject({ allow: false, reason: 'team-computer-not-enabled' })
  })
  it('computerUse desligado: negado em todas as células', () => {
    for (const persona of [privatePersona, teamPersona]) {
      for (const computer of [personalPc, teamPc]) {
        expect(decideComputerUse({ persona: { ...persona, computerUse: false }, computer, commanderId: ana, allowedIds: [ana] })).toMatchObject({ allow: false, reason: 'computer-use-off' })
      }
    }
  })
  it('falha fechada: dado estranho (audience/kind desconhecidos, vazio) nunca permite', () => {
    const bad = { ...teamPersona, audience: 'everyone' } as unknown as ComputerUsePersona
    expect(decideComputerUse({ persona: bad, computer: personalPc, commanderId: ana, allowedIds: [ana] })).toMatchObject({ allow: false })
    const badPc = { ...personalPc, kind: 'vps' } as unknown as ComputerDescriptor
    expect(decideComputerUse({ persona: privatePersona, computer: badPc, commanderId: ana, allowedIds: [ana] })).toMatchObject({ allow: false })
    expect(decideComputerUse({ persona: privatePersona, computer: personalPc, commanderId: '', allowedIds: [''] })).toMatchObject({ allow: false })
  })
})

describe('kind-comes-from-computer-not-persona (D2 req. 1)', () => {
  it('toda instalação nasce personal; só o registro de cadastro feito NA máquina vira team', () => {
    expect(readComputerKind(undefined)).toBe('personal')
    expect(readComputerKind({})).toBe('personal')
    expect(readComputerKind({ enrolledAsTeam: true, confirmedByComputerOwner: true, confirmedByTeamOwner: true })).toBe('team')
  })
  it('sem os dois consentimentos, ou com lixo, continua personal (um roster forjado não muda o tipo)', () => {
    expect(readComputerKind({ enrolledAsTeam: true })).toBe('personal')
    expect(readComputerKind({ enrolledAsTeam: true, confirmedByComputerOwner: true })).toBe('personal')
    expect(readComputerKind({ kind: 'team' } as never)).toBe('personal')
    expect(readComputerKind({ enrolledAsTeam: 'yes' } as never)).toBe('personal')
  })
})

describe('team-persona-never-personal-pc: pelo host, não só pela tela (D2 req. 4)', () => {
  it('createPersona/updatePersona recusam audience team + computerUse + casa pessoal', () => {
    expect(validatePersonaComputerConfig({ persona: teamPersona, home: personalPc })).toMatchObject({ ok: false, reason: 'team-persona-on-personal-pc' })
    expect(validatePersonaComputerConfig({ persona: teamPersona, home: teamPc })).toEqual({ ok: true })
    expect(validatePersonaComputerConfig({ persona: privatePersona, home: personalPc })).toEqual({ ok: true })
    expect(validatePersonaComputerConfig({ persona: privatePersona, home: teamPc })).toMatchObject({ ok: false, reason: 'private-persona-on-team-pc' })
  })
  it('team SEM computerUse em PC pessoal segue aceito pelo contrato do D-116 (conversa, sem mexer)', () => {
    expect(validatePersonaComputerConfig({ persona: { ...teamPersona, computerUse: false }, home: personalPc })).toEqual({ ok: true })
  })
  it('ficha adulterada (audience team) rodando num PC pessoal é recusada pelo EXECUTOR mesmo assim', () => {
    const forged = { ...privatePersona, audience: 'team' as const }
    expect(decideComputerUse({ persona: forged, computer: personalPc, commanderId: ana, allowedIds: [ana] })).toMatchObject({ allow: false, reason: 'team-persona-on-personal-pc' })
  })
  it('casa forjada: o executor lê o PC local, não a casa que a persona declara', () => {
    const guard = createComputerScopeGuard({
      persona: () => teamPersona,
      computer: () => personalPc, // o que a MÁQUINA guarda
      allowedIds: () => [ana, bia],
    })
    expect(guard.check(bia)).toMatchObject({ allow: false, reason: 'team-persona-on-personal-pc' })
  })
})

describe('recheck-every-step (D2 req. 2)', () => {
  it('muda o tipo, a permissão ou a lista no passo 3: o 4 recusa', () => {
    let computer: ComputerDescriptor = teamPc
    let persona = teamPersona
    let allowed: string[] = [bia]
    const guard = createComputerScopeGuard({ persona: () => persona, computer: () => computer, allowedIds: () => allowed })
    expect(guard.check(bia)).toEqual({ allow: true })
    expect(guard.check(bia)).toEqual({ allow: true })
    expect(guard.check(bia)).toEqual({ allow: true })
    allowed = []
    expect(guard.check(bia)).toMatchObject({ allow: false, reason: 'commander-not-allowed' })
    allowed = [bia]
    persona = { ...teamPersona, computerUse: false }
    expect(guard.check(bia)).toMatchObject({ allow: false, reason: 'computer-use-off' })
    persona = teamPersona
    computer = { ...teamPc, teamComputerUse: false }
    expect(guard.check(bia)).toMatchObject({ allow: false, reason: 'team-computer-not-enabled' })
  })
  it('se a leitura falha (lança), o passo é recusado, nunca permitido', () => {
    const guard = createComputerScopeGuard({
      persona: () => {
        throw new Error('store fora')
      },
      computer: () => teamPc,
      allowedIds: () => [bia],
    })
    expect(guard.check(bia)).toMatchObject({ allow: false, reason: 'unreadable' })
  })
})

describe('move-resets-computer-use (D2 req. 3, D-116 "Levar")', () => {
  it('trocar o computador de casa zera computerUse até o dono do novo ligar de novo', () => {
    expect(personaAfterMove(teamPersona).computerUse).toBe(false)
    expect(personaAfterMove(privatePersona).computerUse).toBe(false)
    expect(personaAfterMove(teamPersona).id).toBe('p2')
  })
})

describe('cadastro como computador da equipe (D5): exclusão mútua', () => {
  it('um PC com persona "Só eu" com computerUse ligado NÃO vira da equipe sem desligar antes', () => {
    expect(canEnrollComputerAsTeam({ personasHere: [privatePersona] })).toMatchObject({ ok: false, reason: 'private-computer-persona-on' })
    expect(canEnrollComputerAsTeam({ personasHere: [{ ...privatePersona, computerUse: false }] })).toEqual({ ok: true })
    expect(canEnrollComputerAsTeam({ personasHere: [] })).toEqual({ ok: true })
  })
})

describe('placement matrix (exhaustive): validatePersonaComputerConfig, 24 células (Flint 15:39 + Lumen 15:15)', () => {
  type Expected = true | 'invalid' | 'private-persona-on-team-pc' | 'not-owner' | 'team-persona-on-personal-pc'
  const audiences = ['private', 'team'] as const
  const uses = [true, false] as const
  const kinds = ['personal', 'team', 'vps'] as const // vps = tipo desconhecido
  const owners = ['creator', 'other'] as const

  const expected = (audience: 'private' | 'team', use: boolean, kind: string, owner: 'creator' | 'other'): Expected => {
    if (kind !== 'personal' && kind !== 'team') return 'invalid'
    if (audience === 'private') {
      if (kind !== 'personal') return 'private-persona-on-team-pc'
      return owner === 'creator' ? true : 'not-owner'
    }
    // da equipe: desligado = ok em qualquer PC (só não mexe); ligado + PC pessoal = recusado
    if (!use) return true
    return kind === 'personal' ? 'team-persona-on-personal-pc' : true
  }

  for (const audience of audiences) {
    for (const use of uses) {
      for (const kind of kinds) {
        for (const owner of owners) {
          it(`${audience} · computerUse ${String(use)} · PC ${kind} · dono ${owner}`, () => {
            const persona: ComputerUsePersona = { id: 'px', audience, creatorId: ana, homeComputerId: 'pcA', computerUse: use }
            const home = { computerId: 'pcA', kind, ownerId: owner === 'creator' ? ana : bia, teamComputerUse: true } as unknown as ComputerDescriptor
            const want = expected(audience, use, kind, owner)
            const got = validatePersonaComputerConfig({ persona, home })
            if (want === true) expect(got).toEqual({ ok: true })
            else expect(got).toMatchObject({ ok: false, reason: want })
          })
        }
      }
    }
  }
})

describe('not-home / missing-home (Lumen P1): a persona só mexe no computador onde ela MORA', () => {
  it('persona da equipe com casa no PC B, executada no PC C (da equipe, com capacidade ligada): negada', () => {
    const pcC: ComputerDescriptor = { computerId: 'pcC', kind: 'team', ownerId: ana, teamComputerUse: true }
    const homedAtB: ComputerUsePersona = { ...teamPersona, homeComputerId: 'pcB' }
    expect(decideComputerUse({ persona: homedAtB, computer: pcC, commanderId: bia, allowedIds: [bia] })).toMatchObject({ allow: false, reason: 'not-home' })
  })
  it('Só eu com casa em outro PC pessoal do mesmo dono: negada', () => {
    const other: ComputerDescriptor = { ...personalPc, computerId: 'pcZ' }
    expect(decideComputerUse({ persona: privatePersona, computer: other, commanderId: ana, allowedIds: [] })).toMatchObject({ allow: false, reason: 'not-home' })
  })
  it('missing-home-denied: casa da persona ou id do computador ausentes/vazios = falha fechada, antes da lista', () => {
    const noHome = { ...teamPersona, homeComputerId: '' } as ComputerUsePersona
    const noId = { ...teamPc, computerId: '' } as ComputerDescriptor
    expect(decideComputerUse({ persona: noHome, computer: teamPc, commanderId: bia, allowedIds: [bia] })).toMatchObject({ allow: false, reason: 'not-home' })
    expect(decideComputerUse({ persona: teamPersona, computer: noId, commanderId: bia, allowedIds: [bia] })).toMatchObject({ allow: false, reason: 'not-home' })
    const undef = { ...teamPersona, homeComputerId: undefined } as unknown as ComputerUsePersona
    expect(decideComputerUse({ persona: undef, computer: teamPc, commanderId: bia, allowedIds: [bia] })).toMatchObject({ allow: false, reason: 'not-home' })
  })
  it('not-home vem ANTES da lista: comandante fora da lista num PC errado recebe not-home, não commander-not-allowed', () => {
    const pcC: ComputerDescriptor = { computerId: 'pcC', kind: 'team', ownerId: ana, teamComputerUse: true }
    expect(decideComputerUse({ persona: teamPersona, computer: pcC, commanderId: cai, allowedIds: [] })).toMatchObject({ allow: false, reason: 'not-home' })
  })
})

describe('propriedade (Lumen P3): nenhuma mudança que RESTRINGE vira deny -> allow; lixo nunca permite nem quebra', () => {
  const base = { persona: teamPersona, computer: teamPc, commanderId: bia, allowedIds: [bia] as readonly string[] }
  it('desligar computerUse, tirar o comandante, trocar para pessoal ou apagar o registro: sempre deny', () => {
    expect(decideComputerUse(base)).toEqual({ allow: true })
    const restricted = [
      { ...base, persona: { ...teamPersona, computerUse: false } },
      { ...base, allowedIds: [] },
      { ...base, computer: { ...teamPc, kind: 'personal' as const } },
      { ...base, computer: undefined as unknown as ComputerDescriptor },
      { ...base, persona: undefined as unknown as ComputerUsePersona },
      { ...base, computer: { ...teamPc, teamComputerUse: false } },
    ]
    for (const r of restricted) expect(decideComputerUse(r).allow).toBe(false)
  })
  it('allowedIds com itens não-string não quebra e não permite', () => {
    const junk = [1, null, undefined, {}, ['bia']] as unknown as string[]
    expect(decideComputerUse({ ...base, allowedIds: junk })).toMatchObject({ allow: false })
    expect(decideComputerUse({ ...base, allowedIds: 'bia' as unknown as string[] })).toMatchObject({ allow: false })
    expect(decideComputerUse({ ...base, allowedIds: [...junk, bia] })).toEqual({ allow: true })
  })
})
