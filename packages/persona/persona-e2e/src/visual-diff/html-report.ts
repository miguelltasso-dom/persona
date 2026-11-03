import { writeFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { ARTIFACTS_DIR } from '../paths.ts'

export interface VisualDiffRow {
  id: string
  actualPath: string
  baselinePath: string
  referencePath?: string
  baselineDiffRatio: number
  baselinePass: boolean
  referenceDiffRatio?: number
  referencePass?: boolean
  diffOverlayPath?: string
}

/**
 * Write a simple HTML report under persona-e2e artifacts.
 * @param rows - comparison rows from a visual diff run.
 * @param reportName - filename without extension.
 */
export async function writeVisualDiffReport(rows: VisualDiffRow[], reportName = 'visual-diff-report'): Promise<string> {
  await mkdir(ARTIFACTS_DIR, { recursive: true })
  const out = join(ARTIFACTS_DIR, `${reportName}.html`)
  const body = rows.map(row => `
    <section>
      <h2>${row.id}</h2>
      <p>Baseline: ${row.baselinePass ? 'PASS' : 'FAIL'} (${(row.baselineDiffRatio * 100).toFixed(2)}% pixels differ)</p>
      ${row.referenceDiffRatio !== undefined
        ? `<p>Reference dirD: ${row.referencePass ? 'PASS' : 'FAIL'} (${(row.referenceDiffRatio * 100).toFixed(2)}% — loose layout bar)</p>`
        : ''}
      <div class="grid">
        <figure><figcaption>Actual</figcaption><img src="${toRel(out, row.actualPath)}" alt="actual" /></figure>
        <figure><figcaption>Baseline</figcaption><img src="${toRel(out, row.baselinePath)}" alt="baseline" /></figure>
        ${row.diffOverlayPath ? `<figure><figcaption>Diff</figcaption><img src="${toRel(out, row.diffOverlayPath)}" alt="diff" /></figure>` : ''}
      </div>
    </section>`).join('\n')
  writeFileSync(out, `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>Persona visual diff</title>
<style>
body{font-family:system-ui,sans-serif;margin:1.5rem;background:#faf3e4;color:#34243f}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1rem}
img{max-width:100%;border:1px solid #c8b8e8;border-radius:8px}
section{margin-bottom:2rem;padding-bottom:1rem;border-bottom:1px solid #e4d7f1}
</style></head><body><h1>Persona preview visual diff</h1>${body}</body></html>\n`, 'utf8')
  return out
}

function toRel(_reportPath: string, assetPath: string): string {
  const rel = assetPath.replace(/\\/g, '/')
  if (rel.startsWith('file:')) return rel
  return rel.split('/artifacts/').pop() ?? rel
}
