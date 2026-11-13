// DESTINO: packages/persona/persona-host/tests/station-store-recovery.spec.ts
// Contrato: marco-dogfood-estacao.md §2.6 e marco-dogfood-onde-roda-computadores.md §0 (campos aditivos do station.json).
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { STATION_FILE, loadStationState, saveStationState } from '../src/station/station-store.ts'

const dir = (): string => mkdtempSync(join(tmpdir(), 'station-'))

describe('M4: station.json ganha campos aditivos sem quebrar o arquivo antigo', () => {
  it('o arquivo antigo continua lido exatamente como antes', () => {
    const root = dir()
    writeFileSync(join(root, STATION_FILE), JSON.stringify({ paired: true, running: false }))
    expect(loadStationState(root)).toEqual({ paired: true, running: false })
  })

  it('quedas, última subida, pausa por queda e equipe sobrevivem ao reinício', () => {
    const root = dir()
    const state = { paired: true, running: false, crashes: 5, lastStartAt: 1_762_900_000_000, pausedBy: 'queda' as const, team: { workspaceId: 'ws', computerId: 'pc1' } }
    saveStationState(root, state)
    expect(loadStationState(root)).toEqual(state)
  })

  it('valor inválido nos campos novos é ignorado, nunca religa nem desliga a equipe por engano', () => {
    const root = dir()
    writeFileSync(join(root, STATION_FILE), JSON.stringify({ paired: true, running: true, crashes: -3, lastStartAt: 'ontem', pausedBy: 'outro', team: { workspaceId: 1 } }))
    expect(loadStationState(root)).toEqual({ paired: true, running: true })
  })
})
