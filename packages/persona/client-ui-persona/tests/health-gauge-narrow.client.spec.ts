// Muse (D-089 d): at 200% zoom the health meter stacks ABOVE the title instead of squeezing the sentence beside it.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(join(__dirname, '..', 'src', 'client', 'primitives', 'Governance.module.css'), 'utf8').replace(/\r\n/gu, '\n')

describe('Saúde: o medidor empilha acima do título quando a janela é estreita', () => {
  it('a ≤ 520 px o cartão vira coluna e o medidor fica centrado em cima', () => {
    const block = /@media \(max-width: 520px\) \{([\s\S]*?)\n\}\n/u.exec(css)?.[1] ?? ''
    expect(block).toMatch(/\.score\s*\{[^}]*flex-direction:\s*column/u)
    expect(block).toMatch(/\.gauge\s*\{[^}]*align-self:\s*center/u)
  })

  it('o medidor vem ANTES do título no DOM (a ordem de leitura é a mesma da tela empilhada)', () => {
    const tsx = readFileSync(join(__dirname, '..', 'src', 'client', 'primitives', 'Governance.tsx'), 'utf8')
    expect(tsx.indexOf('<HealthGauge')).toBeLessThan(tsx.indexOf('styles.scoreText'))
  })
})
