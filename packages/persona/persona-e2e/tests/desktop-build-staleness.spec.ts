/**
 * O lançamento DEV do desktop (`pnpm start:desktop` = `tsx scripts/dev.ts --skip-build`) roda o `apps/desktop/lib/main.js` JÁ CONSTRUÍDO e não reconstrói (Rivet 12/11 13:29: o main tinha 8 dias, não tinha o pino de
 * tema, o teste "light" lia escuro e o "dark" passava de brinde). O harness agora RECUSA provar algo sobre um main velho: veredito puro e provado nos dois lados.
 */
import { describe, expect, it } from 'vitest'
import { desktopBuildProblems } from '../src/desktop-host.ts'

const HOUR = 3_600_000
const BUILT = Date.parse('2026-11-12T10:00:00.000Z')

describe('desktop dev launch x build velho', () => {
  it('um main mais novo que o código (ou dentro de 1 min dele) passa', () => {
    expect(desktopBuildProblems(BUILT, BUILT - HOUR)).toEqual([])
    expect(desktopBuildProblems(BUILT, BUILT + 30_000)).toEqual([])
  })

  it('um main MAIS VELHO que o código é acusado, com a data dos dois e o comando que conserta', () => {
    const problems = desktopBuildProblems(BUILT - 8 * 24 * HOUR, BUILT)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('VELHO')
    expect(problems[0]).toContain('pnpm --filter @deepseek-ai/dsh-desktop run build')
    expect(problems[0]).toContain('2026-11-04')
  })

  it('sem lib/main.js não há o que provar', () => {
    expect(desktopBuildProblems(undefined, BUILT)).toHaveLength(1)
  })
})
