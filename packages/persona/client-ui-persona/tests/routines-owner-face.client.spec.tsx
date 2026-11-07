// @vitest-environment jsdom
// D-069 (Muse 07/11): uma persona nunca é uma letra. Na lista "Suas rotinas" a rotina do SISTEMA (dono = a Coordenação, sem persona) desenhava um quadrado com a letra "C"
// (visto no shell real do lib 6: 6 vezes com o seed de dev e 1 vez numa instalação limpa, a "Resumo da manhã"): agora leva o ícone da equipe, o mesmo da Caixa de
// Aprovações para ator de sistema; a rotina de uma persona com retrato continua com o rosto dela.
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { pt as routinesPt } from '../src/client/locale/routines/locales.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { RoutinesView, type RoutineRow } from '../src/client/routines/RoutinesView.tsx'

installPreviewTheme()
afterEach(() => { cleanup() })

const SYSTEM: RoutineRow = { id: 'r1', name: 'Resumo da manhã', prompt: 'Resumir a manhã', rrule: 'FREQ=DAILY;BYHOUR=9;BYMINUTE=0', projectId: 'proj', paused: false, system: true }
const WITH_FACE: RoutineRow = { id: 'r2', name: 'Resumo das vendas', prompt: 'Resumir as vendas', rrule: 'FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0', projectId: 'proj', paused: false, ownerPersonaId: 'p-nina', ownerName: 'Nina', ownerAvatarSrc: 'nina-face.png' }

function mount(rows: readonly RoutineRow[]): readonly HTMLElement[] {
  render(<PreviewFrame brandLabel="Persona"><RoutinesView dict={routinesPt} routineRows={rows} /></PreviewFrame>)
  return [...document.querySelectorAll<HTMLElement>('#routines-list-heading ~ ul > li')]
}

describe('Rotinas: quem é dono da rotina nunca é uma letra (D-069)', () => {
  it('rotina do sistema (dono = Coordenação, sem persona): o ícone da equipe, sem iniciais e sem imagem', () => {
    const [row] = mount([SYSTEM])
    expect(row).toBeDefined()
    expect(row!.querySelector('[data-icon]')).not.toBeNull()
    expect(row!.querySelector('[data-tone]')).toBeNull()
    expect(row!.querySelector('img')).toBeNull()
    expect(row!.textContent).toContain('Coordenação')
  })

  it('rotina de uma persona com retrato: o rosto dela, nunca o ícone nem as iniciais', () => {
    const [row] = mount([WITH_FACE])
    expect(row).toBeDefined()
    expect(row!.querySelector('img[src="nina-face.png"]')).not.toBeNull()
    expect(row!.querySelector('[data-icon]')).toBeNull()
    expect(row!.querySelector('[data-tone]')).toBeNull()
  })
})
