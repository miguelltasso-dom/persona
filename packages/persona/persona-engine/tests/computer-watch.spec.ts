// M9 / Atlas 15:36: (1) o ao vivo transmite SÓ o recorte da janela ativa da persona, nunca a tela inteira; (2) só assiste quem pode
// pedir coisas à persona (MESMA matriz do computer-scope); campo de senha sempre coberto. VERMELHO primeiro: ../src/computer-watch.ts.
import { describe, expect, it } from 'vitest'
import { createWatchGate, decideWatch, planWatchFrame, type Rect } from '../src/computer-watch.ts'
import type { ComputerDescriptor, ComputerUsePersona } from '../src/computer-scope.ts'

const ana = 'ana'
const bia = 'bia'
const cai = 'cai'
const teamPersona: ComputerUsePersona = { id: 'p2', audience: 'team', creatorId: ana, homeComputerId: 'pcA', computerUse: true }
const privatePersona: ComputerUsePersona = { id: 'p1', audience: 'private', creatorId: ana, homeComputerId: 'pcA', computerUse: true }
const teamPc: ComputerDescriptor = { computerId: 'pcA', kind: 'team', ownerId: ana, teamComputerUse: true }
const personalPc: ComputerDescriptor = { computerId: 'pcA', kind: 'personal', ownerId: ana, teamComputerUse: false }

const screen = { w: 1920, h: 1080 }
const notepad: Rect = { x: 400, y: 200, w: 800, h: 600 }

describe('só assiste quem pode pedir coisas à persona (regra 2)', () => {
  it('persona da equipe: quem está em "Quem pode usar" assiste; quem não está, não', () => {
    expect(decideWatch({ persona: teamPersona, computer: teamPc, viewerId: bia, allowedIds: [bia] })).toEqual({ allow: true })
    expect(decideWatch({ persona: teamPersona, computer: teamPc, viewerId: cai, allowedIds: [bia] })).toMatchObject({ allow: false, reason: 'commander-not-allowed' })
  })
  it('Só eu: só o dono assiste (colaborador na lista não conta)', () => {
    expect(decideWatch({ persona: privatePersona, computer: personalPc, viewerId: ana, allowedIds: [] })).toEqual({ allow: true })
    expect(decideWatch({ persona: privatePersona, computer: personalPc, viewerId: bia, allowedIds: [bia] })).toMatchObject({ allow: false, reason: 'not-owner' })
  })
  it('a regra dura vale também para assistir: equipe em PC pessoal nunca transmite', () => {
    expect(decideWatch({ persona: teamPersona, computer: personalPc, viewerId: ana, allowedIds: [ana] })).toMatchObject({ allow: false, reason: 'team-persona-on-personal-pc' })
  })
  it('o portão reconfere A CADA quadro: lista muda ou aparelho revogado = cortado no quadro seguinte', () => {
    let allowed: string[] = [bia]
    let revoked = false
    const gate = createWatchGate({
      persona: () => teamPersona,
      computer: () => teamPc,
      allowedIds: () => allowed,
      deviceRevoked: () => revoked,
    })
    expect(gate.admit(bia)).toEqual({ allow: true })
    allowed = []
    expect(gate.admit(bia)).toMatchObject({ allow: false, reason: 'commander-not-allowed' })
    allowed = [bia]
    revoked = true
    expect(gate.admit(bia)).toMatchObject({ allow: false, reason: 'device-revoked' })
  })
  it('leitura que falha = ninguém assiste', () => {
    const gate = createWatchGate({
      persona: () => {
        throw new Error('fora')
      },
      computer: () => teamPc,
      allowedIds: () => [bia],
      deviceRevoked: () => false,
    })
    expect(gate.admit(bia)).toMatchObject({ allow: false, reason: 'unreadable' })
  })
})

