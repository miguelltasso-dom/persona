import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { chromium } from 'playwright'
import { REPO_ROOT } from '../src/paths.ts'
import { PREVIEW_TARGETS, capturePreviewPage } from '../src/preview-capture.ts'
import { comparePngFiles, writeDiffPng } from '../src/visual-diff/png-compare.ts'
import { ensureBaseline } from '../src/visual-diff/baseline.ts'
import { writeVisualDiffReport, type VisualDiffRow } from '../src/visual-diff/html-report.ts'
import { checkReducedMotion, checkJank } from '../src/motion-jank.ts'
import { scanAccessibility } from '../src/axe-check.ts'

const runPersonaE2e = process.env.PERSONA_E2E === '1'
const VIEWPORT = { width: 1280, height: 720 }
const REFERENCE = join(REPO_ROOT, 'persona-assets', 'references', 'dirD-tela.png')

describe.skipIf(!runPersonaE2e)('persona-e2e preview visual + motion (Prism/Lumen fixtures)', () => {
  it('captures previews, diffs baseline + dirD reference, motion/jank, optional axe', async () => {
    expect(existsSync(REFERENCE)).toBe(true)
    const browser = await chromium.launch({ channel: 'chrome' })
    const page = await browser.newPage()
    const rows: VisualDiffRow[] = []
    try {
      for (const target of PREVIEW_TARGETS) {
        const actualPath = await capturePreviewPage(page, target, VIEWPORT)
        const baseline = ensureBaseline(target, actualPath)
        const baselineCmp = await comparePngFiles(page, actualPath, baseline, {
          ...VIEWPORT,
          maxDiffRatio: 0.02,
        })
        const refCmp = await comparePngFiles(page, actualPath, REFERENCE, {
          ...VIEWPORT,
          maxDiffRatio: 0.62,
        })
        const row: VisualDiffRow = {
          id: target,
          actualPath,
          baselinePath: baseline,
          referencePath: REFERENCE,
          baselineDiffRatio: baselineCmp.diffRatio,
          baselinePass: baselineCmp.pass,
          referenceDiffRatio: refCmp.diffRatio,
          referencePass: refCmp.pass,
        }
        if (baselineCmp.diffPngBase64 !== undefined) {
          row.diffOverlayPath = writeDiffPng(actualPath, baselineCmp.diffPngBase64)
        }
        rows.push(row)
        expect(baselineCmp.pass, `${target} baseline drift`).toBe(true)
      }
      const reportPath = await writeVisualDiffReport(rows)
      expect(existsSync(reportPath)).toBe(true)

      const motion = await checkReducedMotion(page)
      expect(motion.pass).toBe(true)

      const jank = await checkJank(page)
      expect(jank.pass).toBe(true)

      await capturePreviewPage(page, 'prism-onboarding', VIEWPORT)
      const axe = await scanAccessibility(page)
      if (!axe.skipped) expect(axe.pass).toBe(true)
    } finally {
      await browser.close()
    }
  }, 180_000)
})
