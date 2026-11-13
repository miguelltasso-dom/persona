// DESTINO (após "candidato validado"): packages/persona/persona-host/tests/pairing-lock-persist.spec.ts
// Contrato: persona-spec/contracts/marco-dogfood-onde-roda-computadores.md §3.5; requisitos da Lumen (.maestri/tmp/lumen/marco/m5-seguranca-requisitos.md §B).
// VERMELHO: PairingBook guarda misses/lockedUntil só na RAM; falta o `store` (disco) e a regra "5 erros queimam o código".
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MAX_REDEEMS_PER_HOUR, PAIRING_LOCK_MS, PAIRING_MAX_MISSES, PairingBook } from '../src/station/pairing.ts'
import { LOCK_FILE, fileLockStore } from '../src/station/pairing-lock-store.ts'

function book(dir: string, clock: { now: number }): PairingBook {
  return new PairingBook({ now: () => clock.now, store: fileLockStore(dir) })
}

describe('M4/M5: a trava do código de pareamento vive no disco', () => {
  it('reiniciar o host no meio das tentativas não zera a contagem', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pair-'))
    const clock = { now: Date.parse('2026-11-12T03:00:00.000Z') }
    const first = book(dir, clock)
    first.issue()
    for (let index = 0; index < PAIRING_MAX_MISSES - 1; index += 1) expect(first.redeem('AAAA-AAAA')).toBe('invalido')
    const again = book(dir, clock) // queda e reinício
    expect(again.redeem('AAAA-AAAA')).toBe('invalido') // a 5ª errada, contada em cima das 4 de antes
    expect(again.redeem('AAAA-AAAA')).toBe('bloqueado')
  })

  it('5 erros queimam o código: o certo depois disso não entra, nem depois do reinício', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pair-'))
    const clock = { now: Date.parse('2026-11-12T03:00:00.000Z') }
    const first = book(dir, clock)
    const { code } = first.issue()
    for (let index = 0; index < PAIRING_MAX_MISSES; index += 1) first.redeem('BBBB-BBBB')
    clock.now += PAIRING_LOCK_MS + 1 // a trava passou
    expect(first.redeem(code)).not.toBe('ok')
    expect(book(dir, clock).redeem(code)).not.toBe('ok')
  })

  it('o bloqueio dura o mesmo depois do reinício e um código novo do dono o destrava', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pair-'))
    const clock = { now: Date.parse('2026-11-12T03:00:00.000Z') }
    const first = book(dir, clock)
    first.issue()
    for (let index = 0; index < PAIRING_MAX_MISSES; index += 1) first.redeem('CCCC-CCCC')
    const again = book(dir, clock)
    expect(again.redeem('CCCC-CCCC')).toBe('bloqueado')
    const fresh = again.issue()
    expect(again.redeem(fresh.code)).toBe('ok')
  })

  it('o código nunca é gravado: nem ele, nem o hash dele, em nenhum arquivo da trava', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pair-'))
    const clock = { now: Date.parse('2026-11-12T03:00:00.000Z') }
    const first = book(dir, clock)
    const { code } = first.issue()
    first.redeem('DDDD-DDDD')
    const raw = code.replace('-', '')
    for (const name of readdirSync(dir)) {
      const text = readFileSync(join(dir, name), 'utf8')
      expect(text).not.toContain(raw)
      expect(text).not.toContain(code)
    }
  })

  it('no máximo 5 códigos vivos: o 6º invalida o mais antigo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pair-'))
    const clock = { now: Date.parse('2026-11-12T03:00:00.000Z') }
    const pairing = book(dir, clock)
    const codes = Array.from({ length: 6 }, () => pairing.issue().code)
    expect(pairing.pending()).toBe(5)
    expect(pairing.redeem(codes[0]!)).toBe('invalido')
    expect(pairing.redeem(codes[5]!)).toBe('ok')
  })

  it('no máximo 10 resgates por hora, mesmo com códigos certos', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pair-'))
    const clock = { now: Date.parse('2026-11-12T03:00:00.000Z') }
    const pairing = book(dir, clock)
    for (let index = 0; index < MAX_REDEEMS_PER_HOUR; index += 1) expect(pairing.redeem(pairing.issue().code)).toBe('ok')
    expect(pairing.redeem(pairing.issue().code)).toBe('bloqueado')
    const restarted = book(dir, clock)
    expect(restarted.redeem(restarted.issue().code)).toBe('bloqueado') // o teto também sobrevive ao reinício
    clock.now += 60 * 60_000 + 1
    const later = book(dir, clock)
    expect(later.redeem(later.issue().code)).toBe('ok')
  })

  it('arquivo da trava ilegível vale como trava cheia (falha fechada), nunca como zerada', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pair-'))
    const clock = { now: Date.parse('2026-11-12T03:00:00.000Z') }
    writeFileSync(join(dir, LOCK_FILE), '{{{ lixo')
    const damaged = new PairingBook({ now: () => clock.now, store: fileLockStore(dir) })
    expect(damaged.redeem('EEEE-EEEE')).toBe('bloqueado')
  })
})