describe('o ao vivo é o RECORTE da janela da persona (regra 1)', () => {
  it('devolve só o retângulo da janela alvo, nunca a tela inteira', () => {
    const plan = planWatchFrame({ screen, target: notepad, overlapping: [], passwordRects: [] })
    expect(plan).toEqual({ kind: 'crop', rect: notepad, masks: [] })
  })
  it('janela alvo parcialmente fora da tela: recorte limitado ao que está na tela', () => {
    const plan = planWatchFrame({ screen, target: { x: 1700, y: 900, w: 500, h: 400 }, overlapping: [], passwordRects: [] })
    expect(plan).toEqual({ kind: 'crop', rect: { x: 1700, y: 900, w: 220, h: 180 }, masks: [] })
  })
  it('sem janela alvo, ou fora da tela, ou tamanho inválido: quadro COBERTO por inteiro, nunca a área de trabalho', () => {
    expect(planWatchFrame({ screen, target: undefined, overlapping: [], passwordRects: [] })).toMatchObject({ kind: 'covered', reason: 'no-target-window' })
    expect(planWatchFrame({ screen, target: { x: 3000, y: 0, w: 400, h: 300 }, overlapping: [], passwordRects: [] })).toMatchObject({ kind: 'covered', reason: 'target-offscreen' })
    expect(planWatchFrame({ screen, target: { x: 0, y: 0, w: 0, h: 300 }, overlapping: [], passwordRects: [] })).toMatchObject({ kind: 'covered', reason: 'invalid' })
    expect(planWatchFrame({ screen, target: { x: Number.NaN, y: 0, w: 10, h: 10 }, overlapping: [], passwordRects: [] })).toMatchObject({ kind: 'covered', reason: 'invalid' })
  })
  it('janela de OUTRO processo ou de zona proibida sobre o alvo: quadro coberto por inteiro e o passo pausa (Lumen D6)', () => {
    const over = planWatchFrame({ screen, target: notepad, overlapping: [{ rect: { x: 500, y: 300, w: 200, h: 100 }, kind: 'foreign' }], passwordRects: [] })
    expect(over).toMatchObject({ kind: 'covered', reason: 'foreign-window-over-target', pause: true })
    const forbidden = planWatchFrame({ screen, target: notepad, overlapping: [{ rect: { x: 0, y: 0, w: 1920, h: 1080 }, kind: 'forbidden' }], passwordRects: [] })
    expect(forbidden).toMatchObject({ kind: 'covered', reason: 'foreign-window-over-target', pause: true })
  })
  it('janela de outro processo que NÃO encosta no alvo não atrapalha (o recorte já a exclui)', () => {
    const plan = planWatchFrame({ screen, target: notepad, overlapping: [{ rect: { x: 1300, y: 100, w: 400, h: 300 }, kind: 'foreign' }], passwordRects: [] })
    expect(plan).toMatchObject({ kind: 'crop', rect: notepad })
  })
  it('campo de senha SEMPRE coberto: máscara em coordenadas do recorte, limitada a ele', () => {
    const plan = planWatchFrame({
      screen,
      target: notepad,
      overlapping: [],
      passwordRects: [
        { x: 500, y: 300, w: 200, h: 30 }, // dentro
        { x: 1150, y: 750, w: 200, h: 100 }, // metade fora do recorte
        { x: 0, y: 0, w: 100, h: 100 }, // fora do recorte: some
      ],
    })
    expect(plan).toEqual({
      kind: 'crop',
      rect: notepad,
      masks: [
        { x: 100, y: 100, w: 200, h: 30 },
        { x: 750, y: 550, w: 50, h: 50 },
      ],
    })
  })
  it('entrada inválida de senha (NaN) cobre o quadro todo, não deixa passar sem máscara', () => {
    expect(planWatchFrame({ screen, target: notepad, overlapping: [], passwordRects: [{ x: Number.NaN, y: 0, w: 10, h: 10 }] })).toMatchObject({ kind: 'covered', reason: 'invalid' })
  })
})
